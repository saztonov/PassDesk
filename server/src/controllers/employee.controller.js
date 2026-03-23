import {
  Employee,
  Counterparty,
  User,
  Citizenship,
  Pass,
  File,
  UserEmployeeMapping,
  EmployeeCounterpartyMapping,
  Department,
  ConstructionSite,
  Position,
  Setting,
  Status,
  EmployeeStatusMapping,
  AuditLog,
} from "../models/index.js";
import { Op } from "sequelize";
import sequelize from "../config/database.js";
import storageProvider from "../config/storage.js";
import { buildEmployeeFilePath } from "../utils/transliterate.js";
import {
  checkEmployeeAccess,
  getAccessibleEmployeeIds,
} from "../utils/permissionUtils.js";
import { AppError } from "../middleware/errorHandler.js";
import EmployeeStatusService from "../services/employeeStatusService.js";
import {
  isEmployeeCardComplete,
  getMissingRequiredFields,
  DEFAULT_FORM_CONFIG,
} from "../utils/employeeFieldsConfig.js";
import {
  updateEmployeeStatusesByCompleteness,
  getImportStatuses,
} from "../utils/employeeStatusUpdater.js";
import {
  applyLegacySensitivePlaintextPolicy,
  buildEmployeeSensitiveFieldsPatch,
} from "../services/employeeSensitiveFieldService.js";
import {
  ENCRYPTED_EMPLOYEE_FIELDS,
  hashForSearch,
} from "../services/encryptionService.js";
import { enqueueSkudSyncForEmployee } from "../services/skud/SkudSyncService.js";
import { deleteEmployeeFromSkud } from "../services/skud/SkudCardsService.js";
import { isSkudEnabled } from "../services/skud/skudConfig.js";
import { issueSkudQrTokenForEmployeeActivePass } from "../services/skud/SkudQrService.js";
import {
  requiresEmployeeInMemorySort,
  sortEmployeesInMemory,
} from "../utils/employeeSorting.js";

// Опции для загрузки сотрудника с маппингами (для проверки прав)
const employeeAccessInclude = [
  {
    model: EmployeeCounterpartyMapping,
    as: "employeeCounterpartyMappings",
    include: [
      {
        model: Counterparty,
        as: "counterparty",
        attributes: ["id"],
      },
    ],
  },
];

const EMPLOYEE_UPDATE_ALLOWED_FIELDS = new Set([
  "firstName",
  "lastName",
  "middleName",
  "gender",
  "positionId",
  "citizenshipId",
  "birthCountryId",
  "birthDate",
  "inn",
  "snils",
  "kig",
  "passportNumber",
  "passportDate",
  "passportIssuer",
  "passportType",
  "passportExpiryDate",
  "kigEndDate",
  "registrationAddress",
  "patentNumber",
  "patentIssueDate",
  "blankNumber",
  "email",
  "phone",
  "bankAccountNumber",
  "insurancePolicyNumber",
  "insurancePolicyDate",
  "notes",
]);

const EMPLOYEE_ALLOWED_ROLES = new Set(["admin", "manager", "user"]);

const ensureEmployeeRoleAllowed = (userRole) => {
  if (!EMPLOYEE_ALLOWED_ROLES.has(userRole)) {
    throw new AppError("Недостаточно прав", 403);
  }
};

const filterEmployeeMutableFields = (
  payload = {},
  { normalizeEmptyString = false } = {},
) => {
  const sanitized = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (!EMPLOYEE_UPDATE_ALLOWED_FIELDS.has(key)) {
      return;
    }

    if (normalizeEmptyString && (value === "" || value === undefined)) {
      sanitized[key] = null;
      return;
    }

    sanitized[key] = value;
  });

  return sanitized;
};

const applyEmployeeSensitiveFieldEncryption = (payload = {}) => {
  const encryptionPatch = buildEmployeeSensitiveFieldsPatch(payload);
  const normalizedPayload = applyLegacySensitivePlaintextPolicy(payload);
  return {
    ...normalizedPayload,
    ...encryptionPatch,
  };
};

const normalizeDigitsSearch = (value = "") =>
  String(value || "").replace(/[^\d]/g, "");

const normalizeTextSearch = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const resolveTargetCounterpartyIdForEmployeeMapping = async (
  user,
  employee,
) => {
  const defaultCounterpartyId = await Setting.getSetting(
    "default_counterparty_id",
  );

  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];

  const activeMappings = mappings.filter((mapping) => !mapping?.dismissedAt);
  const preferredMapping =
    activeMappings.find((mapping) => mapping?.counterpartyId) ||
    mappings.find((mapping) => mapping?.counterpartyId) ||
    null;

  return (
    preferredMapping?.counterpartyId ||
    preferredMapping?.counterparty?.id ||
    user?.counterpartyId ||
    defaultCounterpartyId ||
    null
  );
};

const normalizeComparableEmployeeValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value;
};

const hasComparableValueChanged = (currentValue, nextValue) =>
  normalizeComparableEmployeeValue(currentValue) !==
  normalizeComparableEmployeeValue(nextValue);

const normalizeDocSearch = (value = "") =>
  String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-ZА-ЯЁ]/g, "");

const normalizeQueryArray = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeQueryArray(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      try {
        return normalizeQueryArray(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }

    return [trimmed];
  }

  return [String(value)];
};

const getEmployeeSearchSource = (employee) =>
  employee?.toJSON ? employee.toJSON() : employee || {};

const matchesEmployeeSearch = (employee, rawSearch) => {
  const normalizedSearchText = normalizeTextSearch(rawSearch);
  const normalizedDigitsSearchValue = normalizeDigitsSearch(rawSearch);
  const normalizedDocSearchValue = normalizeDocSearch(rawSearch);
  const searchTokens = normalizedSearchText
    ? normalizedSearchText.split(" ").filter(Boolean)
    : [];

  const hasTextQuery = normalizedSearchText.length > 0;
  const hasDigitsQuery = normalizedDigitsSearchValue.length > 0;
  const hasDocQuery = normalizedDocSearchValue.length > 0;

  if (!hasTextQuery && !hasDigitsQuery && !hasDocQuery) {
    return true;
  }

  const source = getEmployeeSearchSource(employee);
  const firstName = normalizeTextSearch(source.firstName);
  const lastName = normalizeTextSearch(source.lastName);
  const middleName = normalizeTextSearch(source.middleName);
  const positionName = normalizeTextSearch(source.position?.name);
  const fullName = normalizeTextSearch(
    [source.lastName, source.firstName, source.middleName]
      .filter(Boolean)
      .join(" "),
  );

  const isTextMatch =
    hasTextQuery &&
    (firstName.includes(normalizedSearchText) ||
      lastName.includes(normalizedSearchText) ||
      middleName.includes(normalizedSearchText) ||
      fullName.includes(normalizedSearchText) ||
      positionName.includes(normalizedSearchText) ||
      searchTokens.every((token) => fullName.includes(token)));

  const isDigitsMatch =
    hasDigitsQuery &&
    (normalizeDigitsSearch(source.inn).includes(normalizedDigitsSearchValue) ||
      normalizeDigitsSearch(source.snils).includes(
        normalizedDigitsSearchValue,
      ) ||
      normalizeDigitsSearch(source.phone).includes(
        normalizedDigitsSearchValue,
      ) ||
      normalizeDigitsSearch(source.passportNumber).includes(
        normalizedDigitsSearchValue,
      ) ||
      normalizeDigitsSearch(source.patentNumber).includes(
        normalizedDigitsSearchValue,
      ) ||
      normalizeDigitsSearch(source.kig).includes(normalizedDigitsSearchValue));

  const isDocumentExact =
    hasDocQuery &&
    (normalizeDocSearch(source.passportNumber) === normalizedDocSearchValue ||
      normalizeDocSearch(source.kig) === normalizedDocSearchValue ||
      normalizeDocSearch(source.patentNumber) === normalizedDocSearchValue);

  return isTextMatch || isDigitsMatch || isDocumentExact;
};

const matchesEmployeeStatusFilter = (employee, requestedStatuses = []) => {
  if (!requestedStatuses.length) {
    return true;
  }

  const source = getEmployeeSearchSource(employee);
  const statusMappings = source.statusMappings || [];

  const getStatusByGroup = (group, alternativeGroups = []) => {
    const groupsToCheck = [group, ...alternativeGroups];
    const mapping = statusMappings.find((item) => {
      const mappingGroup = item.statusGroup || item.status_group;

      return groupsToCheck.includes(mappingGroup) && item.isActive !== false;
    });

    return mapping?.status?.name || mapping?.Status?.name || null;
  };

  const secureStatus = getStatusByGroup("status_secure");
  const activeStatus = getStatusByGroup("status_active");
  const cardStatus = getStatusByGroup("status_card", ["card draft"]);
  const mainStatus = getStatusByGroup("status", ["draft"]);

  const isBlocked =
    secureStatus === "status_secure_block" ||
    secureStatus === "status_secure_block_compl";
  const isFired =
    activeStatus === "status_active_fired" ||
    activeStatus === "status_active_fired_compl";
  const isInactive = activeStatus === "status_active_inactive";
  const isDraft =
    cardStatus === "status_card_draft" || mainStatus === "status_draft";
  const isEdited = hrStatus === "status_hr_edited";
  const isFiredOff = hrStatus === "status_hr_fired_off";
  const isActive =
    !isBlocked &&
    !isFired &&
    !isInactive &&
    !isDraft &&
    (mainStatus === "status_new" ||
      mainStatus === "status_tb_passed" ||
      mainStatus === "status_processed");

  return requestedStatuses.some((value) => {
    if (value === "blocked") {
      return isBlocked;
    }

    if (value === "fired") {
      return isFired;
    }

    if (value === "inactive") {
      return isInactive;
    }

    if (value === "edited") {
      return isEdited;
    }

    if (value === "fired_off") {
      return isFiredOff;
    }

    if (value === "draft") {
      return isDraft;
    }

    if (value === "active") {
      return isActive;
    }

    return false;
  });
};

const buildActiveStatusExistsSql = (statusNames, statusGroups) => {
  const namesSql = statusNames.map((value) => `'${value}'`).join(", ");
  const groupsSql = statusGroups.map((value) => `'${value}'`).join(", ");

  return `EXISTS (
    SELECT 1
    FROM employees_statuses_mapping esm
    JOIN statuses s ON s.id = esm.status_id
    WHERE esm.employee_id = "Employee"."id"
      AND esm.is_active IS NOT FALSE
      AND esm.status_group IN (${groupsSql})
      AND s.name IN (${namesSql})
  )`;
};

const buildEmployeeStatusSqlPredicate = (requestedStatuses = []) => {
  if (!requestedStatuses.length) {
    return null;
  }

  const blockedSql = buildActiveStatusExistsSql(
    ["status_secure_block", "status_secure_block_compl"],
    ["status_secure"],
  );
  const firedSql = buildActiveStatusExistsSql(
    ["status_active_fired", "status_active_fired_compl"],
    ["status_active"],
  );
  const inactiveSql = buildActiveStatusExistsSql(
    ["status_active_inactive"],
    ["status_active"],
  );
  const editedSql = buildActiveStatusExistsSql(
    ["status_hr_edited"],
    ["status_hr"],
  );
  const firedOffSql = buildActiveStatusExistsSql(
    ["status_hr_fired_off"],
    ["status_hr"],
  );
  const draftSql = `(
    (
      ${buildActiveStatusExistsSql(["status_card_draft"], ["status_card", "card draft"])}
      OR
      ${buildActiveStatusExistsSql(["status_draft"], ["status", "draft"])}
    )
    AND NOT ${firedSql}
    AND NOT ${blockedSql}
    AND NOT ${inactiveSql}
  )`;
  const activeSql = `(
    ${buildActiveStatusExistsSql(
      ["status_new", "status_tb_passed", "status_processed"],
      ["status"],
    )}
    AND NOT ${blockedSql}
    AND NOT ${firedSql}
    AND NOT ${inactiveSql}
    AND NOT ${draftSql}
  )`;

  const predicates = requestedStatuses
    .map((value) => {
      if (value === "blocked") return blockedSql;
      if (value === "fired") return firedSql;
      if (value === "inactive") return inactiveSql;
      if (value === "edited") return editedSql;
      if (value === "fired_off") return firedOffSql;
      if (value === "draft") return draftSql;
      if (value === "active") return activeSql;
      return null;
    })
    .filter(Boolean);

  if (!predicates.length) {
    return null;
  }

  return `(${predicates.join(" OR ")})`;
};

const buildEmployeeUploadSqlPredicate = (requestedUploadFilters = []) => {
  if (!requestedUploadFilters.length) {
    return null;
  }

  const hasActiveStatusesSql = `EXISTS (
    SELECT 1
    FROM employees_statuses_mapping esm
    WHERE esm.employee_id = "Employee"."id"
      AND esm.is_active = true
  )`;

  const hasNotUploadedActiveStatusSql = `EXISTS (
    SELECT 1
    FROM employees_statuses_mapping esm
    WHERE esm.employee_id = "Employee"."id"
      AND esm.is_active = true
      AND COALESCE(esm.is_upload, false) = false
  )`;

  const uploadedSql = `(
    ${hasActiveStatusesSql}
    AND NOT ${hasNotUploadedActiveStatusSql}
  )`;

  const notUploadedSql = `(
    ${hasActiveStatusesSql}
    AND ${hasNotUploadedActiveStatusSql}
  )`;

  const predicates = requestedUploadFilters
    .map((value) => {
      if (value === "uploaded") return uploadedSql;
      if (value === "not_uploaded") return notUploadedSql;
      return null;
    })
    .filter(Boolean);

  if (!predicates.length) {
    return null;
  }

  return `(${predicates.join(" OR ")})`;
};

const buildEmployeeDuplicateChecks = (employeeLike = {}) => {
  const duplicateChecks = [];

  if (employeeLike.inn) {
    duplicateChecks.push({ inn: employeeLike.inn });
  }

  if (employeeLike.snils) {
    duplicateChecks.push({ snils: employeeLike.snils });
  }

  if (employeeLike.kigHash) {
    duplicateChecks.push({ kigHash: employeeLike.kigHash });
  }

  if (employeeLike.passportNumberHash) {
    duplicateChecks.push({
      passportNumberHash: employeeLike.passportNumberHash,
    });
  }

  return duplicateChecks;
};

