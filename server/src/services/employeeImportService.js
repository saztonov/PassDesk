/**
 * Сервис для импорта сотрудников из Excel
 */

import {
  Employee,
  Counterparty,
  Citizenship,
  CitizenshipSynonym,
  Position,
  Department,
  Pass,
  Status,
  EmployeeCounterpartyMapping,
  EmployeeStatusMapping,
  Setting,
  CounterpartySubcounterpartyMapping,
} from "../models/index.js";
import {
  validateEmployeeForImportOptimized,
  checkEmployeeConflictFromCache,
  validateKppConsistency,
} from "../utils/importValidation.js";
import { AppError } from "../middleware/errorHandler.js";
import { Op } from "sequelize";
import {
  getImportStatuses,
  updateEmployeeStatusesByCompleteness,
} from "../utils/employeeStatusUpdater.js";
import EmployeeStatusService from "./employeeStatusService.js";
import { DEFAULT_FORM_CONFIG } from "../utils/employeeFieldsConfig.js";
import {
  applyLegacySensitivePlaintextPolicy,
  buildEmployeeSensitiveFieldsPatch,
} from "./employeeSensitiveFieldService.js";
import {
  ENCRYPTED_EMPLOYEE_FIELDS,
  hashForSearch,
  isFieldEncryptionEnabled,
} from "./encryptionService.js";

const applyEmployeeSensitiveFieldEncryption = (payload = {}) => {
  const encryptionPatch = buildEmployeeSensitiveFieldsPatch(payload);
  const normalizedPayload = applyLegacySensitivePlaintextPolicy(payload);
  return {
    ...normalizedPayload,
    ...encryptionPatch,
  };
};

const normalizeDepartmentName = (value) =>
  String(value || "")
    .replace(/\/\s*закр\b/gi, "")
    .replace(/\(\d+\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizePassNumber = (value) => String(value || "").trim();
const IMPORTED_PASS_VALID_UNTIL = new Date("2099-12-31T23:59:59.999Z");

const normalizeEmploymentStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("уволен") || normalized === "fired") {
    return "fired";
  }

  if (normalized.includes("неактив") || normalized === "inactive") {
    return "inactive";
  }

  if (
    normalized.includes("устроен") ||
    normalized.includes("работает") ||
    normalized.includes("актив") ||
    normalized === "employed"
  ) {
    return "employed";
  }

  return "";
};

/**
 * Валидирует данные для импорта сотрудников (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ 2.1)
 */