const buildInnLookupEmployeePayload = (employee) => {
  const source = employee?.toJSON ? employee.toJSON() : employee || {};

  return {
    id: source.id,
    firstName: source.firstName || null,
    lastName: source.lastName || null,
    middleName: source.middleName || null,
    birthDate: source.birthDate || null,
    positionId: source.positionId || null,
    position: source.position
      ? {
          id: source.position.id,
          name: source.position.name,
        }
      : null,
    citizenship: source.citizenship
      ? {
          id: source.citizenship.id,
          name: source.citizenship.name,
          code: source.citizenship.code,
          requiresPatent: source.citizenship.requiresPatent,
        }
      : null,
    employeeCounterpartyMappings: Array.isArray(
      source.employeeCounterpartyMappings,
    )
      ? source.employeeCounterpartyMappings.map((mapping) => ({
          id: mapping.id,
          counterpartyId: mapping.counterpartyId,
          departmentId: mapping.departmentId,
          constructionSiteId: mapping.constructionSiteId,
          dismissedAt: mapping.dismissedAt || null,
          counterparty: mapping.counterparty
            ? {
                id: mapping.counterparty.id,
                name: mapping.counterparty.name,
                type: mapping.counterparty.type,
              }
            : null,
          department: mapping.department
            ? {
                id: mapping.department.id,
                name: mapping.department.name,
              }
            : null,
          constructionSite: mapping.constructionSite
            ? {
                id: mapping.constructionSite.id,
                shortName: mapping.constructionSite.shortName,
                fullName: mapping.constructionSite.fullName,
              }
            : null,
        }))
      : [],
  };
};

// Функция для вычисления статуса заполнения карточки сотрудника
// с учетом конфигурации обязательных полей контрагента
const calculateStatusCard = (
  employee,
  formConfig = DEFAULT_FORM_CONFIG,
  debug = false,
) => {
  const isComplete = isEmployeeCardComplete(employee, formConfig, debug);
  if (!isComplete) {
    const missing = getMissingRequiredFields(employee, formConfig);
    console.log(`[statusCard] DRAFT employee=${employee.lastName} ${employee.firstName} missing=[${missing.join(', ')}]`);
  }
  return isComplete ? "completed" : "draft";
};

/**
 * Загрузить конфигурацию полей для контрагента сотрудника
 * @param {Object} employee - объект сотрудника с маппингами
 * @returns {Object} - formConfig (default или external)
 */
const getEmployeeFormConfig = async (employee) => {
  try {
    // Получаем ID контрагента сотрудника
    const counterpartyId =
      employee.employeeCounterpartyMappings?.[0]?.counterpartyId;

    if (!counterpartyId) {
      // Если контрагент не указан - используем дефолтную конфигурацию
      return DEFAULT_FORM_CONFIG;
    }

    // Загружаем настройки
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );
    const isDefaultCounterparty = counterpartyId === defaultCounterpartyId;

    // Загружаем конфигурации из настроек
    const configDefaultStr = await Setting.getSetting(
      "employee_form_config_default",
    );
    const configExternalStr = await Setting.getSetting(
      "employee_form_config_external",
    );

    // Парсим JSON (с fallback на DEFAULT_FORM_CONFIG)
    let formConfigDefault = DEFAULT_FORM_CONFIG;
    let formConfigExternal = DEFAULT_FORM_CONFIG;

    if (configDefaultStr) {
      try {
        formConfigDefault = JSON.parse(configDefaultStr);
        const requiredInDefault = Object.entries(formConfigDefault).filter(([,v]) => v.required).map(([k]) => k);
        console.log("[formConfig] default required fields:", requiredInDefault.join(", "));
      } catch (e) {
        console.warn(
          "Failed to parse employee_form_config_default, using DEFAULT_FORM_CONFIG",
        );
      }
    }

    if (configExternalStr) {
      try {
        formConfigExternal = JSON.parse(configExternalStr);
      } catch (e) {
        console.warn(
          "Failed to parse employee_form_config_external, using DEFAULT_FORM_CONFIG",
        );
      }
    }

    // Возвращаем нужную конфигурацию
    return isDefaultCounterparty ? formConfigDefault : formConfigExternal;
  } catch (error) {
    console.warn(
      "Error loading form config, using DEFAULT_FORM_CONFIG:",
      error.message,
    );
    return DEFAULT_FORM_CONFIG;
  }
};

export const getAllEmployees = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = "",
      activeOnly = "false",
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      offset: queryOffset,
      counterpartyId,
      constructionSiteId,
    } = req.query;
    // Используем offset из query если передан, иначе вычисляем из page
    const offset =
      queryOffset !== undefined ? parseInt(queryOffset) : (page - 1) * limit;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userCounterpartyId = req.user.counterpartyId;
    ensureEmployeeRoleAllowed(userRole);

    const where = { isDeleted: false, markedForDeletion: false };
    const normalizedSearch = String(search || "").trim();
    const hasSearchQuery = normalizedSearch.length > 0;
    const normalizedSearchText = normalizeTextSearch(normalizedSearch);
    const searchTokens = normalizedSearchText
      ? normalizedSearchText.split(" ").filter(Boolean)
      : [];
    const normalizedDigitsSearchValue = normalizeDigitsSearch(normalizedSearch);
    const normalizedDocSearchValue = normalizeDocSearch(normalizedSearch);
    const requestedStatusFilters = normalizeQueryArray(req.query.statuses);
    const requestedPositionNames = normalizeQueryArray(req.query.positionNames);
    const requestedDepartmentNames = normalizeQueryArray(
      req.query.departmentNames,
    );
    const requestedConstructionSiteNames = normalizeQueryArray(
      req.query.constructionSiteNames,
    );
    const requestedCitizenshipNames = normalizeQueryArray(
      req.query.citizenshipNames,
    );
    const requestedCounterpartyIds = normalizeQueryArray(
      req.query.counterpartyIds,
    );
    const requestedCounterpartyNames = normalizeQueryArray(
      req.query.counterpartyNames,
    );
    const requestedUploadFilters = normalizeQueryArray(req.query.uploadStates)
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value === "uploaded" || value === "not_uploaded");
    const requestedStatusCardFilters = normalizeQueryArray(req.query.statusCard)
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value === "completed" || value === "draft");
    const sqlStatusPredicate = buildEmployeeStatusSqlPredicate(
      requestedStatusFilters,
    );
    const sqlUploadPredicate = buildEmployeeUploadSqlPredicate(
      requestedUploadFilters,
    );
    const canUseSqlStatusFiltering = Boolean(sqlStatusPredicate);
    const requiresPostFiltering = requestedStatusCardFilters.length > 0;
    const searchAndConditions = [];

    if (hasSearchQuery) {
      // Условия разных типов поиска объединяются через OR:
      // достаточно совпадения по любому из типов (цифры, документ, текст).
      const searchTypeConditions = [];

      if (normalizedDigitsSearchValue.length > 0) {
        searchTypeConditions.push({
          [Op.or]: [
            { inn: { [Op.iLike]: `%${normalizedDigitsSearchValue}%` } },
            { snils: { [Op.iLike]: `%${normalizedDigitsSearchValue}%` } },
            { phone: { [Op.iLike]: `%${normalizedDigitsSearchValue}%` } },
          ],
        });
      }

      if (normalizedDocSearchValue.length > 0) {
        const docOrConditions = [];

        try {
          const kigHash = hashForSearch(
            ENCRYPTED_EMPLOYEE_FIELDS.KIG,
            normalizedDocSearchValue,
          );
          const passportHash = hashForSearch(
            ENCRYPTED_EMPLOYEE_FIELDS.PASSPORT_NUMBER,
            normalizedDocSearchValue,
          );
          const patentHash = hashForSearch(
            ENCRYPTED_EMPLOYEE_FIELDS.PATENT_NUMBER,
            normalizedDocSearchValue,
          );

          if (kigHash) {
            docOrConditions.push({ kigHash });
          }
          if (passportHash) {
            docOrConditions.push({ passportNumberHash: passportHash });
          }
          if (patentHash) {
            docOrConditions.push({ patentNumberHash: patentHash });
          }
        } catch {
          // Если недоступен конфиг шифрования, пропускаем hash-предикаты.
        }

        if (docOrConditions.length > 0) {
          searchTypeConditions.push({ [Op.or]: docOrConditions });
        }
      }

      if (searchTokens.length > 0) {
        const tokenConditions = searchTokens
          .map((token) => {
            const orConditions = [
              { firstName: { [Op.iLike]: `${token}%` } },
              { middleName: { [Op.iLike]: `${token}%` } },
            ];

            try {
              const lastNameHash = hashForSearch(
                ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME,
                token,
              );
              if (lastNameHash) {
                orConditions.push({ lastNameHash });
              }
            } catch {
              // ignore hashing errors for search token
            }

            if (orConditions.length === 0) {
              return null;
            }

            return { [Op.or]: orConditions };
          })
          .filter(Boolean);

        if (tokenConditions.length > 0) {
          // Все токены текстового поиска должны совпасть (AND внутри типа)
          searchTypeConditions.push({ [Op.and]: tokenConditions });
        }
      }

      if (searchTypeConditions.length > 0) {
        where[Op.and] = [
          ...(where[Op.and] || []),
          { [Op.or]: searchTypeConditions },
        ];
      }
    }

    if (canUseSqlStatusFiltering) {
      where[Op.and] = [...(where[Op.and] || []), sequelize.literal(sqlStatusPredicate)];
    }

    if (sqlUploadPredicate) {
      where[Op.and] = [...(where[Op.and] || []), sequelize.literal(sqlUploadPredicate)];
    }

    // В режиме full encryption поиск по фамилии и ФИО делаем после чтения записей,
    // чтобы поддержать частичные совпадения и комбинированные запросы.

    // Статусы, которые считаем "активными" для режима выгрузки
    // Поддерживаем как текущие, так и legacy-коды.
    const exportActiveStatuses = [
      "status_active_employed",
      "status_hr_edited",
      "status_new",
      "status_tb_passed",
      "status_processed",
    ];

    // Статусы, которые исключаем из выгрузки (только если activeOnly = true)
    const isActiveOnly = activeOnly === "true";
    const excludedStatuses = [
      "status_hr_fired_compl",
      "status_hr_new_compl",
      "status_draft",
      "status_active_inactive",
      "status_secure_block",
      "status_secure_block_compl",
    ];

    // Статусы для фильтрации по дате (если указан фильтр)
    const dateFilterStatuses = [
      "status_active_employed",
      "status_new",
      "status_tb_passed",
      "status_processed",
      "status_active_fired",
      "status_hr_fired_compl",
      "status_hr_new_compl",
      "status_hr_edited",
      "status_hr_edited_compl",
      "status_hr_fired_off",
      "status_draft",
      "status_card_draft",
    ];

    // Фильтрация по роли пользователя
    let employeeInclude = [
      {
        model: Citizenship,
        as: "citizenship",
        attributes: ["id", "name", "code", "requiresPatent"],
      },
      {
        model: Citizenship,
        as: "birthCountry",
        attributes: ["id", "name", "code"],
      },
      {
        model: User,
        as: "creator",
        attributes: ["id", "firstName", "lastName"],
      },
      {
        model: Position,
        as: "position",
        attributes: ["id", "name"],
      },
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name", "type", "inn", "kpp"],
          },
          {
            model: Department,
            as: "department",
            attributes: ["id", "name"],
          },
          {
            model: ConstructionSite,
            as: "constructionSite",
            attributes: ["id", "shortName", "fullName"],
          },
        ],
      },
      // Подключаем EmployeeStatusMapping с его статусами для фильтрации
      {
        model: EmployeeStatusMapping,
        as: "statusMappings",
        include: [
          {
            model: Status,
            as: "status",
            attributes: ["id", "name", "group"],
            // Если activeOnly=true, фильтруем только действующие статусы
            where: isActiveOnly
              ? {
                  name: exportActiveStatuses,
                }
              : undefined,
          },
        ],
        attributes: [
          "id",
          "statusId",
          "isActive",
          "isUpload",
          "statusGroup",
          "createdAt",
          "updatedAt",
        ],
        // Если activeOnly=true, требуем наличие статуса (inner join)
        required: isActiveOnly ? true : false,
        // Дополнительное условие - статус должен быть активным
        where: isActiveOnly
          ? {
              isActive: true,
            }
          : undefined,
        subQuery: false,
      },
    ];

    const mappingInclude = employeeInclude[4];
    const positionInclude = employeeInclude[3];
    const citizenshipInclude = employeeInclude[0];
    let hasJoinBasedFilters = false;
    const departmentInclude = mappingInclude.include.find(
      (include) => include.as === "department",
    );
    const constructionSiteInclude = mappingInclude.include.find(
      (include) => include.as === "constructionSite",
    );
    const ensureMappingWhere = () => {
      hasJoinBasedFilters = true;
      mappingInclude.where = mappingInclude.where || {};
      mappingInclude.required = true;
      return mappingInclude.where;
    };

    const effectiveCounterpartyIds = requestedCounterpartyIds.length
      ? requestedCounterpartyIds
      : counterpartyId
        ? [counterpartyId]
        : [];

    if (constructionSiteId) {
      const mappingWhere = ensureMappingWhere();
      mappingWhere.constructionSiteId = constructionSiteId;
    }

    if (effectiveCounterpartyIds.length > 0) {
      const mappingWhere = ensureMappingWhere();
      mappingWhere.counterpartyId = effectiveCounterpartyIds;
    }

    const counterpartyInclude = mappingInclude.include.find(
      (include) => include.as === "counterparty",
    );

    if (requestedCounterpartyNames.length > 0 && counterpartyInclude) {
      hasJoinBasedFilters = true;
      counterpartyInclude.where = {
        name: {
          [Op.in]: requestedCounterpartyNames,
        },
      };
      counterpartyInclude.required = true;
      mappingInclude.required = true;
    }

    if (requestedDepartmentNames.length > 0 && departmentInclude) {
      hasJoinBasedFilters = true;
      departmentInclude.where = {
        name: {
          [Op.in]: requestedDepartmentNames,
        },
      };
      departmentInclude.required = true;
      mappingInclude.required = true;
    }

    if (requestedConstructionSiteNames.length > 0 && constructionSiteInclude) {
      hasJoinBasedFilters = true;
      constructionSiteInclude.where = {
        [Op.or]: [
          {
            shortName: {
              [Op.in]: requestedConstructionSiteNames,
            },
          },
          {
            fullName: {
              [Op.in]: requestedConstructionSiteNames,
            },
          },
        ],
      };
      constructionSiteInclude.required = true;
      mappingInclude.required = true;
    }

    if (requestedPositionNames.length > 0) {
      hasJoinBasedFilters = true;
      positionInclude.where = {
        name: {
          [Op.in]: requestedPositionNames,
        },
      };
      positionInclude.required = true;
    }

    if (requestedCitizenshipNames.length > 0) {
      hasJoinBasedFilters = true;
      citizenshipInclude.where = {
        name: {
          [Op.in]: requestedCitizenshipNames,
        },
      };
      citizenshipInclude.required = true;
    }

    // Для роли 'user' - применяем фильтрацию
    // Для админа и manager - могут видеть сотрудников всех контрагентов
    // НО если выбран конкретный контрагент - фильтруем по нему
    if (userRole === "user") {
      // Получаем контрагента по умолчанию
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );

      if (userCounterpartyId === defaultCounterpartyId) {
        // Контрагент по умолчанию: показываем только сотрудников, созданных пользователем
        // Используем UserEmployeeMapping где counterpartyId = NULL
        employeeInclude.push({
          model: UserEmployeeMapping,
          as: "userEmployeeMappings",
          where: {
            userId: userId,
            counterpartyId: null,
          },
          required: true,
        });
      } else {
        // Другие контрагенты: показываем всех сотрудников контрагента И его субподрядчиков
        // Получаем список субподрядчиков
        const { CounterpartySubcounterpartyMapping } =
          await import("../models/index.js");
        const subcontractors = await CounterpartySubcounterpartyMapping.findAll(
          {
            where: { parentCounterpartyId: userCounterpartyId },
            attributes: ["childCounterpartyId"],
          },
        );

        const subcontractorIds = subcontractors.map(
          (s) => s.childCounterpartyId,
        );
        const allowedCounterpartyIds = [
          userCounterpartyId,
          ...subcontractorIds,
        ];

        // Фильтруем по EmployeeCounterpartyMapping (индекс 4)
        const mappingWhere = ensureMappingWhere();
        mappingWhere.counterpartyId = effectiveCounterpartyIds.length
          ? allowedCounterpartyIds.filter((id) =>
              effectiveCounterpartyIds.includes(String(id)),
            )
          : allowedCounterpartyIds;
      }
    }

    const requiresInMemorySort = requiresEmployeeInMemorySort(sortBy);

    // Для JOIN-фильтров (подразделение/контрагент/объект/должность/гражданство)
    // применяем in-memory пагинацию по уникальным сотрудникам, иначе LIMIT на SQL JOIN
    // может "обрезать" выдачу и дать меньше строк, чем pageSize.
    const shouldUseInMemoryPagination =
      requiresPostFiltering || hasJoinBasedFilters || requiresInMemorySort;
    const canUseLightIdScan =
      shouldUseInMemoryPagination &&
      !requiresInMemorySort &&
      !hasSearchQuery &&
      requestedStatusFilters.length === 0 &&
      requestedStatusCardFilters.length === 0 &&
      !dateFrom &&
      !dateTo;

    // Для режима без in-memory пагинации используем SQL count с текущими include.
    let totalCount = null;
    if (!shouldUseInMemoryPagination) {
      totalCount = await Employee.count({
        where,
        include: employeeInclude,
        distinct: true,
        col: "id",
      });
    }

    const rowsInclude = [
      ...employeeInclude,
      {
        model: File,
        as: "files",
        attributes: ["id", "fileKey", "fileName", "documentType"],
        where: {
          documentType: "biometric_consent_developer",
          isDeleted: false,
        },
        required: false,
      },
    ];

    const allowedSortFields = {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      fullName: "fullName",
    };
    const resolvedSortField = allowedSortFields[sortBy] || "createdAt";
    const resolvedSortOrder =
      sortOrder === "ASC" ? "ASC" : sortOrder === "DESC" ? "DESC" : "DESC";
    const filesCountAttribute = [
      sequelize.literal(`(
        SELECT COUNT(*)::int
        FROM files
        WHERE files.entity_type = 'employee'
          AND files.entity_id = "Employee"."id"
          AND files.is_deleted = false
      )`),
      "filesCount",
    ];

    const queryOrder =
      resolvedSortField === "fullName"
        ? [
            ["lastName", `${resolvedSortOrder} NULLS LAST`],
            ["firstName", `${resolvedSortOrder} NULLS LAST`],
            ["middleName", `${resolvedSortOrder} NULLS LAST`],
          ]
        : [[resolvedSortField, `${resolvedSortOrder} NULLS LAST`]];

    // В режиме in-memory пагинации сначала делаем scan, затем загружаем
    // полные данные только для текущей страницы.
    let rows;
    if (canUseLightIdScan) {
      const idOnlyRows = await Employee.findAll({
        where,
        order: queryOrder,
        include: employeeInclude,
        attributes: ["id"],
        subQuery: false,
        raw: false,
        nest: true,
      });

      const seenIds = new Set();
      rows = idOnlyRows
        .map((item) => item?.id)
        .filter((id) => {
          if (!id || seenIds.has(id)) {
            return false;
          }
          seenIds.add(id);
          return true;
        })
        .map((id) => ({ id }));
    } else {
      rows = await Employee.findAll({
        where,
        limit: shouldUseInMemoryPagination ? undefined : parseInt(limit),
        offset: shouldUseInMemoryPagination ? undefined : parseInt(offset),
        order: queryOrder,
        include: shouldUseInMemoryPagination ? employeeInclude : rowsInclude,
        // filesCount нужен и для клиентской сортировки по количеству файлов
        attributes: {
          include: [filesCountAttribute],
        },
        // При in-memory пагинации subQuery не нужен.
        subQuery: !shouldUseInMemoryPagination,
        raw: false,
        nest: true,
      });
    }

    // Статусы уже загружены через include в основной запрос
    const employeesWithStatuses = rows;

    // Фильтрация уже сделана на уровне SQL через required=true и where в include
    let filteredRows = employeesWithStatuses;

    // Фильтруем по дате, если указаны параметры
    if (dateFrom || dateTo) {
      const startDate = dateFrom ? new Date(dateFrom) : null;
      const endDate = dateTo ? new Date(dateTo) : null;

      // Устанавливаем время для startDate на начало дня
      if (startDate) {
        startDate.setHours(0, 0, 0, 0);
      }

      // Устанавливаем время для endDate на конец дня
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      filteredRows = filteredRows.filter((employee) => {
        const statusMappings = employee.statusMappings || [];

        if (statusMappings.length === 0) {
          return false;
        }

        // Проверяем, есть ли статусы из списка, которые попадают в диапазон дат
        const hasMatchingStatus = statusMappings.some((mapping) => {
          // Получаем имя статуса
          const statusName = mapping.status?.name;

          // Проверяем, что статус в списке для фильтрации
          const isAllowedStatus = dateFilterStatuses.includes(statusName);
          if (!isAllowedStatus) {
            return false;
          }

          // Проверяем createdAt
          if (mapping.createdAt) {
            const createdDate = new Date(mapping.createdAt);
            const isInRange =
              startDate &&
              createdDate >= startDate &&
              (!endDate || createdDate <= endDate);
            if (isInRange) {
              return true;
            }
          }

          // Проверяем updatedAt
          if (mapping.updatedAt) {
            const updatedDate = new Date(mapping.updatedAt);
            const isInRange =
              startDate &&
              updatedDate >= startDate &&
              (!endDate || updatedDate <= endDate);
            if (isInRange) {
              return true;
            }
          }

          return false;
        });

        return hasMatchingStatus;
      });
    }

    if (requestedUploadFilters.length > 0 && !sqlUploadPredicate) {
      filteredRows = filteredRows.filter((employee) => {
        const statusMappings = (employee.statusMappings || []).filter(
          (mapping) => mapping.isActive !== false,
        );

        if (statusMappings.length === 0) {
          return false;
        }

        const allUploaded = statusMappings.every((mapping) => mapping.isUpload);
        const notUploaded = !allUploaded;

        return requestedUploadFilters.some((value) => {
          if (value === "uploaded") {
            return allUploaded;
          }

          if (value === "not_uploaded") {
            return notUploaded;
          }

          return false;
        });
      });
    }

    // Загружаем настройки полей для расчета statusCard
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );
    const configDefaultStr = await Setting.getSetting(
      "employee_form_config_default",
    );
    const configExternalStr = await Setting.getSetting(
      "employee_form_config_external",
    );

    let formConfigDefault = DEFAULT_FORM_CONFIG;
    let formConfigExternal = DEFAULT_FORM_CONFIG;

    if (configDefaultStr) {
      try {
        formConfigDefault = JSON.parse(configDefaultStr);
      } catch (e) {
        console.warn("Failed to parse employee_form_config_default");
      }
    }

    if (configExternalStr) {
      try {
        formConfigExternal = JSON.parse(configExternalStr);
      } catch (e) {
        console.warn("Failed to parse employee_form_config_external");
      }
    }

    const statusCardCache = new Map();

    const resolveStatusCard = (employee) => {
      const employeeData = employee?.toJSON ? employee.toJSON() : employee;
      const employeeId = employeeData?.id;
      if (employeeId && statusCardCache.has(employeeId)) {
        return statusCardCache.get(employeeId);
      }

      const counterpartyId =
        employeeData.employeeCounterpartyMappings?.[0]?.counterpartyId;
      const isDefaultCounterparty = counterpartyId === defaultCounterpartyId;
      const formConfig = isDefaultCounterparty
        ? formConfigDefault
        : formConfigExternal;

      const isComplete = isEmployeeCardComplete(
        employeeData,
        formConfig,
        false,
      );
      const statusCard = isComplete ? "completed" : "draft";

      if (employeeId) {
        statusCardCache.set(employeeId, statusCard);
      }

      return statusCard;
    };

    const attachStatusCard = (employee) => {
      const employeeData = employee?.toJSON ? employee.toJSON() : employee;
      employeeData.statusCard = resolveStatusCard(employee);

      return employeeData;
    };

    let employeesForResponseRows = [];
    let finalTotalCount = totalCount ?? filteredRows.length;

    if (shouldUseInMemoryPagination) {
      const postFilteredEmployees = filteredRows.filter((employee) => {
        if (
          !canUseSqlStatusFiltering &&
          requestedStatusFilters.length > 0 &&
          !matchesEmployeeStatusFilter(employee, requestedStatusFilters)
        ) {
          return false;
        }

        if (
          requestedStatusCardFilters.length > 0 &&
          !requestedStatusCardFilters.includes(resolveStatusCard(employee))
        ) {
          return false;
        }

        return true;
      });
      const sortedEmployees = sortEmployeesInMemory({
        employees: postFilteredEmployees,
        sortBy,
        sortOrder: resolvedSortOrder,
        resolveStatusCard,
      });

      finalTotalCount = sortedEmployees.length;
      const pageSlice = sortedEmployees.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit),
      );

      const pageIds = pageSlice.map((employee) => employee.id);

      if (pageIds.length > 0) {
        const detailedRows = await Employee.findAll({
          where: {
            ...where,
            id: {
              [Op.in]: pageIds,
            },
          },
          order: queryOrder,
          include: rowsInclude,
          attributes: {
            include: [filesCountAttribute],
          },
          subQuery: false,
          raw: false,
          nest: true,
        });

        const detailedById = new Map(
          detailedRows.map((employee) => [employee.id, employee]),
        );

        employeesForResponseRows = pageIds
          .map((id) => detailedById.get(id))
          .filter(Boolean);
      } else {
        employeesForResponseRows = [];
      }
    } else {
      employeesForResponseRows = filteredRows;
    }

    const employeesForResponse = employeesForResponseRows.map(attachStatusCard);

    res.json({
      success: true,
      data: {
        employees: employeesForResponse,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: finalTotalCount,
          pages: Math.ceil(finalTotalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    next(error);
  }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code", "requiresPatent"],
        },
        {
          model: Citizenship,
          as: "birthCountry",
          attributes: ["id", "name", "code"],
        },
        {
          model: User,
          as: "creator",
        },
        {
          model: User,
          as: "updater",
        },
        {
          model: Position, // Добавлена связь с Position
          as: "position",
          attributes: ["id", "name"],
        },
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              attributes: ["id", "name", "type", "inn", "kpp"],
            },
            {
              model: Department,
              as: "department",
              attributes: ["id", "name"],
            },
            {
              model: ConstructionSite,
              as: "constructionSite",
              attributes: ["id", "shortName", "fullName"],
            },
          ],
        },
        {
          model: EmployeeStatusMapping,
          as: "statusMappings",
          where: { isActive: true },
          required: false,
          include: [
            {
              model: Status,
              as: "status",
              attributes: ["id", "name", "group"],
            },
          ],
        },
      ],
      // Добавляем подсчет файлов
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*)::int
              FROM files
              WHERE files.entity_type = 'employee'
                AND files.entity_id = "Employee"."id"
                AND files.is_deleted = false
            )`),
            "filesCount",
          ],
        ],
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА (операция READ - разрешаем чтение для привязки)
    await checkEmployeeAccess(req.user, employee, "read");

    // Пересчитываем statusCard с учетом настроек контрагента
    const employeeData = employee.toJSON();
    const formConfig = await getEmployeeFormConfig(employeeData);
    employeeData.statusCard = calculateStatusCard(employeeData, formConfig);

    res.json({
      success: true,
      data: employeeData,
    });
  } catch (error) {
    console.error("Error fetching employee:", error);
    next(error);
  }
};

export const createEmployee = async (req, res, next) => {
  try {
    // Логируем только в development и без персональных данных
    if (process.env.NODE_ENV === "development") {
      console.log("=== CREATE EMPLOYEE REQUEST ===");
      console.log("User ID:", req.user?.id);
    }

    // 🎯 РЕЖИМ ПРИВЯЗКИ: проверяем наличие employeeId
    const { employeeId } = req.body;

    // Если передан employeeId - это режим привязки существующего сотрудника
    if (employeeId) {
      console.log(
        "🔗 LINKING MODE: Привязка существующего сотрудника",
        employeeId,
      );

      // Проверяем, что сотрудник существует
      const existingEmployee = await Employee.findByPk(employeeId, {
        include: employeeAccessInclude,
      });
      if (!existingEmployee) {
        return res.status(404).json({
          success: false,
          message: "Сотрудник не найден",
        });
      }

      // Проверяем только для пользователей default контрагента
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );
      if (req.user.counterpartyId !== defaultCounterpartyId) {
        return next(
          new AppError(
            "Привязка сотрудников доступна только в контрагенте по умолчанию",
            403,
          ),
        );
      }

      const isEmployeeInDefaultCounterparty =
        existingEmployee.employeeCounterpartyMappings?.some(
          (mapping) =>
            String(mapping.counterpartyId) === String(defaultCounterpartyId),
        ) || false;

      if (!isEmployeeInDefaultCounterparty) {
        return next(
          new AppError(
            "Недостаточно прав. Сотрудник не принадлежит вашей организации.",
            403,
          ),
        );
      }

      // Проверяем, есть ли уже связь в user_employee_mapping
      const existingMapping = await UserEmployeeMapping.findOne({
        where: {
          userId: req.user.id,
          employeeId: employeeId,
        },
      });

      if (existingMapping) {
        return res.status(400).json({
          success: false,
          message: "Этот сотрудник уже привязан к вашему профилю",
        });
      }

      // ✅ ШАГ 1: Создаем новую связь в user_employee_mapping
      await UserEmployeeMapping.create({
        userId: req.user.id,
        employeeId: employeeId,
        counterpartyId: null, // Для контрагента по умолчанию counterpartyId = NULL
      });

      console.log("✓ User-Employee mapping created (linking mode)");

      // ✅ ШАГ 2: Обновляем данные сотрудника (если они были изменены)
      // Удаляем служебные поля и employeeId
      const {
        employeeId: _,
        counterpartyId,
        constructionSiteId,
        statusActive,
        status,
        statusCard,
        statusSecure,
        isDraft,
        ...cleanEmployeeData
      } = req.body;

      const linkingUpdateData = filterEmployeeMutableFields(cleanEmployeeData, {
        normalizeEmptyString: true,
      });

      // Обновляем сотрудника
      await existingEmployee.update({
        ...applyEmployeeSensitiveFieldEncryption(linkingUpdateData),
        updatedBy: req.user.id,
      });

      console.log("✓ Employee data updated after linking");

      // Возвращаем обновленного сотрудника
      const linkedEmployee = await Employee.findByPk(employeeId, {
        include: [
          {
            model: Citizenship,
            as: "citizenship",
            attributes: ["id", "name", "code", "requiresPatent"],
          },
          {
            model: Position,
            as: "position",
            attributes: ["id", "name"],
          },
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            include: [
              {
                model: Counterparty,
                as: "counterparty",
                attributes: ["id", "name"],
              },
              {
                model: Department,
                as: "department",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      });

      const employeeData = linkedEmployee.toJSON();
      const formConfig = await getEmployeeFormConfig(employeeData);
      const calculatedStatusCard = calculateStatusCard(
        employeeData,
        formConfig,
      );
      employeeData.statusCard = calculatedStatusCard;

      return res.status(201).json({
        success: true,
        message: "Сотрудник успешно привязан",
        data: employeeData,
      });
    }

    // 🔄 СТАНДАРТНЫЙ РЕЖИМ: создание нового сотрудника
    // Удаляем counterpartyId, constructionSiteId, и все поля статусов из данных сотрудника
    const {
      counterpartyId,
      constructionSiteId,
      isDraft,
      statusActive,
      status,
      statusCard,
      statusSecure,
      ...cleanEmployeeData
    } = req.body;

    if (counterpartyId && req.user.role !== "admin") {
      throw new AppError("Недостаточно прав для назначения контрагента", 403);
    }

    if (counterpartyId) {
      const counterparty = await Counterparty.findByPk(counterpartyId);
      if (!counterparty) {
        throw new AppError("Контрагент не найден", 404);
      }
    }

    const employeeData = {
      ...applyEmployeeSensitiveFieldEncryption(cleanEmployeeData),
      createdBy: req.user.id,
    };

    const employee = await Employee.create(employeeData);

    // Инициализируем статусы для нового сотрудника
    await EmployeeStatusService.initializeEmployeeStatuses(
      employee.id,
      req.user.id,
    );

    // Определяем контрагента: из body (если передан) или текущего пользователя, иначе дефолтный
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );
    const targetCounterpartyId =
      counterpartyId || req.user.counterpartyId || defaultCounterpartyId;

    if (!targetCounterpartyId) {
      throw new AppError("Контрагент не определен", 400);
    }

    // Создаём запись в маппинге (сотрудник-контрагент-объект)
    await EmployeeCounterpartyMapping.create({
      employeeId: employee.id,
      counterpartyId: targetCounterpartyId,
      departmentId: null, // Подразделение можно будет назначить позже
      constructionSiteId: constructionSiteId || null, // Объект из формы, если был выбран
    });

    console.log(
      "✓ Employee-Counterparty mapping created with counterpartyId:",
      targetCounterpartyId,
    );

    // Для пользователей с контрагентом по умолчанию создаем UserEmployeeMapping
    if (req.user.counterpartyId === defaultCounterpartyId) {
      await UserEmployeeMapping.create({
        userId: req.user.id,
        employeeId: employee.id,
        counterpartyId: null, // Для контрагента по умолчанию counterpartyId = NULL
      });
      console.log("✓ User-Employee mapping created");
    }

    // Получаем созданного сотрудника со всеми отношениями
    const createdEmployee = await Employee.findByPk(employee.id, {
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code", "requiresPatent"],
        },
        {
          model: Position,
          as: "position",
          attributes: ["id", "name"],
        },
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              attributes: ["id", "name"],
            },
            {
              model: Department,
              as: "department",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
    });

    const employeeDataWithStatus = createdEmployee.toJSON();
    const formConfig = await getEmployeeFormConfig(employeeDataWithStatus);
    const isDraftRequest = Boolean(isDraft);
    const calculatedStatusCard = isDraftRequest
      ? "draft"
      : calculateStatusCard(employeeDataWithStatus, formConfig);
    employeeDataWithStatus.statusCard = calculatedStatusCard;

    try {
      // Используем единую логику обновления статусов
      const statusMap = await getImportStatuses();
      await updateEmployeeStatusesByCompleteness(
        employeeDataWithStatus,
        formConfig,
        statusMap,
        req.user.id,
        { forceDraft: isDraftRequest },
      );
      console.log("✓ Employee statuses updated");
    } catch (statusError) {
      console.warn("Warning: could not update statuses:", statusError.message);
    }

    res.status(201).json({
      success: true,
      message: "Сотрудник создан",
      data: employeeDataWithStatus,
    });
  } catch (error) {
    console.error("Error creating employee:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    if (error.parent) {
      console.error("Parent error:", error.parent);
    }

    // Обработка ошибки NOT NULL constraint (если миграция не применена)
    if (
      error.name === "SequelizeDatabaseError" &&
      error.parent?.code === "23502"
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Ошибка БД: не применена миграция для поддержки черновиков. Выполните миграцию 20241121_allow_null_for_drafts.sql",
        errors: [
          {
            field: error.parent.column,
            message: `Поле ${error.parent.column} требует значение (миграция не применена)`,
          },
        ],
      });
    }

    // Обработка ошибки уникальности
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors[0]?.path;
      const conflictingValue = error.errors[0]?.value;
      let fieldName = field;

      // Переводим названия полей на русский
      const fieldNames = {
        inn: "ИНН",
        snils: "СНИЛС",
        kig: "КИГ",
        kig_hash: "КИГ",
        passport_number: "Номер паспорта",
        passport_number_hash: "Номер паспорта",
      };

      // Маппинг поля БД → поле модели для поиска конфликтующего сотрудника
      const fieldToModelAttr = {
        inn: "inn",
        snils: "snils",
        kig_hash: "kigHash",
        passport_number_hash: "passportNumberHash",
      };

      if (fieldNames[field]) {
        fieldName = fieldNames[field];
      }

      // Ищем сотрудника с конфликтующим значением
      let conflictingEmployee = null;
      const modelAttr = fieldToModelAttr[field];
      if (modelAttr && conflictingValue) {
        try {
          const found = await Employee.findOne({
            where: { [modelAttr]: conflictingValue },
            attributes: ["id", "firstName", "lastName", "middleName"],
          });
          if (found) {
            conflictingEmployee = {
              id: found.id,
              firstName: found.firstName,
              lastName: found.lastName,
              middleName: found.middleName,
            };
          }
        } catch (lookupError) {
          console.error("Failed to lookup conflicting employee:", lookupError);
        }
      }

      return res.status(400).json({
        success: false,
        message: `${fieldName} уже используется другим сотрудником`,
        errors: [
          {
            field: field,
            message: `${fieldName} должен быть уникальным`,
          },
        ],
        conflictingEmployee,
      });
    }

    if (error.name === "SequelizeValidationError") {
      console.error("Validation errors:", error.errors);
      return res.status(400).json({
        success: false,
        message: "Ошибка валидации",
        errors: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    next(error);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Логируем только в development и без персональных данных
    if (process.env.NODE_ENV === "development") {
      console.log("=== UPDATE EMPLOYEE REQUEST ===");
      console.log("Employee ID:", id);
    }

    // Не перезаписываем counterpartyId при обновлении, constructionSiteId идет в маппинг
    const {
      counterpartyId,
      constructionSiteId,
      isDraft,
      isFired,
      isInactive,
      ...updateData
    } = req.body;

    if (
      counterpartyId !== undefined &&
      counterpartyId !== null &&
      req.user.role !== "admin"
    ) {
      return next(
        new AppError("Недостаточно прав для изменения контрагента", 403),
      );
    }

    if (counterpartyId !== undefined && counterpartyId !== null) {
      const counterparty = await Counterparty.findByPk(counterpartyId);
      if (!counterparty) {
        return res.status(404).json({
          success: false,
          message: "Контрагент не найден",
        });
      }
    }

    // Очищаем данные - преобразуем пустые строки в null для всех полей
    const cleanedData = {};
    const ignoredFields = [];

    Object.keys(updateData).forEach((key) => {
      // Разрешаем обновлять только явно перечисленные поля
      if (!EMPLOYEE_UPDATE_ALLOWED_FIELDS.has(key)) {
        ignoredFields.push(key);
        return;
      }

      const value = updateData[key];

      // Преобразуем пустые строки в null
      if (value === "" || value === undefined) {
        cleanedData[key] = null;
      } else {
        cleanedData[key] = value;
      }
    });

    if (ignoredFields.length > 0 && process.env.NODE_ENV === "development") {
      console.log(
        "Ignored non-whitelisted employee update fields:",
        ignoredFields,
      );
    }

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);
    const currentMapping = await EmployeeCounterpartyMapping.findOne({
      where: {
        employeeId: id,
      },
    });
    const currentActiveStatusBeforeUpdate =
      await EmployeeStatusService.getCurrentStatus(id, "status_active");
    const currentActiveStatusNameBeforeUpdate =
      currentActiveStatusBeforeUpdate?.status?.name || null;

    const changedEmployeeFields = Object.entries(cleanedData).filter(
      ([key, value]) => hasComparableValueChanged(employee[key], value),
    );
    const hasEmployeeFieldChanges = changedEmployeeFields.length > 0;

    const hasCounterpartyChange =
      counterpartyId !== undefined &&
      counterpartyId !== null &&
      hasComparableValueChanged(currentMapping?.counterpartyId, counterpartyId);

    const normalizedConstructionSiteId = constructionSiteId || null;
    const hasConstructionSiteChange =
      constructionSiteId !== undefined &&
      hasComparableValueChanged(
        currentMapping?.constructionSiteId,
        normalizedConstructionSiteId,
      );

    const desiredActiveStatusName = isFired
      ? "status_active_fired"
      : isInactive
        ? "status_active_inactive"
        : "status_active_employed";
    const hasActiveStatusChange =
      currentActiveStatusNameBeforeUpdate !== desiredActiveStatusName;
    const isDraftRequest = Boolean(isDraft) || req.path.endsWith("/draft");

    const hasDataChanges =
      hasEmployeeFieldChanges || hasCounterpartyChange || hasConstructionSiteChange;
    const shouldRefreshCompletenessStatuses =
      hasDataChanges || isDraftRequest;

    if (!hasDataChanges && !hasActiveStatusChange && !isDraftRequest) {
      const employeeWithoutChanges = await Employee.findByPk(id, {
        include: [
          {
            model: Citizenship,
            as: "citizenship",
            attributes: ["id", "name", "code", "requiresPatent"],
          },
          {
            model: Position,
            as: "position",
            attributes: ["id", "name"],
          },
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            include: [
              {
                model: Counterparty,
                as: "counterparty",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      });

      const employeeDataWithoutChanges = employeeWithoutChanges.toJSON();
      const formConfig = await getEmployeeFormConfig(employeeDataWithoutChanges);
      employeeDataWithoutChanges.statusCard = calculateStatusCard(
        employeeDataWithoutChanges,
        formConfig,
      );

      // Синхронизируем статусы в БД даже если данные не менялись
      // (например, карточка могла стать completed, но статус в БД остался draft)
      try {
        const statusMap = await getImportStatuses();
        await updateEmployeeStatusesByCompleteness(
          employeeDataWithoutChanges,
          formConfig,
          statusMap,
          req.user.id,
          { forceDraft: false },
        );
      } catch (statusErr) {
        console.warn("[updateEmployee] Failed to sync statuses on no-change save:", statusErr?.message);
      }

      return res.json({
        success: true,
        message: "Изменений не обнаружено",
        data: employeeDataWithoutChanges,
      });
    }

    if (hasEmployeeFieldChanges) {
      const changedFieldNames = changedEmployeeFields.map(([key]) => key);
      const updates = {
        ...applyEmployeeSensitiveFieldEncryption(cleanedData),
        updatedBy: req.user.id,
      };
      await employee.update(updates);
      console.log("✓ Employee fields updated:", changedFieldNames);
    }

    if (hasCounterpartyChange && currentMapping) {
      const previousCounterpartyId = currentMapping.counterpartyId;
      await currentMapping.update({
        counterpartyId,
      });
      console.log("✓ Employee counterparty mapping updated:", {
        employeeId: id,
        oldCounterpartyId: previousCounterpartyId,
        newCounterpartyId: counterpartyId,
      });
    }

    if (hasConstructionSiteChange && currentMapping) {
      await currentMapping.update({
        constructionSiteId: normalizedConstructionSiteId,
      });
      console.log("✓ Employee construction site mapping updated:", {
        employeeId: id,
        oldConstructionSiteId: currentMapping.constructionSiteId,
        newConstructionSiteId: normalizedConstructionSiteId,
      });
    }

    // Получаем обновленного сотрудника с гражданством для правильного расчета statusCard
    const updatedEmployee = await Employee.findByPk(id, {
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code", "requiresPatent"],
        },
        {
          model: Position, // Добавлена связь с Position
          as: "position",
          attributes: ["id", "name"],
        },
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
    });

    const employeeDataWithStatus = updatedEmployee.toJSON();
    const formConfig = await getEmployeeFormConfig(employeeDataWithStatus);
    const calculatedStatusCard = isDraftRequest
      ? "draft"
      : calculateStatusCard(employeeDataWithStatus, formConfig);
    employeeDataWithStatus.statusCard = calculatedStatusCard;

    // Обновляем статусы на основе текущего состояния
    try {
      if (shouldRefreshCompletenessStatuses) {
        // Используем единую логику обновления статусов (как при импорте)
        // Это обеспечивает корректный переход между draft/completed статусами для всех контрагентов
        const statusMap = await getImportStatuses();
        await updateEmployeeStatusesByCompleteness(
          employeeDataWithStatus,
          formConfig,
          statusMap,
          req.user.id,
          { forceDraft: isDraftRequest },
        );
      }

      // НОВАЯ ЛОГИКА: если в группе status_hr есть активный статус с is_upload=true - очищаем группу и активируем status_hr_edited
      console.log("=== CHECKING STATUS_HR GROUP ===");
      const currentHRStatusBeforeUpdate =
        hasDataChanges
          ? await EmployeeStatusService.getCurrentStatus(id, "status_hr")
          : null;
      if (currentHRStatusBeforeUpdate?.isUpload === true) {
        console.log(
          `Found active status_hr with is_upload=true: ${currentHRStatusBeforeUpdate?.status?.name}`,
        );

        // Деактивируем все статусы группы status_hr и устанавливаем is_upload = false
        await EmployeeStatusMapping.update(
          { isActive: false, isUpload: false },
          {
            where: {
              employeeId: id,
              statusGroup: "status_hr",
            },
          },
        );
        console.log(
          "✓ All status_hr statuses deactivated and is_upload set to false",
        );

        // Активируем status_hr_edited с is_upload = false (создаем или обновляем)
        await EmployeeStatusService.activateOrCreateStatus(
          id,
          "status_hr_edited",
          req.user.id,
          false,
        );
        console.log("✓ status_hr_edited activated with is_upload=false");
      }

      // Проверяем, есть ли статус status_hr_new_compl - если да, присваиваем status_hr_edited
      const currentHRStatus = await EmployeeStatusService.getCurrentStatus(
        id,
        "status_hr",
      );
      if (currentHRStatus?.status?.name === "status_hr_new_compl") {
        console.log(
          "✓ Employee has status_hr_new_compl, setting status_hr_edited",
        );
        await EmployeeStatusService.setStatusByName(
          id,
          "status_hr_edited",
          req.user.id,
        );
      }

      // Обновляем статус активности на основе чекбоксов
      console.log("=== UPDATING EMPLOYEE ACTIVE STATUS ===");
      console.log("isFired:", isFired);
      console.log("isInactive:", isInactive);

      // Получаем текущий статус активности
      const currentActiveStatus = await EmployeeStatusService.getCurrentStatus(
        id,
        "status_active",
      );
      const currentStatusName = currentActiveStatus?.status?.name;
      const currentIsUpload = currentActiveStatus?.isUpload;

      console.log("Current status_active:", currentStatusName);
      console.log("Current is_upload:", currentIsUpload);

      if (isFired || isInactive) {
        const statusName = isFired
          ? "status_active_fired"
          : "status_active_inactive";
        console.log(`Setting status_active to ${statusName}`);

        // СПЕЦИАЛЬНАЯ ЛОГИКА для status_active_fired: деактивируем status_hr_fired_off если он активен
        if (isFired) {
          console.log("Checking for active status_hr_fired_off to deactivate");
          const hrFiredOffStatus = await EmployeeStatusService.getCurrentStatus(
            id,
            "status_hr",
          );
          if (hrFiredOffStatus?.status?.name === "status_hr_fired_off") {
            hrFiredOffStatus.isActive = false;
            hrFiredOffStatus.isUpload = false;
            hrFiredOffStatus.updatedBy = req.user.id;
            hrFiredOffStatus.updatedAt = new Date();
            await hrFiredOffStatus.save();
            console.log(
              "✓ Deactivated status_hr_fired_off and set is_upload to false",
            );
          }
        }

        await EmployeeStatusService.setStatusByName(
          id,
          statusName,
          req.user.id,
        );
        console.log(`✓ Employee status_active updated to ${statusName}`);
      } else {
        // Если ни один чекбокс не выбран - сотрудник активен
        console.log("No checkboxes selected");

        // СПЕЦИАЛЬНАЯ ЛОГИКА: если был статус status_active_fired с is_upload = true
        if (
          currentStatusName === "status_active_fired" &&
          currentIsUpload === true
        ) {
          console.log(
            "Transitioning from status_active_fired with is_upload=true",
          );

          // Деактивируем status_active_fired и устанавливаем is_upload = false
          if (currentActiveStatus) {
            currentActiveStatus.isActive = false;
            currentActiveStatus.isUpload = false;
            currentActiveStatus.updatedBy = req.user.id;
            currentActiveStatus.updatedAt = new Date();
            await currentActiveStatus.save();
            console.log(
              "✓ Deactivated status_active_fired and set is_upload to false",
            );
          }

          // Деактивируем status_hr_edited ДО активации status_hr_fired_off
          console.log("Looking for status_hr_edited to deactivate...");
          const hrEditedStatus = await EmployeeStatusService.getCurrentStatus(
            id,
            "status_hr",
          );
          console.log(
            "Found status_hr:",
            hrEditedStatus?.status?.name,
            "is_active:",
            hrEditedStatus?.isActive,
            "is_upload:",
            hrEditedStatus?.isUpload,
          );

          if (hrEditedStatus?.status?.name === "status_hr_edited") {
            console.log("Deactivating status_hr_edited...");
            hrEditedStatus.isActive = false;
            hrEditedStatus.isUpload = false;
            hrEditedStatus.updatedBy = req.user.id;
            hrEditedStatus.updatedAt = new Date();
            await hrEditedStatus.save();
            console.log(
              "✓ Deactivated status_hr_edited and set is_upload to false",
            );

            // Перепроверяем, что сохранилось
            const verifyStatus = await EmployeeStatusService.getCurrentStatus(
              id,
              "status_hr",
            );
            console.log(
              "Verification after deactivation:",
              verifyStatus?.status?.name,
              "is_active:",
              verifyStatus?.isActive,
              "is_upload:",
              verifyStatus?.isUpload,
            );
          } else {
            console.log(
              "status_hr_edited not found, might have been already deactivated or other status is active",
            );
          }

          // Активируем status_hr_fired_off с is_upload = false (или создаем если не существует)
          console.log("Activating status_hr_fired_off...");
          await EmployeeStatusService.activateOrCreateStatus(
            id,
            "status_hr_fired_off",
            req.user.id,
            false,
          );
          console.log(
            "✓ Activated or created status_hr_fired_off with is_upload=false",
          );
        }

        // Устанавливаем status_active_employed
        if (currentStatusName !== "status_active_employed") {
          console.log("Setting status_active to employed");
          await EmployeeStatusService.setStatusByName(
            id,
            "status_active_employed",
            req.user.id,
          );
          console.log("✓ Employee status_active updated to employed");
        }
      }

      if (hasDataChanges) {
        const [updatedUploadFlags] = await EmployeeStatusMapping.update(
          {
            isUpload: false,
            updatedBy: req.user.id,
            updatedAt: new Date(),
          },
          {
            where: {
              employeeId: id,
              isActive: true,
            },
          },
        );
        console.log(
          `✓ Active status upload flags reset to false after data changes: ${updatedUploadFlags}`,
        );
      }
    } catch (statusError) {
      console.warn("Warning: could not update statuses:", statusError.message);
      // Не прерываем обновление, если ошибка со статусами
    }

    res.json({
      success: true,
      message: "Сотрудник обновлен",
      data: employeeDataWithStatus,
    });
  } catch (error) {
    console.error("=== ERROR UPDATING EMPLOYEE ===");
    console.error("Error:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);

    // Обработка ошибки уникальности
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors[0]?.path;
      const conflictingValue = error.errors[0]?.value;
      let fieldName = field;

      // Переводим названия полей на русский
      const fieldNames = {
        inn: "ИНН",
        snils: "СНИЛС",
        kig: "КИГ",
        kig_hash: "КИГ",
        passport_number: "Номер паспорта",
        passport_number_hash: "Номер паспорта",
      };

      // Маппинг поля БД → поле модели для поиска конфликтующего сотрудника
      const fieldToModelAttr = {
        inn: "inn",
        snils: "snils",
        kig_hash: "kigHash",
        passport_number_hash: "passportNumberHash",
      };

      if (fieldNames[field]) {
        fieldName = fieldNames[field];
      }

      // Ищем сотрудника с конфликтующим значением
      let conflictingEmployee = null;
      const modelAttr = fieldToModelAttr[field];
      if (modelAttr && conflictingValue) {
        try {
          const found = await Employee.findOne({
            where: { [modelAttr]: conflictingValue },
            attributes: ["id", "firstName", "lastName", "middleName"],
          });
          if (found) {
            conflictingEmployee = {
              id: found.id,
              firstName: found.firstName,
              lastName: found.lastName,
              middleName: found.middleName,
            };
          }
        } catch (lookupError) {
          console.error("Failed to lookup conflicting employee:", lookupError);
        }
      }

      return res.status(400).json({
        success: false,
        message: `${fieldName} уже используется другим сотрудником`,
        errors: [
          {
            field: field,
            message: `${fieldName} должен быть уникальным`,
          },
        ],
        conflictingEmployee,
      });
    }

    if (error.name === "SequelizeValidationError") {
      console.error("=== VALIDATION ERRORS ===");
      console.error(
        "Validation errors:",
        JSON.stringify(error.errors, null, 2),
      );
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
          value: e.value,
        })),
      });
    }

    next(error);
  }
};

// Обновить объекты строительства для сотрудника
export const updateEmployeeConstructionSites = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { siteIds } = req.body;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    const targetCounterpartyId = await resolveTargetCounterpartyIdForEmployeeMapping(
      req.user,
      employee,
    );

    if (!targetCounterpartyId) {
      throw new AppError("Контрагент сотрудника не определен", 400);
    }

    const normalizedSiteIds = [
      ...new Set(
        (Array.isArray(siteIds) ? siteIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ];

    // Получаем существующие маппинги сотрудника для текущего контрагента
    const existingMappings = await EmployeeCounterpartyMapping.findAll({
      where: {
        employeeId: id,
        counterpartyId: targetCounterpartyId,
      },
    });

    // Сохраняем существующий departmentId перед обновлением
    const existingDepartmentId =
      existingMappings.length > 0 ? existingMappings[0].departmentId : null;

    // Если нет маппингов, создаем базовый
    if (existingMappings.length === 0) {
      // Если нет выбранных объектов - создаем маппинг с NULL
      if (normalizedSiteIds.length === 0) {
        await EmployeeCounterpartyMapping.create({
          employeeId: id,
          counterpartyId: targetCounterpartyId,
          constructionSiteId: null,
          departmentId: null,
        });
      } else {
        // Создаем маппинги для каждого выбранного объекта
        for (const siteId of normalizedSiteIds) {
          await EmployeeCounterpartyMapping.create({
            employeeId: id,
            counterpartyId: targetCounterpartyId,
            constructionSiteId: siteId,
            departmentId: null,
          });
        }
      }
    } else {
      // Удаляем все старые маппинги с объектами для этого контрагента
      await EmployeeCounterpartyMapping.destroy({
        where: {
          employeeId: id,
          counterpartyId: targetCounterpartyId,
        },
      });

      // Если нет выбранных объектов - создаем маппинг с NULL (сохраняем связь с контрагентом)
      if (normalizedSiteIds.length === 0) {
        await EmployeeCounterpartyMapping.create({
          employeeId: id,
          counterpartyId: targetCounterpartyId,
          constructionSiteId: null,
          departmentId: existingDepartmentId, // Сохраняем подразделение
        });
      } else {
        // Создаем новые маппинги для каждого выбранного объекта, сохраняя departmentId
        for (const siteId of normalizedSiteIds) {
          await EmployeeCounterpartyMapping.create({
            employeeId: id,
            counterpartyId: targetCounterpartyId,
            constructionSiteId: siteId,
            departmentId: existingDepartmentId, // Сохраняем подразделение
          });
        }
      }
    }

    // Просто возвращаем успех без лишней загрузки данных
    res.json({
      success: true,
      message: "Объекты обновлены",
    });
  } catch (error) {
    console.error("Error updating construction sites:", error);
    next(error);
  }
};

// Обновить подразделение сотрудника
export const updateEmployeeDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { departmentId } = req.body;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    const targetCounterpartyId = await resolveTargetCounterpartyIdForEmployeeMapping(
      req.user,
      employee,
    );

    if (!targetCounterpartyId) {
      throw new AppError("Контрагент сотрудника не определен", 400);
    }

    // Получаем ВСЕ маппинги сотрудника для текущего контрагента
    const mappings = await EmployeeCounterpartyMapping.findAll({
      where: {
        employeeId: id,
        counterpartyId: targetCounterpartyId,
      },
    });

    // Если маппингов нет, создаем новый
    if (mappings.length === 0) {
      await EmployeeCounterpartyMapping.create({
        employeeId: id,
        counterpartyId: targetCounterpartyId,
        departmentId: departmentId || null,
        constructionSiteId: null,
      });
    } else {
      // Обновляем departmentId во ВСЕХ маппингах сотрудника
      await EmployeeCounterpartyMapping.update(
        { departmentId: departmentId || null },
        {
          where: {
            employeeId: id,
            counterpartyId: targetCounterpartyId,
          },
        },
      );
    }

    res.json({
      success: true,
      message: "Подразделение обновлено",
      data: {
        departmentId: departmentId || null,
      },
    });
  } catch (error) {
    console.error("Error updating department:", error);
    next(error);
  }
};

export const deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "manager") {
      return next(new AppError("Недостаточно прав", 403));
    }

    await employee.update({
      isDeleted: true,
      deletedAt: new Date(),
      markedForDeletion: false,
      isActive: false,
    });

    try {
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_active_inactive",
        req.user.id,
      );
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_secure_block",
        req.user.id,
      );
    } catch (statusError) {
      console.warn("Failed to update statuses on delete:", statusError.message);
    }

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: employee.id,
        operation: "block_employee",
        userId: req.user.id,
        source: "delete_employee",
        reasonCode: "rkl_blacklist_delete",
        statusReason: "Employee deleted/blacklisted in PassDesk",
        priority: "high",
      });
    }

    res.json({
      success: true,
      message: "Сотрудник удален",
    });
  } catch (error) {
    console.error("Error deleting employee:", error);
    next(error);
  }
};

export const discardDraftEmployee = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
      transaction,
    });

    if (!employee || employee.isDeleted) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    const canDiscard =
      req.user.role === "admin" ||
      String(employee.createdBy || "") === String(req.user.id || "");

    if (!canDiscard) {
      await transaction.rollback();
      return next(new AppError("Недостаточно прав", 403));
    }

    await checkEmployeeAccess(req.user, employee);

    const files = await File.findAll({
      where: {
        employeeId: employee.id,
      },
      transaction,
    });

    for (const file of files) {
      if (!file?.filePath) {
        continue;
      }
      try {
        await storageProvider.deleteFile(file.filePath);
      } catch (error) {
        console.warn(
          `Failed to delete employee draft file from storage: ${file.filePath}`,
          error?.message || error,
        );
      }
    }

    await File.destroy({
      where: {
        employeeId: employee.id,
      },
      transaction,
      force: true,
    });

    await employee.destroy({ transaction, force: true });
    await transaction.commit();

    res.json({
      success: true,
      message: "Черновик сотрудника удален",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error discarding employee draft:", error);
    next(error);
  }
};

export const permanentlyDeleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin") {
      return next(new AppError("Недостаточно прав", 403));
    }

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    if (!employee.isDeleted && !employee.markedForDeletion) {
      return next(
        new AppError(
          "Полное удаление доступно только для сотрудников из корзины",
          400,
        ),
      );
    }

    if (isSkudEnabled()) {
      try {
        await deleteEmployeeFromSkud({ employeeId: id });
      } catch (err) {
        console.error(`[permanentlyDelete] Failed to delete employee ${id} from SKUD:`, err?.message);
      }
    }

    await employee.destroy();

    res.json({
      success: true,
      message: "Сотрудник удален навсегда",
    });
  } catch (error) {
    console.error("Error permanently deleting employee:", error);
    next(error);
  }
};

export const markEmployeeForDeletion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    if (req.user.role !== "user") {
      return next(new AppError("Недостаточно прав", 403));
    }

    await checkEmployeeAccess(req.user, employee);

    await employee.update({
      markedForDeletion: true,
      isActive: false,
    });

    try {
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_active_inactive",
        req.user.id,
      );
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_secure_block",
        req.user.id,
      );
    } catch (statusError) {
      console.warn(
        "Failed to update statuses on mark for deletion:",
        statusError.message,
      );
    }

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: employee.id,
        operation: "block_employee",
        userId: req.user.id,
        source: "mark_for_deletion",
        reasonCode: "rkl_blacklist_mark",
        statusReason: "Employee marked for deletion/blacklist in PassDesk",
        priority: "high",
      });
    }

    res.json({
      success: true,
      message: "Сотрудник помечен на удаление",
    });
  } catch (error) {
    console.error("Error marking employee for deletion:", error);
    next(error);
  }
};

export const unmarkEmployeeForDeletion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    if (req.user.role !== "admin") {
      return next(new AppError("Недостаточно прав", 403));
    }

    await employee.update({
      markedForDeletion: false,
      isActive: true,
    });

    try {
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_active_employed",
        req.user.id,
      );
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_secure_allow",
        req.user.id,
      );
    } catch (statusError) {
      console.warn(
        "Failed to update statuses on unmark for deletion:",
        statusError.message,
      );
    }

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: employee.id,
        operation: "unblock_employee",
        userId: req.user.id,
        source: "unmark_for_deletion",
        reasonCode: "rkl_blacklist_clear",
        statusReason: "Employee removed from blacklist in PassDesk",
        priority: "normal",
      });
    }

    res.json({
      success: true,
      message: "Пометка на удаление отменена",
    });
  } catch (error) {
    console.error("Error unmarking employee for deletion:", error);
    next(error);
  }
};

export const getMarkedForDeletionEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const offset = (pageNumber - 1) * limitNumber;
    const normalizedSearch = String(search || "").trim();
    const hasSearchQuery = normalizedSearch.length > 0;

    const where = {
      isDeleted: false,
      markedForDeletion: true,
    };

    const include = [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name"],
          },
          {
            model: ConstructionSite,
            as: "constructionSite",
            attributes: ["id", "shortName", "fullName"],
          },
        ],
      },
    ];

    if (hasSearchQuery) {
      const rows = await Employee.findAll({
        where,
        include,
        order: [["updatedAt", "DESC"]],
      });

      const searchedRows = rows.filter((employee) =>
        matchesEmployeeSearch(employee, normalizedSearch),
      );
      const pagedRows = searchedRows.slice(offset, offset + limitNumber);

      return res.json({
        success: true,
        data: {
          employees: pagedRows,
          pagination: {
            page: pageNumber,
            limit: limitNumber,
            total: searchedRows.length,
            pages: Math.ceil(searchedRows.length / limitNumber),
          },
        },
      });
    }

    const { count, rows } = await Employee.findAndCountAll({
      where,
      include,
      limit: limitNumber,
      offset,
      order: [["updatedAt", "DESC"]],
      distinct: true,
    });

    res.json({
      success: true,
      data: {
        employees: rows,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: count,
          pages: Math.ceil(count / limitNumber),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDeletedEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const offset = (pageNumber - 1) * limitNumber;
    const normalizedSearch = String(search || "").trim();
    const hasSearchQuery = normalizedSearch.length > 0;

    const where = {
      [Op.or]: [{ isDeleted: true }, { markedForDeletion: true }],
    };

    const include = [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name"],
          },
          {
            model: ConstructionSite,
            as: "constructionSite",
            attributes: ["id", "shortName", "fullName"],
          },
        ],
      },
    ];

    if (hasSearchQuery) {
      const rows = await Employee.findAll({
        where,
        include,
        order: [
          ["deletedAt", "DESC"],
          ["updatedAt", "DESC"],
        ],
      });

      const searchedRows = rows.filter((employee) =>
        matchesEmployeeSearch(employee, normalizedSearch),
      );
      const pagedRows = searchedRows.slice(offset, offset + limitNumber);

      return res.json({
        success: true,
        data: {
          employees: pagedRows,
          pagination: {
            page: pageNumber,
            limit: limitNumber,
            total: searchedRows.length,
            pages: Math.ceil(searchedRows.length / limitNumber),
          },
        },
      });
    }

    const { count, rows } = await Employee.findAndCountAll({
      where,
      include,
      limit: limitNumber,
      offset,
      order: [
        ["deletedAt", "DESC"],
        ["updatedAt", "DESC"],
      ],
      distinct: true,
    });

    res.json({
      success: true,
      data: {
        employees: rows,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: count,
          pages: Math.ceil(count / limitNumber),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const restoreEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee || (!employee.isDeleted && !employee.markedForDeletion)) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    if (req.user.role !== "admin") {
      return next(new AppError("Недостаточно прав", 403));
    }

    if (employee.isDeleted) {
      const duplicateChecks = buildEmployeeDuplicateChecks(employee);

      if (duplicateChecks.length > 0) {
        const duplicate = await Employee.findOne({
          where: {
            id: { [Op.ne]: employee.id },
            isDeleted: false,
            [Op.or]: duplicateChecks,
          },
        });

        if (duplicate) {
          return res.status(409).json({
            success: false,
            message:
              "Невозможно восстановить: найден активный сотрудник с такими же данными",
          });
        }
      }
    }

    await employee.update({
      isDeleted: false,
      deletedAt: null,
      markedForDeletion: false,
      isActive: true,
    });

    try {
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_active_employed",
        req.user.id,
      );
      await EmployeeStatusService.setStatusByName(
        employee.id,
        "status_secure_allow",
        req.user.id,
      );
    } catch (statusError) {
      console.warn(
        "Failed to update statuses on restore:",
        statusError.message,
      );
    }

    res.json({
      success: true,
      message: "Сотрудник восстановлен",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновить флаг is_upload для всех активных статусов сотрудника
 */
export const updateAllStatusesUploadFlag = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { isUpload } = req.body;
    const userId = req.user.id;

    const { deniedIds } = await getAccessibleEmployeeIds(
      req.user,
      [employeeId],
      "write",
    );
    if (deniedIds.length > 0) {
      return next(new AppError("Недостаточно прав", 403));
    }

    // Обновляем все активные статусы сотрудника
    const [updatedCount] = await EmployeeStatusMapping.update(
      {
        isUpload: isUpload,
        updatedBy: userId,
      },
      {
        where: {
          employeeId: employeeId,
          isActive: true,
        },
      },
    );

    res.json({
      success: true,
      message: `Обновлено ${updatedCount} статусов`,
      data: {
        updatedCount: updatedCount,
      },
    });
  } catch (error) {
    console.error("Error updating all statuses upload flag:", error);
    next(error);
  }
};

/**
 * Обновить флаг is_upload для одного статуса сотрудника
 */
export const updateStatusUploadFlag = async (req, res, next) => {
  try {
    const { employeeId, statusMappingId } = req.params;
    const { isUpload } = req.body;
    const userId = req.user.id;

    const { deniedIds } = await getAccessibleEmployeeIds(
      req.user,
      [employeeId],
      "write",
    );
    if (deniedIds.length > 0) {
      return next(new AppError("Недостаточно прав", 403));
    }

    // Проверяем наличие статуса
    const statusMapping = await EmployeeStatusMapping.findByPk(statusMappingId);
    if (!statusMapping) {
      return res.status(404).json({
        success: false,
        message: "Статус не найден",
      });
    }

    // Проверяем что статус принадлежит этому сотруднику
    if (statusMapping.employeeId !== employeeId) {
      return next(new AppError("Доступ запрещен", 403));
    }

    // Обновляем флаг
    await statusMapping.update({
      isUpload: isUpload,
      updatedBy: userId,
    });

    res.json({
      success: true,
      message: "Флаг обновлен",
      data: {
        id: statusMapping.id,
        isUpload: statusMapping.isUpload,
      },
    });
  } catch (error) {
    console.error("Error updating status upload flag:", error);
    next(error);
  }
};

/**
 * Установить статус "Редактирован" с флагом is_upload
 */
export const setEditedStatus = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { isUpload = true } = req.body;
    const userId = req.user.id;

    const { deniedIds } = await getAccessibleEmployeeIds(
      req.user,
      [employeeId],
      "write",
    );
    if (deniedIds.length > 0) {
      return next(new AppError("Недостаточно прав", 403));
    }

    // Найти ID статуса "status_hr_edited"
    const editedStatusRecord = await Status.findOne({
      where: {
        name: "status_hr_edited",
      },
    });

    if (!editedStatusRecord) {
      return res.status(400).json({
        success: false,
        message: 'Статус "status_hr_edited" не найден',
      });
    }

    // Проверяем есть ли активный статус status_hr_fired_off
    const firedOffMapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId: employeeId,
        statusGroup: "status_hr",
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
    });

    // Если активен status_hr_fired_off - не создаем status_hr_edited
    if (firedOffMapping?.status?.name === "status_hr_fired_off") {
      console.log(
        "Employee has active status_hr_fired_off, skipping status_hr_edited creation",
      );
      return res.json({
        success: true,
        message:
          'Статус "Редактирован" не установлен (сотрудник в статусе "Повторно принят")',
        data: {
          statusUpdated: false,
          reason: "status_hr_fired_off_active",
        },
      });
    }

    // Деактивируем все другие активные статусы группы status_hr
    await EmployeeStatusMapping.update(
      { isActive: false },
      {
        where: {
          employeeId: employeeId,
          statusGroup: "status_hr",
          isActive: true,
        },
      },
    );

    // Проверяем есть ли уже такой статус у сотрудника
    const existingMapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId: employeeId,
        statusId: editedStatusRecord.id,
        statusGroup: "status_hr",
      },
    });

    if (existingMapping) {
      // Обновляем существующий
      existingMapping.isActive = true;
      existingMapping.isUpload = isUpload;
      existingMapping.updatedBy = userId;
      existingMapping.updatedAt = new Date();
      await existingMapping.save();
    } else {
      // Создаём новый статус для сотрудника
      await EmployeeStatusMapping.create({
        employeeId: employeeId,
        statusId: editedStatusRecord.id,
        statusGroup: "status_hr",
        isUpload: isUpload,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      });
    }

    res.json({
      success: true,
      message: 'Статус "Редактирован" установлен',
      data: {
        statusUpdated: true,
      },
    });
  } catch (error) {
    console.error("Error setting edited status:", error);
    next(error);
  }
};

/**
 * Уволить сотрудника
 * Очищает группу status_hr и устанавливает status_active_fired
 */
export const fireEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const now = new Date();

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    console.log(
      `=== FIRING EMPLOYEE: ${employee.firstName} ${employee.lastName} ===`,
    );

    const dismissedMappingsWhere = { employeeId: id, dismissedAt: null };
    const userCounterpartyId = req.user?.counterpartyId || null;
    const defaultCounterpartyId = await Setting.getSetting("default_counterparty_id");
    const hasScopedCounterparty =
      userCounterpartyId && String(userCounterpartyId) !== String(defaultCounterpartyId);

    if (hasScopedCounterparty) {
      dismissedMappingsWhere.counterpartyId = userCounterpartyId;
    }

    await EmployeeCounterpartyMapping.update(
      { dismissedAt: now },
      { where: dismissedMappingsWhere },
    );
    console.log("✓ Employee counterparty mappings marked as dismissed");

    // 1. Деактивируем все статусы группы status_hr и очищаем is_upload
    await EmployeeStatusMapping.update(
      { isActive: false, isUpload: false },
      {
        where: {
          employeeId: id,
          statusGroup: "status_hr",
        },
      },
    );
    console.log(
      "✓ All status_hr statuses deactivated and is_upload set to false",
    );

    // 2. Активируем status_active_fired с is_upload = false
    await EmployeeStatusService.setStatusByName(
      id,
      "status_active_fired",
      userId,
    );

    // Обновляем is_upload = false для только что установленного статуса
    const firedMapping = await EmployeeStatusService.getCurrentStatus(
      id,
      "status_active",
    );
    if (firedMapping) {
      firedMapping.isUpload = false;
      firedMapping.updatedBy = userId;
      firedMapping.updatedAt = new Date();
      await firedMapping.save();
    }
    console.log("✓ status_active_fired activated with is_upload=false");

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "sync_employee",
        userId,
        source: "fire_employee",
        priority: "high",
      });
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "block_employee",
        userId,
        source: "fire_employee",
        reasonCode: "status_active_fired",
        statusReason: "Employee fired in PassDesk",
        priority: "high",
      });
    }

    res.json({
      success: true,
      message: `Сотрудник ${employee.firstName} ${employee.lastName} уволен`,
      data: {
        employeeId: id,
        action: "fired",
      },
    });
  } catch (error) {
    console.error("Error firing employee:", error);
    next(error);
  }
};

/**
 * Принять уволенного сотрудника
 * Очищает группу status_hr кроме status_hr_fired_off и активирует status_hr_fired_off
 */
export const reinstateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userCounterpartyId = req.user?.counterpartyId || null;
    const defaultCounterpartyId = await Setting.getSetting("default_counterparty_id");

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    console.log(
      `=== REINSTATING EMPLOYEE: ${employee.firstName} ${employee.lastName} ===`,
    );

    const reinstateMappingsWhere = { employeeId: id };
    if (
      userCounterpartyId &&
      String(userCounterpartyId) !== String(defaultCounterpartyId)
    ) {
      reinstateMappingsWhere.counterpartyId = userCounterpartyId;
    }

    await EmployeeCounterpartyMapping.update(
      { dismissedAt: null },
      { where: reinstateMappingsWhere },
    );
    console.log("✓ Employee counterparty mappings reinstated");

    // 1. Получить статус status_hr_fired_off
    const firedOffStatus = await Status.findOne({
      where: { name: "status_hr_fired_off" },
    });

    if (!firedOffStatus) {
      throw new Error("Статус status_hr_fired_off не найден");
    }

    // 2. Деактивируем все другие статусы группы status_hr и очищаем is_upload
    await EmployeeStatusMapping.update(
      { isActive: false, isUpload: false },
      {
        where: {
          employeeId: id,
          statusGroup: "status_hr",
          statusId: { [Op.ne]: firedOffStatus.id },
        },
      },
    );
    console.log(
      "✓ All status_hr statuses except status_hr_fired_off deactivated and is_upload set to false",
    );

    // 3. Активируем status_hr_fired_off с is_upload = false (создаем или обновляем)
    await EmployeeStatusService.activateOrCreateStatus(
      id,
      "status_hr_fired_off",
      userId,
      false,
    );
    console.log("✓ status_hr_fired_off activated with is_upload=false");

    // 4. Деактивируем status_active_fired и устанавливаем status_active_employed
    const currentActiveStatus = await EmployeeStatusService.getCurrentStatus(
      id,
      "status_active",
    );
    if (currentActiveStatus?.status?.name === "status_active_fired") {
      currentActiveStatus.isActive = false;
      currentActiveStatus.isUpload = false;
      currentActiveStatus.updatedBy = userId;
      currentActiveStatus.updatedAt = new Date();
      await currentActiveStatus.save();
      console.log("✓ status_active_fired deactivated");
    }

    // Активируем status_active_employed
    await EmployeeStatusService.setStatusByName(
      id,
      "status_active_employed",
      userId,
    );
    console.log("✓ status_active_employed activated");

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "sync_employee",
        userId,
        source: "reinstate_employee",
      });
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "unblock_employee",
        userId,
        source: "reinstate_employee",
        reasonCode: "status_active_employed",
        statusReason: "Employee reinstated in PassDesk",
      });
    }

    res.json({
      success: true,
      message: `Сотрудник ${employee.firstName} ${employee.lastName} восстановлен`,
      data: {
        employeeId: id,
        action: "reinstated",
      },
    });
  } catch (error) {
    console.error("Error reinstating employee:", error);
    next(error);
  }
};

/**
 * Деактивировать сотрудника (установить status_active_inactive)
 */
export const deactivateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    console.log(
      `=== DEACTIVATING EMPLOYEE: ${employee.firstName} ${employee.lastName} ===`,
    );

    // Устанавливаем status_active_inactive
    await EmployeeStatusService.setStatusByName(
      id,
      "status_active_inactive",
      userId,
    );
    console.log("✓ status_active_inactive activated");

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "block_employee",
        userId,
        source: "deactivate_employee",
        reasonCode: "status_active_inactive",
        statusReason: "Employee deactivated in PassDesk",
        priority: "high",
      });
    }

    res.json({
      success: true,
      message: `Сотрудник ${employee.firstName} ${employee.lastName} деактивирован`,
      data: {
        employeeId: id,
        action: "deactivated",
      },
    });
  } catch (error) {
    console.error("Error deactivating employee:", error);
    next(error);
  }
};

/**
 * Активировать сотрудника (установить status_active_employed)
 */
export const activateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const employee = await Employee.findByPk(id, {
      include: employeeAccessInclude,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Сотрудник не найден",
      });
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    console.log(
      `=== ACTIVATING EMPLOYEE: ${employee.firstName} ${employee.lastName} ===`,
    );

    // Деактивируем текущий статус из группы status_active
    const currentActiveStatus = await EmployeeStatusService.getCurrentStatus(
      id,
      "status_active",
    );
    if (currentActiveStatus) {
      currentActiveStatus.isActive = false;
      currentActiveStatus.isUpload = false;
      currentActiveStatus.updatedBy = userId;
      currentActiveStatus.updatedAt = new Date();
      await currentActiveStatus.save();
      console.log("✓ Previous status deactivated");
    }

    // Устанавливаем status_active_employed
    await EmployeeStatusService.setStatusByName(
      id,
      "status_active_employed",
      userId,
    );
    console.log("✓ status_active_employed activated");

    if (isSkudEnabled()) {
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "sync_employee",
        userId,
        source: "activate_employee",
      });
      await enqueueSkudSyncForEmployee({
        employeeId: id,
        operation: "unblock_employee",
        userId,
        source: "activate_employee",
        reasonCode: "status_active_employed",
        statusReason: "Employee activated in PassDesk",
      });
    }

    res.json({
      success: true,
      message: `Сотрудник ${employee.firstName} ${employee.lastName} активирован`,
      data: {
        employeeId: id,
        action: "activated",
      },
    });
  } catch (error) {
    console.error("Error activating employee:", error);
    next(error);
  }
};

export const checkEmployeeByInn = async (req, res, next) => {
  try {
    const { inn } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userCounterpartyId = req.user.counterpartyId;

    console.log(
      "🔍 checkEmployeeByInn - inn:",
      inn,
      "userRole:",
      userRole,
      "userCounterpartyId:",
      userCounterpartyId,
    );

    // Валидация параметра
    if (!inn || typeof inn !== "string") {
      return res.status(400).json({
        success: false,
        message: "Параметр inn обязателен",
      });
    }

    // Нормализуем ИНН (убираем дефисы, оставляем только цифры)
    const normalizedInn = inn.replace(/[^\d]/g, "");
    console.log("🔍 Normalized INN:", normalizedInn);

    // Валидация длины ИНН
    if (normalizedInn.length !== 10 && normalizedInn.length !== 12) {
      return res.status(400).json({
        success: false,
        message: "ИНН должен содержать 10 или 12 цифр",
      });
    }

    // Настраиваем include для маппинга контрагентов
    const mappingInclude = {
      model: EmployeeCounterpartyMapping,
      as: "employeeCounterpartyMappings",
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "type", "inn", "kpp"],
        },
        {
          model: Department,
          as: "department",
          attributes: ["id", "name"],
        },
        {
          model: ConstructionSite,
          as: "constructionSite",
          attributes: ["id", "shortName", "fullName"],
        },
      ],
    };

    // ЭТАП 1: Проверяем сотрудника в контрагенте пользователя
    let where = { inn: normalizedInn, isDeleted: false };
    let userAccessMapping = { ...mappingInclude };

    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (userRole !== "admin") {
      // Для user и manager - проверяем только свой контрагент
      if (userCounterpartyId === defaultCounterpartyId) {
        // Контрагент по умолчанию: ищем сотрудников, созданных пользователем
        where.createdBy = userId;
      } else {
        // Другие контрагенты: ищем через маппинг
        userAccessMapping.where = { counterpartyId: userCounterpartyId };
        userAccessMapping.required = true;
      }
    }
    // Для админа - ограничений по контрагенту нет

    // Ищем сотрудника в контрагенте пользователя
    const employeeInUserAccess = await Employee.findOne({
      where,
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code", "requiresPatent"],
        },
        {
          model: Position,
          as: "position",
          attributes: ["id", "name"],
        },
        userAccessMapping,
      ],
    });

    if (employeeInUserAccess) {
      // Сотрудник найден в контрагенте пользователя
      console.log(
        "✅ Сотрудник найден в контрагенте пользователя:",
        employeeInUserAccess.id,
      );
      return res.json({
        success: true,
        data: {
          employee: buildInnLookupEmployeePayload(employeeInUserAccess),
          exists: true,
          isOwner: true, // Сотрудник создан этим пользователем или найден в его контрагенте
        },
      });
    }

    // ЭТАП 2: Если не админ и сотрудника нет в его контрагенте - проверяем есть ли он в других
    if (userRole !== "admin") {
      // 🎯 СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ USER В DEFAULT КОНТРАГЕНТЕ
      if (userRole === "user" && userCounterpartyId === defaultCounterpartyId) {
        // Ищем сотрудника В DEFAULT контрагенте (неважно, есть ли он в других)
        const employeeInSameCounterparty = await Employee.findOne({
          where: { inn: normalizedInn, isDeleted: false },
          include: [
            {
              model: Citizenship,
              as: "citizenship",
              attributes: ["id", "name", "code", "requiresPatent"],
            },
            {
              model: Position,
              as: "position",
              attributes: ["id", "name"],
            },
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              where: { counterpartyId: defaultCounterpartyId },
              required: true,
              include: [
                {
                  model: Counterparty,
                  as: "counterparty",
                  attributes: ["id", "name", "type", "inn", "kpp"],
                },
                {
                  model: Department,
                  as: "department",
                  attributes: ["id", "name"],
                },
                {
                  model: ConstructionSite,
                  as: "constructionSite",
                  attributes: ["id", "shortName", "fullName"],
                },
              ],
            },
          ],
        });

        if (employeeInSameCounterparty) {
          // ✅ Сотрудник найден в default контрагенте - можно привязать
          console.log(
            "✅ Сотрудник найден в default контрагенте (создан другим пользователем):",
            employeeInSameCounterparty.id,
          );
          return res.json({
            success: true,
            data: {
              employee: buildInnLookupEmployeePayload(
                employeeInSameCounterparty,
              ),
              exists: true,
              isOwner: false, // Сотрудник создан другим пользователем
              canLink: true, // Разрешить привязать к текущему пользователю
            },
          });
        }
      }

      // ❌ СТАНДАРТНАЯ ЛОГИКА ДЛЯ ОСТАЛЬНЫХ
      const employeeInAnotherCounterparty = await Employee.findOne({
        where: { inn: normalizedInn, isDeleted: false },
        include: [
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            attributes: ["counterpartyId"],
            required: true,
          },
        ],
      });

      if (employeeInAnotherCounterparty) {
        // Сотрудник найден в ДРУГОМ контрагенте - ошибка доступа
        console.log(
          "❌ Сотрудник найден в другом контрагенте:",
          employeeInAnotherCounterparty.id,
        );
        return res.status(409).json({
          success: false,
          message:
            "Сотрудник с таким ИНН уже существует. Обратитесь к администратору.",
        });
      }
    } else {
      // Для админа проверяем во всех контрагентах
      const anyEmployee = await Employee.findOne({
        where: { inn: normalizedInn, isDeleted: false },
        include: [
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            attributes: ["counterpartyId"],
            required: true,
          },
        ],
      });

      if (anyEmployee) {
        // Сотрудник найден где-то - ошибка дублирования
        console.log(
          "❌ Сотрудник с таким ИНН уже существует в системе:",
          anyEmployee.id,
        );
        return res.status(409).json({
          success: false,
          message: "Сотрудник с таким ИНН уже существует в системе",
        });
      }
    }

    // ЭТАП 3: Сотрудник не найден вообще
    console.log("ℹ️ Сотрудник не найден");
    return res.status(404).json({
      success: false,
      message: "Сотрудник не найден",
    });
  } catch (error) {
    console.error("Error checking employee by inn:", error);
    next(error);
  }
};

export const searchEmployees = async (req, res, next) => {
  try {
    const { query, counterpartyId, position } = req.query;
    const normalizedSearch = String(query || "").trim();
    const hasSearchQuery = normalizedSearch.length > 0;

    const where = { isDeleted: false, markedForDeletion: false };
    const userId = req.user.id;

    // Переопределяем логику поиска

    const counterpartyMappingInclude = {
      model: EmployeeCounterpartyMapping,
      as: "employeeCounterpartyMappings",
      required: false,
      attributes: ["counterpartyId"],
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name"],
        },
      ],
    };
    const include = [counterpartyMappingInclude];

    // Если пользователь не админ, добавляем фильтр по маппингу или createdBy
    if (req.user.role !== "admin") {
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );

      if (req.user.counterpartyId === defaultCounterpartyId) {
        where.createdBy = userId;
      } else {
        // Фильтруем через маппинг
        counterpartyMappingInclude.where = {
          counterpartyId: req.user.counterpartyId,
        };
        counterpartyMappingInclude.required = true;
      }
    } else if (counterpartyId) {
      // Админ может фильтровать по переданному counterpartyId
      counterpartyMappingInclude.where = { counterpartyId };
      counterpartyMappingInclude.required = true;
    }

    if (position) {
      // Позиция теперь в таблице Position, а не поле position
      // Но здесь в старом коде было where.position. Исправим на связь.
      include.push({
        model: Position,
        as: "position",
        where: { name: { [Op.iLike]: `%${position}%` } },
        attributes: ["id", "name"],
      });
    }

    const employees = await Employee.findAll({
      where,
      order: [
        ["firstName", "ASC"],
        ["middleName", "ASC"],
      ],
      include: include,
    });

    const searchedEmployees = hasSearchQuery
      ? employees.filter((employee) =>
          matchesEmployeeSearch(employee, normalizedSearch),
        )
      : employees;

    res.json({
      success: true,
      data: {
        employees: searchedEmployees,
      },
    });
  } catch (error) {
    console.error("Error searching employees:", error);
    next(error);
  }
};

/**
 * Получить профиль сотрудника текущего пользователя
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Находим связь пользователь-сотрудник
    let mapping = await UserEmployeeMapping.findOne({
      where: { userId },
      include: [
        {
          model: Employee,
          as: "employee",
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              attributes: [
                "counterpartyId",
                "departmentId",
                "constructionSiteId",
                "dismissedAt",
              ],
              include: [
                {
                  model: Counterparty,
                  as: "counterparty",
                  attributes: ["id", "name", "type"],
                },
                {
                  model: Department,
                  as: "department",
                  attributes: ["id", "name"],
                },
              ],
            },
            {
              model: Citizenship,
              as: "citizenship",
              attributes: ["id", "name", "code"],
            },
            {
              model: Position,
              as: "position",
              attributes: ["id", "name"],
            },
            {
              model: Pass,
              as: "passes",
              attributes: [
                "id",
                "passNumber",
                "status",
                "type",
                "validFrom",
                "validUntil",
              ],
              where: { status: "active" },
              required: false,
            },
          ],
        },
      ],
    });

    // Если маппинга нет, профиль сотрудника не был создан
    if (!mapping) {
      throw new AppError(
        "Профиль сотрудника не создан. Создайте сотрудника через форму добавления.",
        404,
      );
    }

    if (!mapping.employee) {
      throw new AppError("Профиль сотрудника не найден", 404);
    }

    const employeeData = mapping.employee.toJSON();
    if (
      !employeeData.counterparty &&
      Array.isArray(employeeData.employeeCounterpartyMappings) &&
      employeeData.employeeCounterpartyMappings.length > 0
    ) {
      employeeData.counterparty =
        employeeData.employeeCounterpartyMappings[0].counterparty || null;
    }

    res.json({
      success: true,
      data: {
        employee: employeeData,
      },
    });
  } catch (error) {
    console.error("Error getting my profile:", error);
    next(error);
  }
};

export const issueMyProfileSkudQr = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const mapping = await UserEmployeeMapping.findOne({
      where: { userId },
      attributes: ["employeeId"],
    });

    if (!mapping?.employeeId) {
      throw new AppError("Профиль сотрудника не найден", 404);
    }

    const data = await issueSkudQrTokenForEmployeeActivePass({
      employeeId: mapping.employeeId,
      channel:
        String(req.body?.channel || "mobile")
          .trim()
          .toLowerCase() || "mobile",
      issuedBy: userId,
    });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновить профиль сотрудника текущего пользователя
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    console.log("📝 Update profile request:", {
      userId,
      updateData,
    });

    // Находим связь пользователь-сотрудник
    const mapping = await UserEmployeeMapping.findOne({
      where: { userId },
    });

    if (!mapping) {
      throw new AppError("Профиль сотрудника не найден", 404);
    }

    const employee = await Employee.findByPk(mapping.employeeId);
    if (!employee || employee.isDeleted) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // Пользователи не могут изменять контрагента и некоторые системные поля
    const allowedFields = [
      "firstName",
      "lastName",
      "middleName",
      "positionId", // Изменено с position на positionId
      "citizenshipId",
      "birthDate",
      "inn",
      "snils",
      "kig",
      "passportNumber",
      "passportDate",
      "passportIssuer",
      "registrationAddress",
      "patentNumber",
      "patentIssueDate",
      "blankNumber",
      "email",
      "phone",
      "notes",
    ];

    const filteredData = {};
    allowedFields.forEach((field) => {
      if (updateData[field] === undefined) {
        return;
      }

      filteredData[field] = updateData[field] === "" ? null : updateData[field];
    });

    console.log("✅ Filtered data:", filteredData);

    // Обновляем профиль
    await employee.update({
      ...applyEmployeeSensitiveFieldEncryption(filteredData),
      updatedBy: userId,
    });

    // Загружаем обновленные данные с отношениями
    const updatedEmployee = await Employee.findByPk(employee.id, {
      include: [
        {
          model: Counterparty,
          as: "counterparty",
        },
        {
          model: Citizenship,
          as: "citizenship",
        },
        {
          model: Position, // Добавлена связь с Position
          as: "position",
          attributes: ["id", "name"],
        },
      ],
    });

    res.json({
      success: true,
      message: "Профиль успешно обновлен",
      data: {
        employee: updatedEmployee,
      },
    });
  } catch (error) {
    console.error("❌ Error updating my profile:", error);

    // Если это ошибка валидации Sequelize, возвращаем детали
    if (error.name === "SequelizeValidationError") {
      const validationErrors = error.errors.map((err) => ({
        field: err.path,
        message: err.message,
        value: err.value,
      }));

      console.error("Validation errors:", validationErrors);

      return res.status(400).json({
        success: false,
        message: "Ошибка валидации",
        errors: validationErrors,
      });
    }

    next(error);
  }
};

/**
 * Перевести сотрудника в другую компанию (контрагента)
 * Создает запись в employee_counterparty_mapping
 * Доступно только для admin
 */
export const transferEmployeeToCounterparty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { counterpartyId } = req.body;
    const userId = req.user.id;

    // Проверяем, что сотрудник существует
    const employee = await Employee.findByPk(id);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // Проверяем, что контрагент существует
    const counterparty = await Counterparty.findByPk(counterpartyId);
    if (!counterparty) {
      throw new AppError("Контрагент не найден", 404);
    }

    // Проверяем, нет ли уже такой связи
    const existingMapping = await EmployeeCounterpartyMapping.findOne({
      where: {
        employeeId: id,
        counterpartyId: counterpartyId,
      },
    });

    if (existingMapping) {
      throw new AppError("Сотрудник уже привязан к этому контрагенту", 400);
    }

    // Создаем новую запись в маппинге
    const mapping = await EmployeeCounterpartyMapping.create({
      employeeId: id,
      counterpartyId: counterpartyId,
      departmentId: null,
      constructionSiteId: null,
    });

    console.log(
      `✅ Сотрудник ${id} переведен в контрагента ${counterpartyId} пользователем ${userId}`,
    );

    res.json({
      success: true,
      message: `Сотрудник успешно переведен в компанию "${counterparty.name}"`,
      data: {
        mapping,
        counterparty: {
          id: counterparty.id,
          name: counterparty.name,
          inn: counterparty.inn,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error transferring employee to counterparty:", error);
    next(error);
  }
};

/**
 * Импорт сотрудников из Excel
 * Шаг 1: Валидация и проверка контрагентов
 */
export const validateEmployeesImport = async (req, res, next) => {
  try {
    const { employees } = req.body;
    const userId = req.user.id;
    const userCounterpartyId = req.user.counterpartyId; // ID контрагента пользователя

    if (!userCounterpartyId) {
      throw new AppError("У пользователя не указан контрагент", 403);
    }

    const { validateEmployeesImport: validateImport } =
      await import("../services/employeeImportService.js");
    const result = await validateImport(employees, userId, userCounterpartyId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error validating employees import:", error);
    next(error);
  }
};

/**
 * Импорт сотрудников из Excel
 * Шаг 2: Финальный импорт с разрешением конфликтов
 */
export const importEmployees = async (req, res, next) => {
  const startTime = Date.now();
  let auditLogId = null;

  try {
    const { employees, conflictResolutions } = req.body;
    const userId = req.user.id;
    const userCounterpartyId = req.user.counterpartyId; // ID контрагента пользователя

    if (!userCounterpartyId) {
      throw new AppError("У пользователя не указан контрагент", 403);
    }

    // 📝 AUDIT LOG: Начало импорта
    const auditLog = await AuditLog.create({
      userId: userId,
      action: "EMPLOYEE_IMPORT_START",
      entityType: "employee",
      details: {
        recordsCount: employees?.length || 0,
        counterpartyId: userCounterpartyId,
        hasConflictResolutions:
          !!conflictResolutions && Object.keys(conflictResolutions).length > 0,
      },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get("user-agent"),
      status: "success",
    });
    auditLogId = auditLog.id;

    const { importEmployees: executeImport } =
      await import("../services/employeeImportService.js");
    const results = await executeImport(
      employees,
      conflictResolutions,
      userId,
      userCounterpartyId,
    );

    const duration = Date.now() - startTime;

    // 📝 AUDIT LOG: Завершение импорта
    await AuditLog.create({
      userId: userId,
      action: "EMPLOYEE_IMPORT_COMPLETE",
      entityType: "employee",
      details: {
        recordsCount: employees?.length || 0,
        created: results.created || 0,
        updated: results.updated || 0,
        skipped: results.skipped || 0,
        errors: results.errors?.length || 0,
        duration: `${duration}ms`,
        counterpartyId: userCounterpartyId,
      },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get("user-agent"),
      status: results.errors?.length > 0 ? "partial" : "success",
    });

    // 🚨 Отправка уведомления админам при больших импортах (>1000 записей)
    if (employees?.length > 1000) {
      console.log(
        `🚨 ВНИМАНИЕ: Массовый импорт! Пользователь ${userId} импортировал ${employees.length} записей. Результат: создано ${results.created}, обновлено ${results.updated}, ошибок ${results.errors?.length || 0}`,
      );
    }

    res.json({
      success: true,
      message: "Импорт завершен",
      data: results,
    });
  } catch (error) {
    console.error("❌ Error importing employees:", error);

    // 📝 AUDIT LOG: Ошибка импорта
    if (req.user?.id) {
      await AuditLog.create({
        userId: req.user.id,
        action: "EMPLOYEE_IMPORT_FAILED",
        entityType: "employee",
        details: {
          recordsCount: req.body.employees?.length || 0,
          counterpartyId: req.user.counterpartyId,
          duration: `${Date.now() - startTime}ms`,
        },
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get("user-agent"),
        status: "failed",
        errorMessage: error.message,
      }).catch((auditError) => {
        console.error("❌ Failed to create audit log:", auditError);
      });
    }

    next(error);
  }
};

/**
 * Получить активных сотрудников для выгрузки (ОТДЕЛЬНЫЙ эндпоинт)
 * С фильтрацией только по активным статусам без сложных JOIN'ов в subquery
 */
export const getActiveEmployeesForExport = async (req, res, next) => {
  try {
    const { limit = 100, page = 1, search = "", dateFrom, dateTo } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const offset = (pageNumber - 1) * limitNumber;
    const normalizedSearch = String(search || "").trim();
    const hasSearchQuery = normalizedSearch.length > 0;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userCounterpartyId = req.user?.counterpartyId;
    ensureEmployeeRoleAllowed(userRole);

    // Основной фильтр: исключаем записи из корзины
    const where = {
      isDeleted: false,
      markedForDeletion: false,
    };

    // Только активные статусы для выгрузки.
    // Поддерживаем как текущие, так и legacy-коды.
    const activeStatuses = [
      "status_active_employed",
      "status_hr_edited",
      "status_new",
      "status_tb_passed",
      "status_processed",
    ];

    const parseFilterDate = (value, { endOfDay = false } = {}) => {
      if (!value) {
        return null;
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new AppError("Некорректный формат даты фильтра", 400);
      }

      if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
      } else {
        parsed.setHours(0, 0, 0, 0);
      }

      return parsed;
    };

    const startDate = parseFilterDate(dateFrom);
    const endDate = parseFilterDate(dateTo, { endOfDay: true });

    const statusMappingsWhere = {
      isActive: true,
    };

    if (startDate || endDate) {
      let rangeOperator = Op.between;
      let rangeValue = [startDate, endDate];

      if (startDate && !endDate) {
        rangeOperator = Op.gte;
        rangeValue = startDate;
      } else if (!startDate && endDate) {
        rangeOperator = Op.lte;
        rangeValue = endDate;
      }

      statusMappingsWhere[Op.or] = [
        { createdAt: { [rangeOperator]: rangeValue } },
        { updatedAt: { [rangeOperator]: rangeValue } },
      ];
    }

    const employeeInclude = [
      {
        model: Citizenship,
        as: "citizenship",
        attributes: ["id", "name", "code", "requiresPatent"],
      },
      {
        model: Citizenship,
        as: "birthCountry",
        attributes: ["id", "name", "code"],
      },
      {
        model: User,
        as: "creator",
        attributes: ["id", "firstName", "lastName"],
      },
      {
        model: Position,
        as: "position",
        attributes: ["id", "name"],
      },
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name", "type", "inn", "kpp"],
          },
          {
            model: Department,
            as: "department",
            attributes: ["id", "name"],
          },
          {
            model: ConstructionSite,
            as: "constructionSite",
            attributes: ["id", "shortName", "fullName"],
          },
        ],
      },
      // Простой include статусов БЕЗ nested INNER JOIN для statusMappings->status
      {
        model: EmployeeStatusMapping,
        as: "statusMappings",
        attributes: [
          "id",
          "statusId",
          "isActive",
          "isUpload",
          "statusGroup",
          "createdAt",
          "updatedAt",
        ],
        where: statusMappingsWhere,
        required: true,
        include: [
          {
            model: Status,
            as: "status",
            attributes: ["id", "name", "group"],
            where: {
              name: activeStatuses,
            },
            required: true,
          },
        ],
      },
    ];

    // Фильтрация по роли
    if (userRole === "user") {
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );

      if (userCounterpartyId === defaultCounterpartyId) {
        employeeInclude.push({
          model: UserEmployeeMapping,
          as: "userEmployeeMappings",
          where: {
            userId: userId,
            counterpartyId: null,
          },
          required: true,
        });
      } else {
        employeeInclude[4].where = {
          counterpartyId: userCounterpartyId,
        };
        employeeInclude[4].required = true;
      }
    }

    // Подсчет total в режиме поиска считаем после in-memory фильтрации.
    let totalCount = null;
    if (!hasSearchQuery) {
      if (
        userRole === "user" &&
        userCounterpartyId ===
          (await Setting.getSetting("default_counterparty_id"))
      ) {
        totalCount = await Employee.count({
          where: {
            ...where,
            createdBy: userId,
          },
          include: [
            {
              model: EmployeeStatusMapping,
              as: "statusMappings",
              where: statusMappingsWhere,
              required: true,
              attributes: [],
              include: [
                {
                  model: Status,
                  as: "status",
                  where: { name: activeStatuses },
                  required: true,
                  attributes: [],
                },
              ],
            },
          ],
          distinct: true,
          subQuery: false,
        });
      } else if (userRole === "user") {
        totalCount = await Employee.count({
          where,
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              where: { counterpartyId: userCounterpartyId },
              required: true,
              attributes: [],
            },
            {
              model: EmployeeStatusMapping,
              as: "statusMappings",
              where: statusMappingsWhere,
              required: true,
              attributes: [],
              include: [
                {
                  model: Status,
                  as: "status",
                  where: { name: activeStatuses },
                  required: true,
                  attributes: [],
                },
              ],
            },
          ],
          distinct: true,
          subQuery: false,
        });
      } else {
        totalCount = await Employee.count({
          where,
          include: [
            {
              model: EmployeeStatusMapping,
              as: "statusMappings",
              where: statusMappingsWhere,
              required: true,
              attributes: [],
              include: [
                {
                  model: Status,
                  as: "status",
                  where: { name: activeStatuses },
                  required: true,
                  attributes: [],
                },
              ],
            },
          ],
          distinct: true,
          subQuery: false,
        });
      }
    }

    // Загружаем данные без subQuery (простой подход)
    const rows = await Employee.findAll({
      where,
      limit: hasSearchQuery ? undefined : limitNumber,
      offset: hasSearchQuery ? undefined : offset,
      order: [
        ["firstName", "ASC"],
        ["middleName", "ASC"],
      ],
      include: employeeInclude,
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*)::int
              FROM files
              WHERE files.entity_type = 'employee'
                AND files.entity_id = "Employee"."id"
                AND files.is_deleted = false
            )`),
            "filesCount",
          ],
        ],
      },
      subQuery: false,
      raw: false,
      nest: true,
    });

    // Удаляем дубликаты (из-за множественных маппингов)
    const seen = new Set();
    const uniqueRows = rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    const employeesWithStatus = uniqueRows.map((employee) => {
      const employeeData = employee.toJSON();
      employeeData.statusCard = calculateStatusCard(employeeData);
      return employeeData;
    });

    let employeesForResponse = employeesWithStatus;
    let finalTotalCount = totalCount ?? employeesWithStatus.length;

    if (hasSearchQuery) {
      const searchedEmployees = employeesWithStatus.filter((employee) =>
        matchesEmployeeSearch(employee, normalizedSearch),
      );
      finalTotalCount = searchedEmployees.length;
      employeesForResponse = searchedEmployees.slice(
        offset,
        offset + limitNumber,
      );
    }

    res.json({
      success: true,
      data: {
        employees: employeesForResponse,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: finalTotalCount,
          pages: Math.ceil(finalTotalCount / limitNumber),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching active employees for export:", error);
    next(error);
  }
};