export const validateEmployeesImport = async (
  employees,
  userId,
  userCounterpartyId,
) => {
  console.log(
    "📥 validateEmployeesImport - количество записей:",
    employees?.length || 0,
  );

  if (!Array.isArray(employees) || employees.length === 0) {
    throw new AppError("Данные сотрудников не предоставлены", 400);
  }

  if (!userCounterpartyId) {
    throw new AppError("У пользователя не указан контрагент", 403);
  }

  console.log("⚡ ОПТИМИЗАЦИЯ: Загружаем все справочники одним запросом...");
  const startTime = Date.now();

  // 🚀 ШАГ 1: Загружаем все справочники ОДИН РАЗ
  const [
    requiredStatuses,
    subcontractors,
    allCounterparties,
    allCitizenships,
    allCitizenshipSynonyms,
    allPositions,
    defaultCounterpartyId,
  ] = await Promise.all([
    // Статусы
    Status.findAll({
      where: { name: ["status_draft", "status_card_draft"] },
    }),
    // Субподрядчики
    CounterpartySubcounterpartyMapping.findAll({
      where: { parentCounterpartyId: userCounterpartyId },
      attributes: ["childCounterpartyId"],
    }),
    // ВСЕ контрагенты (300 записей)
    Counterparty.findAll({
      attributes: ["id", "inn", "kpp", "name"],
    }),
    // ВСЕ гражданства (~200 записей)
    Citizenship.findAll({
      attributes: ["id", "name", "requiresPatent"],
    }),
    // ВСЕ синонимы гражданств
    CitizenshipSynonym.findAll({
      attributes: ["id", "citizenshipId", "synonym"],
    }),
    // ВСЕ должности (~100 записей)
    Position.findAll({
      attributes: ["id", "name"],
    }),
    Setting.getSetting("default_counterparty_id"),
  ]);

  console.log(`✅ Справочники загружены за ${Date.now() - startTime}ms:`, {
    counterparties: allCounterparties.length,
    citizenships: allCitizenships.length,
    positions: allPositions.length,
    synonyms: allCitizenshipSynonyms.length,
  });

  // Проверяем требуемые статусы
  const foundStatusNames = requiredStatuses.map((s) => s.name);
  const missingStatuses = ["status_draft", "status_card_draft"].filter(
    (s) => !foundStatusNames.includes(s),
  );

  if (missingStatuses.length > 0) {
    console.error("❌ Отсутствуют статусы:", missingStatuses);
    throw new AppError(
      `Ошибка системы: не найдены статусы: ${missingStatuses.join(", ")}`,
      500,
    );
  }

  // 🔒 Разрешенные контрагенты
  const allowedCounterpartyIds = [
    userCounterpartyId,
    ...subcontractors.map((s) => s.childCounterpartyId),
  ];
  const defaultCounterparty =
    allCounterparties.find((counterparty) => counterparty.id === defaultCounterpartyId) ||
    null;

  if (employees.some((employee) => employee?.idAll) && !defaultCounterparty) {
    throw new AppError(
      "Не настроен контрагент по умолчанию для импорта сотрудников из 1С",
      500,
    );
  }
  console.log(
    `🔒 Разрешенные контрагенты для импорта: ${allowedCounterpartyIds.length} (свой + ${subcontractors.length} субподрядчиков)`,
  );

  // 🚀 ШАГ 2: Загружаем существующих сотрудников ТОЛЬКО по ИНН из файла
  const innsFromFile = employees
    .map((emp) => emp.inn)
    .filter((inn) => inn && String(inn).trim() !== "")
    .map((inn) => String(inn).replace(/[^\d]/g, ""));

  const uniqueInns = [...new Set(innsFromFile)];
  const uniqueIdAlls = [
    ...new Set(
      employees
        .map((emp) => String(emp.idAll || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  console.log(
    `⚡ ОПТИМИЗАЦИЯ: Загружаем существующих сотрудников по ${uniqueInns.length} ИНН и ${uniqueIdAlls.length} id_all из файла...`,
  );

  const existingEmployees =
    uniqueInns.length > 0 || uniqueIdAlls.length > 0
      ? await Employee.findAll({
          where: {
            [Op.or]: [
              uniqueInns.length > 0 ? { inn: { [Op.in]: uniqueInns } } : null,
              uniqueIdAlls.length > 0 ? { idAll: { [Op.in]: uniqueIdAlls } } : null,
            ].filter(Boolean),
          },
          attributes: [
            "id",
            "idAll",
            "firstName",
            "lastName",
            "lastNameHash",
            "middleName",
            "inn",
            "snils",
          ],
        })
      : [];

  console.log(
    `✅ Найдено ${existingEmployees.length} существующих сотрудников за ${Date.now() - startTime}ms`,
  );

  // Создаем кэши для быстрого поиска
  const caches = {
    counterparties: allCounterparties.map((c) => c.toJSON()),
    citizenships: allCitizenships.map((c) => c.toJSON()),
    citizenshipSynonyms: allCitizenshipSynonyms.map((s) => s.toJSON()),
    positions: allPositions.map((p) => p.toJSON()),
    existingEmployees: existingEmployees.map((e) => e.toJSON()),
  };

  // Мапа для новых должностей, созданных во время валидации
  const newPositionsMap = new Map();
  const newCitizenshipsMap = new Map();

  // Проверяем консистентность КПП для одного ИНН
  const kppErrors = validateKppConsistency(employees);
  const validationErrors = kppErrors.map((err) => ({
    rowIndex: err.rowIndex,
    lastName: employees[err.rowIndex - 1]?.lastName || "",
    firstName: employees[err.rowIndex - 1]?.firstName || "",
    inn: employees[err.rowIndex - 1]?.inn || "",
    errors: [err.error],
  }));

  // 🚀 ШАГ 3: Валидируем каждого сотрудника используя кэши
  const validatedEmployees = [];
  const conflictingInns = [];
  const existingEmployeesMap = {};

  console.log(
    `⚡ ОПТИМИЗАЦИЯ: Начинаем валидацию ${employees.length} сотрудников...`,
  );

  for (let index = 0; index < employees.length; index++) {
    const emp = employees[index];

    // Пропускаем строки с ошибками КПП
    if (kppErrors.some((e) => e.rowIndex === index + 1)) {
      continue;
    }

    try {
      // Используем оптимизированную функцию валидации
      const validation = await validateEmployeeForImportOptimized(
        emp,
        userId,
        caches,
        newPositionsMap,
        {
          defaultCounterparty: defaultCounterparty?.toJSON?.() || defaultCounterparty,
          newCitizenshipsMap,
        },
      );

      if (!validation.valid) {
        validationErrors.push({
          rowIndex: index + 1,
          lastName: emp.lastName || "",
          firstName: emp.firstName || "",
          inn: emp.inn || "",
          errors: validation.errors,
        });
        continue;
      }

      const validated = validation.validated;
      validated.rowIndex = index + 1;

      const useDefaultCounterparty = Boolean(validated.idAll && defaultCounterparty);

      // 🔒 ПРОВЕРКА БЕЗОПАСНОСТИ: Контрагент должен быть разрешен для импорта
      if (
        validated.counterparty &&
        !allowedCounterpartyIds.includes(validated.counterparty.id) &&
        !useDefaultCounterparty
      ) {
        validationErrors.push({
          rowIndex: index + 1,
          lastName: emp.lastName || "",
          firstName: emp.firstName || "",
          inn: emp.inn || "",
          errors: [
            `Контрагент создан другой организацией. Вы не можете вносить данные о его сотрудниках.`,
          ],
        });
        continue;
      }

      if (
        !validated.counterparty &&
        (emp.counterpartyInn || emp.counterpartyKpp)
      ) {
        validationErrors.push({
          rowIndex: index + 1,
          lastName: emp.lastName || "",
          firstName: emp.firstName || "",
          inn: emp.inn || "",
          errors: [
            `Контрагент не найден в базе данных. Добавьте его в справочнике Контрагенты.`,
          ],
        });
        continue;
      }

      // Проверяем конфликты используя кэш
      const conflicts = checkEmployeeConflictFromCache(
        validated,
        caches.existingEmployees,
      );

      if (useDefaultCounterparty && conflicts.length > 0) {
        validatedEmployees.push(validated);
        continue;
      }

      if (conflicts.length > 0 && validated.inn) {
        // Есть конфликты по ИНН, СНИЛС или ФИО
        const existingByInn = caches.existingEmployees.find(
          (e) => e.inn === validated.inn,
        );

        if (existingByInn && !existingEmployeesMap[validated.inn]) {
          conflictingInns.push({
            inn: validated.inn,
            newEmployee: {
              idAll: validated.idAll,
              firstName: validated.firstName,
              lastName: validated.lastName,
              middleName: validated.middleName,
              inn: validated.inn,
              snils: validated.snils,
              kig: validated.kig,
              birthDate: validated.birthDate,
              kigEndDate: validated.kigEndDate,
              position: validated.position,
              citizenship: validated.citizenship,
              counterparty: validated.counterparty,
              department: validated.department,
              isClosedBrigade: validated.isClosedBrigade,
              employmentStatus: validated.employmentStatus,
              dismissalDate: validated.dismissalDate,
              phone: validated.phone,
              personalPhone: validated.personalPhone,
              workPhone: validated.workPhone,
              passportType: validated.passportType,
              passportNumber: validated.passportNumber,
              passportDate: validated.passportDate,
              passportIssuer: validated.passportIssuer,
              passportExpiryDate: validated.passportExpiryDate,
              registrationAddress: validated.registrationAddress,
              patentIssueDate: validated.patentIssueDate,
              patentNumber: validated.patentNumber,
              blankNumber: validated.blankNumber,
              passNumber: validated.passNumber,
            },
            existingEmployee: {
              id: existingByInn.id,
              firstName: existingByInn.firstName,
              lastName: existingByInn.lastName,
              middleName: existingByInn.middleName,
              inn: existingByInn.inn,
              snils: existingByInn.snils,
              idAll: existingByInn.idAll,
            },
          });
          existingEmployeesMap[validated.inn] = existingByInn;
          continue;
        }
      }

      validatedEmployees.push(validated);
    } catch (error) {
      console.error(`⚠️ Ошибка валидации строки ${index + 1}:`, error.message);
      validationErrors.push({
        rowIndex: index + 1,
        lastName: emp.lastName || "",
        firstName: emp.firstName || "",
        inn: emp.inn || "",
        errors: [error.message],
      });
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`📊 Результаты валидации (за ${totalTime}ms):`, {
    validEmployeesCount: validatedEmployees.length,
    validationErrorsCount: validationErrors.length,
    conflictingInnsCount: conflictingInns.length,
    newPositionsCreated: newPositionsMap.size,
  });

  return {
    validEmployees: validatedEmployees,
    validationErrors,
    conflictingInns,
    hasErrors: validationErrors.length > 0,
    hasConflicts: conflictingInns.length > 0,
  };
};

/**
 * Импортирует сотрудников с разрешением конфликтов
 */
export const importEmployees = async (
  validatedEmployees,
  conflictResolutions,
  userId,
  userCounterpartyId,
) => {
  console.log("📥 importEmployees - начало импорта:", {
    count: validatedEmployees?.length || 0,
    resolutions: Object.keys(conflictResolutions || {}).length,
    userCounterpartyId,
  });

  if (!Array.isArray(validatedEmployees) || validatedEmployees.length === 0) {
    throw new AppError("Нет данных для импорта", 400);
  }

  if (!userCounterpartyId) {
    throw new AppError("У пользователя не указан контрагент", 403);
  }

  // 🔒 КРИТИЧЕСКАЯ ПРОВЕРКА: Загружаем контрагент пользователя
  const userCounterparty = await Counterparty.findByPk(userCounterpartyId);
  if (!userCounterparty) {
    throw new AppError("Контрагент пользователя не найден", 403);
  }
  console.log(`🏢 Контрагент пользователя: ${userCounterparty.name}`);

  // 🔒 Загружаем список разрешенных контрагентов (пользователь + его субподрядчики)
  const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
    where: { parentCounterpartyId: userCounterpartyId },
    attributes: ["childCounterpartyId"],
  });
  const allowedCounterpartyIds = [
    userCounterpartyId,
    ...subcontractors.map((s) => s.childCounterpartyId),
  ];
  console.log(
    `🔒 Разрешенные контрагенты для импорта: ${allowedCounterpartyIds.length} (свой + ${subcontractors.length} субподрядчиков)`,
  );

  // Получаем все необходимые статусы (включая для полных карточек)
  const statusMap = await getImportStatuses();

  // Загружаем конфигурацию полей для контрагента пользователя
  const defaultCounterpartyId = await Setting.getSetting(
    "default_counterparty_id",
  );
  const isDefaultCounterparty = userCounterparty.id === defaultCounterpartyId;
  const defaultCounterparty =
    defaultCounterpartyId && userCounterparty.id === defaultCounterpartyId
      ? userCounterparty
      : defaultCounterpartyId
        ? await Counterparty.findByPk(defaultCounterpartyId)
        : null;

  if (validatedEmployees.some((employee) => employee?.idAll) && !defaultCounterparty) {
    throw new AppError(
      "Не настроен контрагент по умолчанию для импорта сотрудников из 1С",
      500,
    );
  }

  // 🔒 БЕЗОПАСНОСТЬ: Проверяем что все контрагенты разрешены
  validatedEmployees.forEach((emp) => {
    const targetCounterpartyId = emp.idAll
      ? defaultCounterparty?.id || defaultCounterpartyId
      : emp.counterparty?.id || userCounterpartyId;
    if (
      targetCounterpartyId !== defaultCounterpartyId &&
      !allowedCounterpartyIds.includes(targetCounterpartyId)
    ) {
      throw new AppError(
        `Строка ${emp.rowIndex}: Контрагент "${emp.counterparty?.name}" не является вашим субподрядчиком`,
        403,
      );
    }
  });

  console.log(
    `✅ Все ${validatedEmployees.length} сотрудников относятся к разрешенным контрагентам`,
  );

  let formConfig = DEFAULT_FORM_CONFIG;

  try {
    const configKey = isDefaultCounterparty
      ? "employee_form_config_default"
      : "employee_form_config_external";

    const configStr = await Setting.getSetting(configKey);

    if (configStr) {
      formConfig = JSON.parse(configStr);
      console.log(`✅ Загружена конфигурация полей: ${configKey}`);
    } else {
      console.log(
        `⚠️  Конфигурация ${configKey} не найдена, используется дефолтная`,
      );
    }
  } catch (error) {
    console.warn(
      "⚠️  Ошибка загрузки конфигурации полей, используется дефолтная:",
      error.message,
    );
  }

  const departmentCache = new Map();
  const findOrCreateDepartmentForCounterparty = async (
    counterpartyId,
    departmentName,
  ) => {
    const normalizedName = normalizeDepartmentName(departmentName);
    if (!counterpartyId || !normalizedName) {
      return null;
    }

    const cacheKey = `${counterpartyId}:${normalizedName.toLowerCase()}`;
    if (departmentCache.has(cacheKey)) {
      return departmentCache.get(cacheKey);
    }

    let department = await Department.findOne({
      where: {
        counterpartyId,
        name: { [Op.iLike]: normalizedName },
      },
    });

    if (!department) {
      department = await Department.create({
        counterpartyId,
        name: normalizedName,
      });
      console.log(`   ✨ Создано подразделение: ${normalizedName}`);
    }

    departmentCache.set(cacheKey, department);
    return department;
  };

  const upsertImportedPassForEmployee = async (employeeId, passNumber) => {
    const normalizedPassNumber = normalizePassNumber(passNumber);
    if (!employeeId || !normalizedPassNumber) {
      return null;
    }

    const now = new Date();
    let pass = await Pass.findOne({
      where: { passNumber: normalizedPassNumber },
      order: [["updatedAt", "DESC"]],
    });

    if (pass) {
      const updates = {};
      if (String(pass.employeeId || "") !== String(employeeId)) {
        updates.employeeId = employeeId;
      }
      if (pass.passType !== "contractor") {
        updates.passType = "contractor";
      }
      if (pass.status !== "active") {
        updates.status = "active";
      }
      if (!pass.validFrom) {
        updates.validFrom = now;
      }
      if (!pass.validUntil) {
        updates.validUntil = IMPORTED_PASS_VALID_UNTIL;
      }
      if (Object.keys(updates).length > 0) {
        await pass.update(updates);
      }
      return pass;
    }

    pass = await Pass.findOne({
      where: { employeeId },
      order: [["updatedAt", "DESC"], ["createdAt", "DESC"]],
    });

    if (pass) {
      await pass.update({
        passNumber: normalizedPassNumber,
        passType: "contractor",
        status: "active",
        validFrom: pass.validFrom || now,
        validUntil: pass.validUntil || IMPORTED_PASS_VALID_UNTIL,
      });
      return pass;
    }

    return Pass.create({
      employeeId,
      passNumber: normalizedPassNumber,
      passType: "contractor",
      validFrom: now,
      validUntil: IMPORTED_PASS_VALID_UNTIL,
      status: "active",
      accessZones: [],
      issuedBy: userId,
      notes: "Imported from 1C employee Excel",
    });
  };

  const revokeImportedPassForEmployee = async (employeeId, passNumber) => {
    if (!employeeId) {
      return null;
    }

    const normalizedPassNumber = normalizePassNumber(passNumber);
    let pass = null;

    if (normalizedPassNumber) {
      pass = await Pass.findOne({
        where: { passNumber: normalizedPassNumber },
        order: [["updatedAt", "DESC"]],
      });
    }

    if (!pass) {
      pass = await Pass.findOne({
        where: { employeeId },
        order: [["updatedAt", "DESC"], ["createdAt", "DESC"]],
      });
    }

    if (!pass) {
      return null;
    }

    const updates = {};
    if (String(pass.employeeId || "") !== String(employeeId)) {
      updates.employeeId = employeeId;
    }
    if (pass.passType !== "contractor") {
      updates.passType = "contractor";
    }
    if (pass.status !== "revoked") {
      updates.status = "revoked";
    }
    if (!pass.revokedAt) {
      updates.revokedAt = new Date();
    }
    if (!pass.revokedBy) {
      updates.revokedBy = userId;
    }
    if (!pass.revokeReason) {
      updates.revokeReason = "Imported fired from 1C employee Excel";
    }

    if (Object.keys(updates).length > 0) {
      await pass.update(updates);
    }

    return pass;
  };

  const resolveImportedEmploymentStatus = (employeeData) => {
    const explicitStatus = normalizeEmploymentStatus(employeeData?.employmentStatus);
    if (explicitStatus) {
      return explicitStatus;
    }

    if (employeeData?.dismissalDate) {
      return "fired";
    }

    if (employeeData?.isClosedBrigade) {
      return "fired";
    }

    return "employed";
  };

  const resolveImportedDismissalDate = (employeeData) => {
    const targetEmploymentStatus = resolveImportedEmploymentStatus(employeeData);
    if (targetEmploymentStatus !== "fired") {
      return null;
    }

    return employeeData?.dismissalDate || null;
  };

  const syncImportedEmployeeStatuses = async (employeeId, employeeData) => {
    if (!employeeId) {
      return null;
    }

    const targetEmploymentStatus = resolveImportedEmploymentStatus(employeeData);
    const now = new Date();
    const currentActiveStatus = await EmployeeStatusService.getCurrentStatus(
      employeeId,
      "status_active",
    );
    const currentActiveStatusName = currentActiveStatus?.status?.name || null;

    if (targetEmploymentStatus === "fired") {
      await EmployeeStatusMapping.update(
        {
          isActive: false,
          isUpload: false,
          updatedBy: userId,
          updatedAt: now,
        },
        {
          where: {
            employeeId,
            statusGroup: "status_hr",
          },
        },
      );
    }

    if (
      targetEmploymentStatus === "employed" &&
      currentActiveStatusName === "status_active_fired"
    ) {
      const firedOffStatus = await Status.findOne({
        where: { name: "status_hr_fired_off" },
        attributes: ["id"],
      });

      if (firedOffStatus) {
        await EmployeeStatusMapping.update(
          {
            isActive: false,
            isUpload: false,
            updatedBy: userId,
            updatedAt: now,
          },
          {
            where: {
              employeeId,
              statusGroup: "status_hr",
              statusId: { [Op.ne]: firedOffStatus.id },
            },
          },
        );
        await EmployeeStatusService.activateOrCreateStatus(
          employeeId,
          "status_hr_fired_off",
          userId,
          false,
        );
      }
    }

    const statusName =
      targetEmploymentStatus === "fired"
        ? "status_active_fired"
        : targetEmploymentStatus === "inactive"
          ? "status_active_inactive"
          : "status_active_employed";

    await EmployeeStatusService.setStatusByName(employeeId, statusName, userId);
    return statusName;
  };

  const markEmployeeUploadedToZup = async (employeeId) => {
    if (!employeeId) {
      return 0;
    }

    const [updatedCount] = await EmployeeStatusMapping.update(
      {
        isUpload: true,
        updatedBy: userId,
        updatedAt: new Date(),
      },
      {
        where: {
          employeeId,
          isActive: true,
        },
      },
    );

    return updatedCount;
  };

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const batchSize = 100;

  for (let i = 0; i < validatedEmployees.length; i += batchSize) {
    const batch = validatedEmployees.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (emp) => {
        try {
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(
            `📝 ИМПОРТ СОТРУДНИКА: ${emp.lastName} ${emp.firstName} ${emp.middleName || ""}`,
          );
          // ⚠️ ПДН не выводятся в логи (ИНН, СНИЛС, КИГ удалены для безопасности)
          console.log(`   📋 Данные из файла:`, {
            idAll: emp.idAll || null,
            hasInn: !!emp.inn,
            hasSnils: !!emp.snils,
            hasKig: !!emp.kig,
            birthDate: emp.birthDate,
            kigEndDate: emp.kigEndDate,
            citizenship: emp.citizenship?.name,
            position: emp.position?.name,
            department: emp.department || null,
            isClosedBrigade: emp.isClosedBrigade === true,
            employmentStatus: resolveImportedEmploymentStatus(emp),
            hasPhone: !!emp.phone,
            hasCounterparty: !!emp.counterparty,
          });

          // Проверяем конфликт по ИНН
          const resolution = emp.inn ? conflictResolutions?.[emp.inn] : null;

          let employee;
          let isCreated = false;
          let existingEmployee = null;

          // ШАГ 1: Поиск по id_all (если есть)
          if (emp.idAll) {
            console.log(`   🔍 Ищем по id_all`);
            existingEmployee = await Employee.findOne({
              where: { idAll: emp.idAll },
            });

            if (existingEmployee) {
              console.log(`   ✅ Найден сотрудник по id_all:`, {
                id: existingEmployee.id,
                uuid: existingEmployee.id,
                idAll: existingEmployee.idAll,
                fio: `${existingEmployee.lastName} ${existingEmployee.firstName} ${existingEmployee.middleName || ""}`,
                hasInn: !!existingEmployee.inn,
                hasSnils: !!existingEmployee.snils,
                hasCitizenship: !!existingEmployee.citizenshipId,
              });
            }
          }

          // ШАГ 2: Если не нашли по id_all - ищем по ИНН
          if (!existingEmployee && emp.inn) {
            console.log(`   🔍 Ищем по ИНН`);
            existingEmployee = await Employee.findOne({
              where: { inn: emp.inn },
            });

            if (existingEmployee) {
              console.log(`   ✅ Найден сотрудник по ИНН:`, {
                id: existingEmployee.id,
                uuid: existingEmployee.id,
                idAll: existingEmployee.idAll,
                fio: `${existingEmployee.lastName} ${existingEmployee.firstName} ${existingEmployee.middleName || ""}`,
                hasInn: !!existingEmployee.inn,
                hasSnils: !!existingEmployee.snils,
                hasCitizenship: !!existingEmployee.citizenshipId,
              });
            } else {
              console.log(`   ⚠️  По ИНН не найден, ищем по ФИО...`);
            }
          }

          // ШАГ 3: Если не нашли по id_all/ИНН - ищем по ФИО среди сотрудников ЭТОГО контрагента
          if (!existingEmployee && emp.firstName && emp.lastName) {
            console.log(
              `   🔍 Ищем по ФИО среди сотрудников контрагента: ${emp.lastName} ${emp.firstName} ${emp.middleName || ""}`,
            );

            // Сначала ищем всех сотрудников с таким ФИО
            const candidateWhere = {
              firstName: emp.firstName,
              middleName: emp.middleName || null,
            };

            if (isFieldEncryptionEnabled()) {
              const lastNameHash = hashForSearch(
                ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME,
                emp.lastName,
              );
              if (!lastNameHash) {
                throw new AppError(
                  "Не удалось вычислить hash фамилии для поиска дубликатов импорта",
                  500,
                );
              }
              candidateWhere.lastNameHash = lastNameHash;
            }

            const candidateEmployees = await Employee.findAll({
              where: candidateWhere,
            });

            console.log(
              `   📊 Найдено кандидатов с таким ФИО: ${candidateEmployees.length}`,
            );

            if (candidateEmployees.length > 0) {
              // Вместо запроса в цикле делаем один батч-запрос маппингов.
              const candidateEmployeeIds = candidateEmployees.map(
                (candidate) => candidate.id,
              );
              const candidateMappings =
                await EmployeeCounterpartyMapping.findAll({
                  where: {
                    employeeId: { [Op.in]: candidateEmployeeIds },
                    counterpartyId: userCounterparty.id,
                  },
                  attributes: ["employeeId"],
                });

              const mappedEmployeeIds = new Set(
                candidateMappings.map((mapping) => String(mapping.employeeId)),
              );
              const matchedCandidate = candidateEmployees.find((candidate) =>
                mappedEmployeeIds.has(String(candidate.id)),
              );

              if (matchedCandidate) {
                existingEmployee = matchedCandidate;
                console.log(
                  `   ✅ Найден сотрудник по ФИО (у этого контрагента):`,
                  {
                    id: existingEmployee.id,
                    uuid: existingEmployee.id,
                    idAll: existingEmployee.idAll,
                    hasInn: !!existingEmployee.inn,
                    hasSnils: !!existingEmployee.snils,
                    hasCitizenship: !!existingEmployee.citizenshipId,
                  },
                );
              }
            }

            if (!existingEmployee) {
              console.log(
                `   ⚠️  По ФИО не найден среди сотрудников этого контрагента`,
              );
            }
          }

          // ШАГ 4: Обработка найденного сотрудника или создание нового
          if (existingEmployee) {
            // Сотрудник найден - обновляем
            console.log(`   🔄 ОБНОВЛЕНИЕ существующего сотрудника`);

            // Проверяем разрешение конфликта
            if (resolution === "skip") {
              console.log(`   ⏭️  Пользователь выбрал "Пропустить"`);
              results.skipped++;
              return;
            }

            // Обновляем только заполненные поля из файла
            const updateData = {};
            const changes = [];

            if (emp.firstName && emp.firstName !== existingEmployee.firstName) {
              updateData.firstName = emp.firstName;
              changes.push(
                `firstName: ${existingEmployee.firstName} → ${emp.firstName}`,
              );
            }
            if (emp.lastName && emp.lastName !== existingEmployee.lastName) {
              updateData.lastName = emp.lastName;
              changes.push(
                `lastName: ${existingEmployee.lastName} → ${emp.lastName}`,
              );
            }
            if (
              emp.middleName &&
              emp.middleName !== existingEmployee.middleName
            ) {
              updateData.middleName = emp.middleName;
              changes.push(
                `middleName: ${existingEmployee.middleName} → ${emp.middleName}`,
              );
            }
            if (emp.inn && emp.inn !== existingEmployee.inn) {
              updateData.inn = emp.inn;
              changes.push(
                `inn: ${existingEmployee.inn || "пусто"} → ${emp.inn}`,
              );
            }
            if (emp.snils && emp.snils !== existingEmployee.snils) {
              updateData.snils = emp.snils;
              changes.push(
                `snils: ${existingEmployee.snils || "пусто"} → ${emp.snils}`,
              );
            }
            if (emp.kig && emp.kig !== existingEmployee.kig) {
              updateData.kig = emp.kig;
              changes.push(
                `kig: ${existingEmployee.kig || "пусто"} → ${emp.kig}`,
              );
            }
            if (emp.birthDate && emp.birthDate !== existingEmployee.birthDate) {
              updateData.birthDate = emp.birthDate;
              changes.push(
                `birthDate: ${existingEmployee.birthDate || "пусто"} → ${emp.birthDate}`,
              );
            }
            if (
              emp.kigEndDate &&
              emp.kigEndDate !== existingEmployee.kigEndDate
            ) {
              updateData.kigEndDate = emp.kigEndDate;
              changes.push(
                `kigEndDate: ${existingEmployee.kigEndDate || "пусто"} → ${emp.kigEndDate}`,
              );
            }
            if (
              emp.position?.id &&
              emp.position.id !== existingEmployee.positionId
            ) {
              updateData.positionId = emp.position.id;
              changes.push(
                `positionId: ${existingEmployee.positionId || "пусто"} → ${emp.position.id}`,
              );
            }
            if (
              emp.citizenship?.id &&
              emp.citizenship.id !== existingEmployee.citizenshipId
            ) {
              updateData.citizenshipId = emp.citizenship.id;
              changes.push(
                `citizenshipId: ${existingEmployee.citizenshipId || "пусто"} → ${emp.citizenship.id}`,
              );
            }
            if (emp.idAll && !existingEmployee.idAll) {
              updateData.idAll = emp.idAll;
              changes.push(`idAll: пусто → ${emp.idAll}`);
            }
            if (emp.phone && emp.phone !== existingEmployee.phone) {
              updateData.phone = emp.phone;
              changes.push(
                `phone: ${existingEmployee.phone || "пусто"} → ${emp.phone}`,
              );
            }
            if (
              emp.bankAccountNumber &&
              emp.bankAccountNumber !== existingEmployee.bankAccountNumber
            ) {
              updateData.bankAccountNumber = emp.bankAccountNumber;
              changes.push(
                `bankAccountNumber: ${existingEmployee.bankAccountNumber || "пусто"} → ${emp.bankAccountNumber}`,
              );
            }
            if (
              emp.passportNumber &&
              emp.passportNumber !== existingEmployee.passportNumber
            ) {
              updateData.passportNumber = emp.passportNumber;
              changes.push("passportNumber: обновлено");
            }
            if (
              emp.passportDate &&
              emp.passportDate !== existingEmployee.passportDate
            ) {
              updateData.passportDate = emp.passportDate;
              changes.push(
                `passportDate: ${existingEmployee.passportDate || "пусто"} → ${emp.passportDate}`,
              );
            }
            if (
              emp.passportIssuer &&
              emp.passportIssuer !== existingEmployee.passportIssuer
            ) {
              updateData.passportIssuer = emp.passportIssuer;
              changes.push("passportIssuer: обновлено");
            }
            if (
              emp.passportType &&
              emp.passportType !== existingEmployee.passportType
            ) {
              updateData.passportType = emp.passportType;
              changes.push(
                `passportType: ${existingEmployee.passportType || "пусто"} → ${emp.passportType}`,
              );
            }
            if (
              emp.passportExpiryDate &&
              emp.passportExpiryDate !== existingEmployee.passportExpiryDate
            ) {
              updateData.passportExpiryDate = emp.passportExpiryDate;
              changes.push(
                `passportExpiryDate: ${existingEmployee.passportExpiryDate || "пусто"} → ${emp.passportExpiryDate}`,
              );
            }
            if (
              emp.registrationAddress &&
              emp.registrationAddress !== existingEmployee.registrationAddress
            ) {
              updateData.registrationAddress = emp.registrationAddress;
              changes.push("registrationAddress: обновлено");
            }
            if (
              emp.patentIssueDate &&
              emp.patentIssueDate !== existingEmployee.patentIssueDate
            ) {
              updateData.patentIssueDate = emp.patentIssueDate;
              changes.push(
                `patentIssueDate: ${existingEmployee.patentIssueDate || "пусто"} → ${emp.patentIssueDate}`,
              );
            }
            if (
              emp.patentNumber &&
              emp.patentNumber !== existingEmployee.patentNumber
            ) {
              updateData.patentNumber = emp.patentNumber;
              changes.push("patentNumber: обновлено");
            }
            if (
              emp.blankNumber &&
              emp.blankNumber !== existingEmployee.blankNumber
            ) {
              updateData.blankNumber = emp.blankNumber;
              changes.push(
                `blankNumber: ${existingEmployee.blankNumber || "пусто"} → ${emp.blankNumber}`,
              );
            }

            if (Object.keys(updateData).length > 0) {
              const encryptedUpdateData =
                applyEmployeeSensitiveFieldEncryption(updateData);
              await existingEmployee.update({
                ...encryptedUpdateData,
                updatedBy: userId,
              });
              console.log(
                `   ✅ ОБНОВЛЕНО полей: ${Object.keys(updateData).length - 1}`,
              );
              console.log(`   📝 Изменения:`, changes);
              results.updated++;
            } else {
              console.log(`   ℹ️  Нет изменений - данные совпадают`);
              results.skipped++;
            }

            employee = existingEmployee;
          } else {
            // Сотрудник не найден - создаем нового
            console.log(`   ✨ СОЗДАНИЕ нового сотрудника`);
            const createPayload = applyEmployeeSensitiveFieldEncryption({
              idAll: emp.idAll,
              firstName: emp.firstName,
              lastName: emp.lastName,
              middleName: emp.middleName,
              inn: emp.inn,
              snils: emp.snils,
              kig: emp.kig,
              birthDate: emp.birthDate,
              kigEndDate: emp.kigEndDate,
              positionId: emp.position?.id,
              citizenshipId: emp.citizenship?.id,
              phone: emp.phone,
              bankAccountNumber: emp.bankAccountNumber,
              passportNumber: emp.passportNumber,
              passportDate: emp.passportDate,
              passportIssuer: emp.passportIssuer,
              passportType: emp.passportType,
              passportExpiryDate: emp.passportExpiryDate,
              registrationAddress: emp.registrationAddress,
              patentIssueDate: emp.patentIssueDate,
              patentNumber: emp.patentNumber,
              blankNumber: emp.blankNumber,
              createdBy: userId,
            });
            employee = await Employee.create(createPayload);
            isCreated = true;
            await EmployeeStatusService.initializeEmployeeStatuses(
              employee.id,
              userId,
            );
            console.log(`   ✅ СОЗДАН новый сотрудник:`, {
              id: employee.id,
              uuid: employee.id,
              inn: employee.inn,
              snils: employee.snils,
            });
            results.created++;
          }

          // 🔗 КРИТИЧЕСКИ ВАЖНО: Создаем маппинг сотрудник-контрагент
          // Определяем целевого контрагента: из validated или пользователя
          const targetCounterparty = emp.idAll
            ? defaultCounterparty || emp.counterparty || userCounterparty
            : emp.counterparty || userCounterparty;
          const targetCounterpartyId =
            targetCounterparty?.id || userCounterpartyId;
          const importedEmploymentStatus = resolveImportedEmploymentStatus(emp);
          const importedDismissalDate = resolveImportedDismissalDate(emp);
          const targetDepartment = await findOrCreateDepartmentForCounterparty(
            targetCounterpartyId,
            importedEmploymentStatus === "fired" ? null : emp.department,
          );

          console.log(
            `   🔗 Проверка маппинга с контрагентом ${targetCounterparty.name}`,
          );
          const existingMapping = await EmployeeCounterpartyMapping.findOne({
            where: {
              employeeId: employee.id,
              counterpartyId: targetCounterpartyId,
            },
          });

          if (!existingMapping) {
            await EmployeeCounterpartyMapping.create({
              employeeId: employee.id,
              counterpartyId: targetCounterpartyId,
              departmentId: targetDepartment?.id || null,
              dismissedAt: importedDismissalDate,
              createdBy: userId,
            });
            console.log(
              `   ✅ СОЗДАН маппинг сотрудник → контрагент (ID: ${targetCounterpartyId}, ${targetCounterparty.name})`,
            );
          } else {
            if (
              (existingMapping.dismissedAt
                ? new Date(existingMapping.dismissedAt).toISOString()
                : null) !==
                (importedDismissalDate
                  ? new Date(importedDismissalDate).toISOString()
                  : null) ||
              (targetDepartment?.id || null) !==
              (existingMapping.departmentId || null)
            ) {
              await existingMapping.update({
                departmentId: targetDepartment?.id || null,
                dismissedAt: importedDismissalDate,
              });
              console.log(
                `   ✅ ОБНОВЛЕН маппинг: подразделение=${targetDepartment?.name || "пусто"}, дата увольнения=${importedDismissalDate || "пусто"}`,
              );
            }
            console.log(
              `   ℹ️  Маппинг уже существует (ID: ${existingMapping.id})`,
            );
          }

          const importedPass =
            importedEmploymentStatus === "fired"
              ? await revokeImportedPassForEmployee(employee.id, emp.passNumber)
              : await upsertImportedPassForEmployee(employee.id, emp.passNumber);
          if (importedPass) {
            console.log(
              importedEmploymentStatus === "fired"
                ? `   🎫 Пропуск отозван: ${importedPass.passNumber}`
                : `   🎫 Пропуск сохранен: ${importedPass.passNumber}`,
            );
          }

          const importedStatusName = await syncImportedEmployeeStatuses(
            employee.id,
            emp,
          );
          console.log(`   🏷️ Статус активности синхронизирован: ${importedStatusName}`);

          // 🎯 АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ СТАТУСОВ в зависимости от полноты данных
          try {
            // Перезагружаем сотрудника с включенным citizenship для проверки полноты
            await employee.reload({
              include: [
                {
                  model: Citizenship,
                  as: "citizenship",
                },
              ],
            });

            // Обновляем статусы на основе полноты карточки
            const { isComplete, missingFields } =
              await updateEmployeeStatusesByCompleteness(
                employee,
                formConfig,
                statusMap,
                userId,
              );

            // Логируем результаты проверки полноты
            if (isComplete) {
              if (isCreated) {
                console.log(
                  `   🎉 НОВЫЙ сотрудник с ПОЛНЫМИ данными → активен!`,
                );
              } else {
                console.log(
                  `   🎉 Сотрудник ОБНОВЛЕН и имеет ПОЛНЫЕ данные → активен!`,
                );
              }
            } else {
              if (isCreated) {
                console.log(
                  `   📝 Новый сотрудник в статусе ЧЕРНОВИК (не хватает ${missingFields.length} полей)`,
                );
              } else {
                console.log(
                  `   📝 Сотрудник обновлен, статус ЧЕРНОВИК сохранен (не хватает ${missingFields.length} полей)`,
                );
              }
            }
          } catch (statusError) {
            console.error(
              `   ⚠️  Ошибка при обновлении статусов: ${statusError.message}`,
            );
            console.error(
              `   ℹ️  Сотрудник импортирован, но статусы не обновлены`,
            );
            // Не останавливаем импорт, продолжаем
          }

          try {
            const updatedUploadStatuses = await markEmployeeUploadedToZup(
              employee.id,
            );
            console.log(
              `   ☁️ Флаг "загружен в ЗУП" обновлен для активных статусов: ${updatedUploadStatuses}`,
            );
          } catch (uploadError) {
            console.error(
              `   ⚠️ Ошибка при установке флага is_upload: ${uploadError.message}`,
            );
          }

          // Обновляем КПП контрагента если нужно (некритичная операция)
          if (emp.kppToUpdate && !userCounterparty.kpp) {
            try {
              await userCounterparty.update({ kpp: emp.kppToUpdate });
              console.log(`   ✅ Обновлен КПП контрагента: ${emp.kppToUpdate}`);
            } catch (kppError) {
              console.warn(
                `   ⚠️  Не удалось обновить КПП контрагента: ${kppError.message}`,
              );
              // Не добавляем в errors, т.к. сотрудник успешно создан
            }
          }

          console.log(
            `✅ ЗАВЕРШЕНО: ${emp.lastName} ${emp.firstName} - ${isCreated ? "СОЗДАН" : "ОБНОВЛЕН"}`,
          );
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        } catch (error) {
          console.error(
            `❌ ОШИБКА при импорте сотрудника ${emp.lastName} ${emp.firstName}:`,
            error.message,
          );
          console.error(`   Stack:`, error.stack);
          results.errors.push({
            rowIndex: emp.rowIndex,
            lastName: emp.lastName,
            error:
              process.env.NODE_ENV === "development"
                ? error.message
                : "Внутренняя ошибка при обработке записи",
          });
        }
      }),
    );
  }

  console.log("✅ Импорт завершен:", results);
  return results;
};
