import {
  Counterparty,
  Employee,
  Position,
  ConstructionSite,
  CounterpartyConstructionSiteMapping,
  CounterpartySubcounterpartyMapping,
  CounterpartyTypeMapping,
  Setting,
  sequelize,
} from "../models/index.js";
import { Op, QueryTypes } from "sequelize";
import { AppError } from "../middleware/errorHandler.js";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
} from "../services/auditEventService.js";
import { getSkudProvider } from "../integrations/skud/SkudProviderRegistry.js";
import { skudConfig } from "../services/skud/skudConfig.js";

const parseBooleanParam = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseDateParam = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Некорректный формат даты", 400);
  }
  return parsed.toISOString();
};

const parseIntegerParam = (value, fallback, min = 1, max = 1000) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
};

const buildMappingPairKey = (counterpartyId, constructionSiteId) =>
  `${String(counterpartyId)}::${String(constructionSiteId)}`;

const DEFAULT_CONTRACTORS_ROOT_NAME = "Подрядные организации";
const hasFullCounterpartyAccessRole = (role) =>
  role === "admin" ||
  role === "manager" ||
  role === "ot_admin" ||
  role === "ot_engineer";

const normalizeLookupToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ");

const stripLegalForms = (value) =>
  String(value || "")
    .replace(/\b(ооо|ао|зао|пао|ип)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildCounterpartyTokens = (value) => {
  const base = normalizeLookupToken(value);
  if (!base) return [];
  const noLegalForms = normalizeLookupToken(stripLegalForms(base));
  return Array.from(new Set([base, noLegalForms].filter(Boolean)));
};

const buildDepartmentPath = (item, departmentsById, seen = new Set()) => {
  const id =
    item?.id === undefined || item?.id === null ? null : String(item.id);
  if (!id || seen.has(id)) {
    return [];
  }
  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const parentIdRaw = item?.parentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null
      ? null
      : String(parentIdRaw);
  const parent =
    parentId && parentId !== "0" ? departmentsById.get(parentId) : null;
  const parentPath = parent
    ? buildDepartmentPath(parent, departmentsById, nextSeen)
    : [];
  const name = String(item?.name || "").trim();

  return name ? [...parentPath, name] : parentPath;
};

const resolveCounterpartyFolderNameByDepartmentId = ({
  departmentId,
  departmentsById,
}) => {
  const id =
    departmentId === undefined || departmentId === null
      ? null
      : String(departmentId);
  if (!id || !departmentsById?.size) return null;

  const department = departmentsById.get(id);
  if (!department) return null;

  const path = buildDepartmentPath(department, departmentsById);
  if (!path.length) return null;

  const normalizedPath = path.map((value) => normalizeLookupToken(value));
  const contractorsRoot = String(
    skudConfig?.sigur?.departmentRootContractors || "",
  ).trim();
  const normalizedContractorsRoot = normalizeLookupToken(
    contractorsRoot || DEFAULT_CONTRACTORS_ROOT_NAME,
  );

  const contractorsRootIdx = normalizedPath.findIndex(
    (item) => item === normalizedContractorsRoot,
  );
  if (contractorsRootIdx >= 0) {
    const contractorFolderName = String(path[contractorsRootIdx + 1] || "").trim();
    return contractorFolderName || null;
  }
  return null;
};

const buildAccessPointFolderPath = (item, foldersById, seen = new Set()) => {
  const id =
    item?.id === undefined || item?.id === null ? null : String(item.id);
  if (!id || seen.has(id)) return [];
  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const parentIdRaw = item?.parentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null ? null : String(parentIdRaw);
  const parent = parentId && parentId !== "0" ? foldersById.get(parentId) : null;
  const parentPath = parent
    ? buildAccessPointFolderPath(parent, foldersById, nextSeen)
    : [];
  const name = String(item?.name || "").trim();
  return name ? [...parentPath, name] : parentPath;
};

const extractConstructionSiteNameFromAccessPointPath = (pathLabel) => {
  const segments = String(pathLabel || "")
    .split("/")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (!segments.length) return null;

  const ignorePatterns = [
    /^\d+\s*структур/i,
    /подрядн/i,
    /^отдел\b/i,
    /^офис$/i,
    /^охрана/i,
    /^автопарк/i,
    /^медперсонал/i,
    /^допуск/i,
    /^гостев/i,
  ];

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (!ignorePatterns.some((pattern) => pattern.test(candidate))) {
      return candidate;
    }
  }
  return segments[segments.length - 1] || null;
};

const toProviderItems = (result) =>
  Array.isArray(result)
    ? result
    : Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.data)
        ? result.data
      : [];

const PROVIDER_PAGE_LIMIT = 500;
const PROVIDER_MAX_PAGES = 40;
const PROVIDER_MAX_ITEMS = 20000;
const PROVIDER_CATALOG_TIMEOUT_MS = 60000;
const PROVIDER_BINDINGS_PAGE_LIMIT = 3000;

const withTimeout = async (factory, timeoutMs, timeoutMessage) => {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([factory(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildPageSignature = (page) => {
  if (!Array.isArray(page) || page.length === 0) return "";
  const firstId =
    page[0]?.id ??
    page[0]?.employeeId ??
    page[0]?.employee_id ??
    page[0]?.externalEmpId ??
    page[0]?.accessPointId ??
    page[0]?.access_point_id ??
    "";
  const lastId =
    page[page.length - 1]?.id ??
    page[page.length - 1]?.employeeId ??
    page[page.length - 1]?.employee_id ??
    page[page.length - 1]?.externalEmpId ??
    page[page.length - 1]?.accessPointId ??
    page[page.length - 1]?.access_point_id ??
    "";
  return `${page.length}:${String(firstId)}:${String(lastId)}`;
};

const fetchProviderPaginatedCatalog = async (
  fetchPage,
  {
    pageLimit = PROVIDER_PAGE_LIMIT,
    maxPages = PROVIDER_MAX_PAGES,
    maxItems = PROVIDER_MAX_ITEMS,
  } = {},
) => {
  const items = [];
  let offset = 0;
  let pageCount = 0;
  let previousSignature = null;

  while (pageCount < maxPages && items.length < maxItems) {
    const response = await fetchPage({ limit: pageLimit, offset });
    const page = toProviderItems(response);
    if (!page.length) break;

    const signature = buildPageSignature(page);
    if (signature && signature === previousSignature) {
      console.warn(
        "Provider pagination appears non-progressive, stopping early",
        { offset, signature },
      );
      break;
    }
    previousSignature = signature;

    items.push(...page);

    if (page.length < pageLimit) break;
    offset += page.length;
    pageCount += 1;
  }

  return items.slice(0, maxItems);
};

const getAllProviderDepartments = async (provider) => {
  return fetchProviderPaginatedCatalog(({ limit, offset }) =>
    provider.getDepartments({ limit, offset }),
  );
};

const getAllProviderAccessPoints = async (provider) => {
  return fetchProviderPaginatedCatalog(({ limit, offset }) =>
    provider.getAccessPoints({ limit, offset }),
  );
};

const getAllProviderEmployees = async (provider) => {
  return fetchProviderPaginatedCatalog(({ limit, offset }) =>
    provider.getEmployees({ limit, offset }),
  );
};

const chunkArray = (items, chunkSize) => {
  const source = Array.isArray(items) ? items : [];
  const normalizedChunkSize = Math.max(Number(chunkSize) || 1, 1);
  const chunks = [];
  for (let index = 0; index < source.length; index += normalizedChunkSize) {
    chunks.push(source.slice(index, index + normalizedChunkSize));
  }
  return chunks;
};

const getProviderEmployeesByDepartments = async (
  provider,
  departmentIds = [],
) => {
  const normalizedDepartmentIds = Array.from(
    new Set(
      (Array.isArray(departmentIds) ? departmentIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedDepartmentIds.length) {
    return [];
  }

  const employees = [];
  for (const departmentId of normalizedDepartmentIds) {
    const departmentEmployees = await fetchProviderPaginatedCatalog(
      ({ limit, offset }) =>
        provider.getEmployees({
          limit,
          offset,
          filters: { departmentId },
        }),
      {
        pageLimit: PROVIDER_PAGE_LIMIT,
        maxPages: 20,
        maxItems: 10000,
      },
    );
    employees.push(...departmentEmployees);
  }

  return employees;
};

const getAllProviderEmployeeAccessPointBindings = async (provider) => {
  return fetchProviderPaginatedCatalog(
    ({ limit, offset }) =>
      provider.request({
        method: "GET",
        url: "/api/v1/bindings/employees-accesspoints",
        params: {
          limit,
          offset,
        },
        timeout: Math.max(skudConfig?.sigur?.timeoutMs || 0, 120000),
      }),
    {
      pageLimit: PROVIDER_BINDINGS_PAGE_LIMIT,
      maxPages: 200,
      maxItems: 200000,
    },
  );
};

const getProviderEmployeeAccessPointBindingsByEmployeeIds = async (
  provider,
  employeeIds = [],
) => {
  const normalizedEmployeeIds = Array.from(
    new Set(
      (Array.isArray(employeeIds) ? employeeIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedEmployeeIds.length) {
    return [];
  }

  const chunks = chunkArray(normalizedEmployeeIds, 50);
  const bindings = [];

  for (const employeeIdChunk of chunks) {
    const chunkEmployeeIds = employeeIdChunk.join(",");
    const chunkBindings = await fetchProviderPaginatedCatalog(
      ({ limit, offset }) =>
        provider.request({
          method: "GET",
          url: "/api/v1/bindings/employees-accesspoints",
          params: {
            employeeId: chunkEmployeeIds,
            limit,
            offset,
          },
          timeout: Math.max(skudConfig?.sigur?.timeoutMs || 0, 120000),
        }),
      {
        pageLimit: PROVIDER_BINDINGS_PAGE_LIMIT,
        maxPages: 40,
        maxItems: 100000,
      },
    );
    bindings.push(...chunkBindings);
  }

  return bindings;
};

const hasTable = async (tableName) => {
  const normalized = String(tableName || "").trim();
  if (!normalized) return false;
  try {
    const rows = await sequelize.query(
      "SELECT to_regclass(:tableName) AS table_name",
      {
        replacements: { tableName: `public.${normalized}` },
        type: QueryTypes.SELECT,
      },
    );
    return Boolean(rows?.[0]?.table_name);
  } catch (error) {
    console.warn(`Failed to check table ${normalized}:`, error?.message || error);
    return false;
  }
};

// Получить все контрагенты
export const getAllCounterparties = async (req, res, next) => {
  try {
    const { type, search, page = 1, limit = 100, include } = req.query;

    // Ограничиваем максимальный лимит на 10000 для предотвращения нагрузки
    const actualLimit = Math.min(parseInt(limit) || 100, 10000);

    const where = {};

    // Проверка прав доступа на основе роли и контрагента
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (req.user.role === "admin") {
      // admin видит всех контрагентов - без ограничений
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ к справочнику контрагентов
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - только свой контрагент + прямые субподрядчики
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      where.id = { [Op.in]: allowedIds };
    }

    // Фильтр по типу (для будущего использования с новой системой типов)
    if (type) {
      where.type = type;
    }

    // Поиск по названию или ИНН
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { inn: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * actualLimit;

    // Настройка include для связанных данных
    const includeOptions = [];

    // ВСЕГДА включаем типы контрагентов
    includeOptions.push({
      model: CounterpartyTypeMapping,
      as: "typeMapping",
      attributes: ["types"],
      required: false,
    });

    // ВСЕГДА включаем информацию о родительском контрагенте
    includeOptions.push({
      model: CounterpartySubcounterpartyMapping,
      as: "parentMappings",
      attributes: ["parentCounterpartyId"],
      required: false,
      include: [
        {
          model: Counterparty,
          as: "parentCounterparty",
          attributes: ["id", "name"],
        },
      ],
    });

    // Если запрошено включение construction_sites
    if (include && include.includes("construction_sites")) {
      includeOptions.push({
        model: ConstructionSite,
        as: "constructionSites",
        attributes: ["id", "shortName", "fullName"],
        through: { attributes: [] },
      });
    }

    const { count, rows } = await Counterparty.findAndCountAll({
      where,
      include: includeOptions,
      limit: actualLimit,
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      distinct: true,
    });

    // Преобразуем данные для фронтенда
    const transformedRows = rows.map((row) => {
      const counterparty = row.toJSON();
      // Добавляем parentCounterparty на верхний уровень для удобства
      if (
        counterparty.parentMappings &&
        counterparty.parentMappings.length > 0
      ) {
        counterparty.parentCounterparty =
          counterparty.parentMappings[0].parentCounterparty;
      }
      return counterparty;
    });

    res.json({
      success: true,
      data: {
        counterparties: transformedRows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: actualLimit,
          pages: Math.ceil(count / actualLimit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching counterparties:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Получить контрагента по ID
export const getCounterpartyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - проверить доступ только к своим
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      if (!allowedIds.includes(id)) {
        return next(new AppError("Доступ к этому контрагенту запрещен", 403));
      }
    }

    const counterparty = await Counterparty.findByPk(id, {
      include: [
        {
          model: Employee,
          as: "employees",
          include: [
            {
              model: Position,
              as: "position",
              attributes: ["id", "name"],
            },
          ],
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "positionId",
          ],
        },
        {
          model: CounterpartyTypeMapping,
          as: "typeMapping",
          attributes: ["types"],
          required: false,
        },
      ],
    });

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    res.json({
      success: true,
      data: counterparty,
    });
  } catch (error) {
    console.error("Error fetching counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Создать контрагента
export const createCounterparty = async (req, res, next) => {
  try {
    const counterpartyData = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ к справочнику
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    // Очищаем пустые строки для необязательных полей
    if (counterpartyData.email === "") counterpartyData.email = null;
    if (counterpartyData.phone === "") counterpartyData.phone = null;
    if (counterpartyData.kpp === "") counterpartyData.kpp = null;
    if (counterpartyData.ogrn === "") counterpartyData.ogrn = null;
    if (counterpartyData.legalAddress === "")
      counterpartyData.legalAddress = null;

    // Используем транзакцию для создания контрагента и связанных записей
    const result = await sequelize.transaction(async (t) => {
      let counterparty;
      let typeMapping;

      if (hasFullCounterpartyAccessRole(req.user.role)) {
        // Роли с полным доступом создают контрагента с указанным типом
        counterparty = await Counterparty.create(
          {
            ...counterpartyData,
            type: counterpartyData.type || null, // Для обратной совместимости
          },
          { transaction: t },
        );

        // Создаем запись в counterparties_types_mapping
        if (counterpartyData.type) {
          typeMapping = await CounterpartyTypeMapping.create(
            {
              counterpartyId: counterparty.id,
              types: [counterpartyData.type],
            },
            { transaction: t },
          );
        }
      } else if (
        req.user.role === "user" &&
        req.user.counterpartyId !== defaultCounterpartyId
      ) {
        // User (не default) создает субподрядчика
        counterparty = await Counterparty.create(
          {
            ...counterpartyData,
            type: null, // Новая логика не использует это поле
          },
          { transaction: t },
        );

        // Создаем запись в counterparties_types_mapping с типом subcontractor
        typeMapping = await CounterpartyTypeMapping.create(
          {
            counterpartyId: counterparty.id,
            types: ["subcontractor"],
          },
          { transaction: t },
        );

        // Создаем связь родитель-субподрядчик
        await CounterpartySubcounterpartyMapping.create(
          {
            parentCounterpartyId: req.user.counterpartyId,
            childCounterpartyId: counterparty.id,
            createdBy: req.user.id,
          },
          { transaction: t },
        );
      }

      return { counterparty, typeMapping };
    });

    res.status(201).json({
      success: true,
      message: "Контрагент успешно создан",
      data: result.counterparty,
    });
  } catch (error) {
    console.error("Error creating counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

    if (error.name === "SequelizeValidationError") {
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

// Обновить контрагента
export const updateCounterparty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - может редактировать только своих субподрядчиков
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = subcontractors.map((s) => s.childCounterpartyId);

      if (!allowedIds.includes(id)) {
        return next(
          new AppError("Можно редактировать только своих субподрядчиков", 403),
        );
      }
    }

    // Очищаем пустые строки для необязательных полей
    if (updates.email === "") updates.email = null;
    if (updates.phone === "") updates.phone = null;
    if (updates.kpp === "") updates.kpp = null;
    if (updates.ogrn === "") updates.ogrn = null;
    if (updates.legalAddress === "") updates.legalAddress = null;

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Используем транзакцию для обновления
    await sequelize.transaction(async (t) => {
      // Обновляем контрагента
      await counterparty.update(updates, { transaction: t });

      // Если роль с полным доступом обновляет тип - обновляем в counterparties_types_mapping
      if (hasFullCounterpartyAccessRole(req.user.role) && updates.type) {
        const existingTypeMapping = await CounterpartyTypeMapping.findOne({
          where: { counterpartyId: id },
          transaction: t,
        });

        if (existingTypeMapping) {
          await existingTypeMapping.update(
            {
              types: [updates.type],
            },
            { transaction: t },
          );
        } else {
          await CounterpartyTypeMapping.create(
            {
              counterpartyId: id,
              types: [updates.type],
            },
            { transaction: t },
          );
        }
      }
    });

    res.json({
      success: true,
      message: "Контрагент успешно обновлен",
      data: counterparty,
    });
  } catch (error) {
    console.error("Error updating counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

    if (error.name === "SequelizeValidationError") {
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

// Удалить контрагента
export const deleteCounterparty = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа - роли с полным доступом могут удалять
    if (!hasFullCounterpartyAccessRole(req.user.role)) {
      return next(
        new AppError(
          "Недостаточно прав для удаления контрагента",
          403,
        ),
      );
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Проверяем есть ли связанные сотрудники (только если таблица существует)
    try {
      const employeesCount = await Employee.count({
        where: { counterparty_id: id },
      });

      if (employeesCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Невозможно удалить контрагента: есть ${employeesCount} связанных сотрудников`,
        });
      }
    } catch (employeeCheckError) {
      // Если таблица employees не существует или нет поля counterparty_id - игнорируем
      console.warn("Warning checking employees:", employeeCheckError.message);
    }

    await counterparty.destroy();

    res.json({
      success: true,
      message: "Контрагент успешно удален",
    });
  } catch (error) {
    console.error("Error deleting counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

    // Обработка ошибки внешнего ключа (контрагент используется в других таблицах)
    if (error.name === "SequelizeForeignKeyConstraintError") {
      const table = error.table || "unknown";
      const tableNames = {
        contracts: "договорах",
        employees: "сотрудниках",
      };
      const tableName = tableNames[table] || table;

      return res.status(400).json({
        success: false,
        message: `Невозможно удалить контрагента: он используется в ${tableName}`,
      });
    }

    next(error);
  }
};

// Получить статистику по контрагентам
export const getCounterpartiesStats = async (req, res, next) => {
  try {
    const stats = await Counterparty.findAll({
      attributes: [
        "type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["type"],
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching counterparties stats:", error);
    next(error);
  }
};

// Генерация уникального кода регистрации для контрагента
export const generateRegistrationCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Если код уже есть - возвращаем его
    if (counterparty.registrationCode) {
      return res.json({
        success: true,
        data: {
          registrationCode: counterparty.registrationCode,
        },
      });
    }

    // Генерируем новый уникальный код
    let registrationCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!isUnique && attempts < maxAttempts) {
      // Генерация 8-значного кода
      registrationCode = String(Math.floor(Math.random() * 100000000)).padStart(
        8,
        "0",
      );

      // Проверка уникальности
      const existing = await Counterparty.findOne({
        where: { registrationCode },
      });

      if (!existing) {
        isUnique = true;
      }

      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: "Не удалось сгенерировать уникальный код",
      });
    }

    // Сохраняем код
    await counterparty.update({ registrationCode });

    res.json({
      success: true,
      message: "Код регистрации успешно сгенерирован",
      data: {
        registrationCode,
      },
    });
  } catch (error) {
    console.error("Error generating registration code:", error);
    next(error);
  }
};

// Получить объекты контрагента
export const getCounterpartyConstructionSites = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа:
    // user может получать объекты только для своего контрагента и своих субподрядчиков
    if (req.user.role === "user") {
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      if (!allowedIds.includes(id)) {
        return next(
          new AppError(
            "Можно просматривать объекты только своего контрагента и своих субподрядчиков",
            403,
          ),
        );
      }
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    const constructionSites = await counterparty.getConstructionSites({
      attributes: ["id", "shortName", "fullName"],
      joinTableAttributes: ["id"],
    });

    res.json({
      success: true,
      data: constructionSites,
    });
  } catch (error) {
    console.error("Error fetching counterparty construction sites:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Сохранить объекты контрагента
export const saveCounterpartyConstructionSites = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { constructionSiteIds } = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      return next(new AppError("Доступ запрещен", 403));
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) может назначать объекты только своим субподрядчикам
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = subcontractors.map((s) => s.childCounterpartyId);

      if (!allowedIds.includes(id)) {
        return next(
          new AppError(
            "Можно назначать объекты только своим субподрядчикам",
            403,
          ),
        );
      }

      // Получаем объекты, назначенные родительскому контрагенту (самому user)
      const parentCounterparty = await Counterparty.findByPk(
        req.user.counterpartyId,
      );
      const parentConstructionSites =
        await parentCounterparty.getConstructionSites({
          attributes: ["id"],
        });
      const parentSiteIds = parentConstructionSites.map((site) => site.id);

      // Проверяем, что все выбранные объекты есть в списке родительских
      if (constructionSiteIds && constructionSiteIds.length > 0) {
        const invalidSiteIds = constructionSiteIds.filter(
          (siteId) => !parentSiteIds.includes(siteId),
        );

        if (invalidSiteIds.length > 0) {
          return next(
            new AppError(
              "Можно назначать только те объекты, которые назначены вашему контрагенту",
              403,
            ),
          );
        }
      }
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Очищаем старые связи и создаем новые
    await CounterpartyConstructionSiteMapping.destroy({
      where: { counterpartyId: id },
    });

    if (constructionSiteIds && constructionSiteIds.length > 0) {
      const mappings = constructionSiteIds.map((siteId) => ({
        counterpartyId: id,
        constructionSiteId: siteId,
      }));

      await CounterpartyConstructionSiteMapping.bulkCreate(mappings);
    }

    res.json({
      success: true,
      message: "Объекты контрагента успешно сохранены",
    });
  } catch (error) {
    console.error("Error saving counterparty construction sites:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Синхронизировать объекты контрагентов из журнала СКУД (без перезаписи существующих связей)
export const syncCounterpartyConstructionSitesFromSkud = async (
  req,
  res,
  next,
) => {
  try {
    const dryRun = parseBooleanParam(req.body?.dryRun, true);
    const createMissingSites = parseBooleanParam(
      req.body?.createMissingSites,
      true,
    );
    const targetCounterpartyIdRaw =
      req.body?.counterpartyId ?? req.query?.counterpartyId ?? null;
    const targetCounterpartyId = targetCounterpartyIdRaw
      ? String(targetCounterpartyIdRaw).trim()
      : null;
    const includeProviderExpansion = parseBooleanParam(
      req.body?.includeProvider ?? req.query?.includeProvider,
      !targetCounterpartyId,
    );
    const batchSize = parseIntegerParam(
      req.body?.batchSize ?? req.query?.batchSize,
      1,
      1,
      500,
    );
    const from = parseDateParam(req.body?.from || req.query?.from || null);
    const to = parseDateParam(req.body?.to || req.query?.to || null);

    const providerWhereConditions = [
      "e.external_system = 'sigur'",
      "e.source = 'sigur_pull'",
    ];
    const localWhereConditions = [...providerWhereConditions];
    const replacements = {};

    if (from) {
      providerWhereConditions.push("e.event_time >= :from");
      localWhereConditions.push("e.event_time >= :from");
      replacements.from = from;
    }
    if (to) {
      providerWhereConditions.push("e.event_time <= :to");
      localWhereConditions.push("e.event_time <= :to");
      replacements.to = to;
    }
    if (targetCounterpartyId) {
      localWhereConditions.push("lm.counterparty_id = :targetCounterpartyId");
      replacements.targetCounterpartyId = targetCounterpartyId;
    }

    const [hasSkudPersonBindingsTable, hasSkudSiteAccessPointsTable] =
      await Promise.all([
        hasTable("skud_person_bindings"),
        hasTable("skud_site_access_points"),
      ]);

    const employeeIdExpression = hasSkudPersonBindingsTable
      ? "COALESCE(e.employee_id, spb.employee_id)"
      : "e.employee_id";
    const constructionSiteExpression = hasSkudSiteAccessPointsTable
      ? "COALESCE(sap.construction_site_id, lm.construction_site_id)"
      : "lm.construction_site_id";
    const personBindingsJoin = hasSkudPersonBindingsTable
      ? `
        LEFT JOIN skud_person_bindings spb
          ON spb.external_system = 'sigur'
          AND spb.is_active = true
          AND spb.external_emp_id = e.external_emp_id
      `
      : "";
    const siteAccessPointsJoin = hasSkudSiteAccessPointsTable
      ? `
        LEFT JOIN skud_site_access_points sap
          ON sap.sigur_access_point_id = e.access_point
      `
      : "";

    const sql = `
      WITH latest_mapping AS (
        SELECT DISTINCT ON (ecm.employee_id)
          ecm.employee_id,
          ecm.counterparty_id,
          ecm.construction_site_id
        FROM employee_counterparty_mapping ecm
        WHERE ecm.dismissed_at IS NULL
          AND ecm.counterparty_id IS NOT NULL
        ORDER BY
          ecm.employee_id,
          ecm.updated_at DESC NULLS LAST,
          ecm.created_at DESC NULLS LAST
      ),
      event_candidates AS (
        SELECT
          lm.counterparty_id AS "counterpartyId",
          ${constructionSiteExpression} AS "constructionSiteId",
          COUNT(*)::int AS "eventsCount",
          MIN(e.event_time) AS "firstEventTime",
          MAX(e.event_time) AS "lastEventTime"
        FROM skud_access_events e
        ${personBindingsJoin}
        JOIN latest_mapping lm
          ON lm.employee_id = ${employeeIdExpression}
        ${siteAccessPointsJoin}
        WHERE ${localWhereConditions.join(" AND ")}
          AND ${constructionSiteExpression} IS NOT NULL
        GROUP BY
          lm.counterparty_id,
          ${constructionSiteExpression}
      )
      SELECT
        "counterpartyId",
        "constructionSiteId",
        "eventsCount",
        "firstEventTime",
        "lastEventTime"
      FROM event_candidates
      ORDER BY "eventsCount" DESC, "lastEventTime" DESC
    `;

    const candidateRows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const [allCounterparties, allConstructionSites] = await Promise.all([
      Counterparty.findAll({
        where: targetCounterpartyId ? { id: targetCounterpartyId } : undefined,
        attributes: ["id", "name"],
      }),
      ConstructionSite.findAll({
        attributes: ["id", "shortName", "fullName"],
      }),
    ]);
    if (targetCounterpartyId && allCounterparties.length === 0) {
      throw new AppError("Контрагент не найден", 404);
    }

    const counterpartyById = new Map(
      allCounterparties.map((row) => [String(row.id), row]),
    );
    const constructionSiteById = new Map(
      allConstructionSites.map((row) => [String(row.id), row]),
    );

    const counterpartyTokenIndex = new Map();
    allCounterparties.forEach((counterparty) => {
      buildCounterpartyTokens(counterparty?.name).forEach((token) => {
        if (!token) return;
        if (!counterpartyTokenIndex.has(token)) {
          counterpartyTokenIndex.set(token, counterparty);
          return;
        }
        const existing = counterpartyTokenIndex.get(token);
        if (!existing || String(existing.id) !== String(counterparty.id)) {
          counterpartyTokenIndex.set(token, null);
        }
      });
    });

    const resolveCounterpartyByName = (value) => {
      const tokens = buildCounterpartyTokens(value);
      for (const token of tokens) {
        const matched = counterpartyTokenIndex.get(token);
        if (matched) {
          return matched;
        }
      }
      return null;
    };

    const siteExactTokenIndex = new Map();
    const indexSiteByTokens = (site) => {
      [
        normalizeLookupToken(site?.shortName),
        normalizeLookupToken(site?.fullName),
      ]
        .filter(Boolean)
        .forEach((token) => {
          if (!siteExactTokenIndex.has(token)) {
            siteExactTokenIndex.set(token, site);
            return;
          }
          const existing = siteExactTokenIndex.get(token);
          if (!existing || String(existing.id) !== String(site.id)) {
            siteExactTokenIndex.set(token, null);
          }
        });
    };
    allConstructionSites.forEach((site) => indexSiteByTokens(site));

    const resolveConstructionSiteByName = (value) => {
      const token = normalizeLookupToken(value);
      if (!token) return null;

      const exactMatched = siteExactTokenIndex.get(token);
      if (exactMatched) return exactMatched;

      const fuzzyMatched = allConstructionSites.filter((site) => {
        const shortToken = normalizeLookupToken(site?.shortName);
        const fullToken = normalizeLookupToken(site?.fullName);
        return (
          (shortToken && (shortToken.includes(token) || token.includes(shortToken))) ||
          (fullToken && (fullToken.includes(token) || token.includes(fullToken)))
        );
      });
      return fuzzyMatched.length === 1 ? fuzzyMatched[0] : null;
    };

    const candidatesByPair = new Map();
    const addCandidatePair = ({
      counterpartyId,
      constructionSiteId,
      eventsCount = 0,
      firstEventTime = null,
      lastEventTime = null,
      source,
    }) => {
      const normalizedCounterpartyId = String(counterpartyId || "").trim();
      const normalizedConstructionSiteId = String(constructionSiteId || "").trim();
      if (!normalizedCounterpartyId || !normalizedConstructionSiteId) {
        return;
      }
      const counterparty = counterpartyById.get(normalizedCounterpartyId);
      const site = constructionSiteById.get(normalizedConstructionSiteId);
      if (!counterparty || !site) {
        return;
      }

      const key = buildMappingPairKey(
        normalizedCounterpartyId,
        normalizedConstructionSiteId,
      );
      if (!candidatesByPair.has(key)) {
        candidatesByPair.set(key, {
          counterpartyId: normalizedCounterpartyId,
          counterpartyName: counterparty.name,
          constructionSiteId: normalizedConstructionSiteId,
          constructionSiteName: site.shortName || site.fullName || "—",
          eventsCount: Number(eventsCount || 0),
          firstEventTime: firstEventTime || null,
          lastEventTime: lastEventTime || null,
          sources: new Set(source ? [source] : []),
        });
        return;
      }

      const current = candidatesByPair.get(key);
      current.eventsCount = Math.max(
        Number(current.eventsCount || 0),
        Number(eventsCount || 0),
      );

      const currentFirst = current.firstEventTime
        ? new Date(current.firstEventTime).getTime()
        : null;
      const candidateFirst = firstEventTime
        ? new Date(firstEventTime).getTime()
        : null;
      if (
        candidateFirst &&
        (!currentFirst || candidateFirst < currentFirst)
      ) {
        current.firstEventTime = firstEventTime;
      }

      const currentLast = current.lastEventTime
        ? new Date(current.lastEventTime).getTime()
        : null;
      const candidateLast = lastEventTime
        ? new Date(lastEventTime).getTime()
        : null;
      if (
        candidateLast &&
        (!currentLast || candidateLast > currentLast)
      ) {
        current.lastEventTime = lastEventTime;
      }

      if (source) {
        current.sources.add(source);
      }
    };

    candidateRows.forEach((row) => {
      addCandidatePair({
        counterpartyId: row.counterpartyId,
        constructionSiteId: row.constructionSiteId,
        eventsCount: row.eventsCount,
        firstEventTime: row.firstEventTime,
        lastEventTime: row.lastEventTime,
        source: "local_mapping",
      });
    });

    const providerSourceSummary = {
      rawRows: 0,
      rawBindingRows: 0,
      resolvedCounterparty: 0,
      resolvedConstructionSite: 0,
      resolvedPairs: 0,
      resolvedPairsFromBindings: 0,
      unresolvedCounterparty: 0,
      unresolvedConstructionSite: 0,
      unresolvedBindingCounterparty: 0,
      unresolvedBindingConstructionSite: 0,
      createdConstructionSites: 0,
      potentialConstructionSites: 0,
      targetDepartmentCount: 0,
      targetEmployeeCount: 0,
      failed: false,
      error: null,
      skipped: false,
      skipReason: null,
    };

    if (includeProviderExpansion) {
      try {
        const provider = getSkudProvider();
        const [providerDepartments, providerAccessPoints, hierarchyResponse] =
          await withTimeout(
            () =>
              Promise.all([
                getAllProviderDepartments(provider),
                getAllProviderAccessPoints(provider),
                provider.getAccessPointHierarchy(),
              ]),
            PROVIDER_CATALOG_TIMEOUT_MS,
            `Sigur catalogs timeout after ${PROVIDER_CATALOG_TIMEOUT_MS}ms`,
          );

        const departmentsById = new Map(
          providerDepartments
            .filter((item) => item?.id !== undefined && item?.id !== null)
            .map((item) => [String(item.id), item]),
        );
        const hierarchyItems = toProviderItems(hierarchyResponse);
        const hierarchyById = new Map(
          hierarchyItems
            .filter((item) => item?.id !== undefined && item?.id !== null)
            .map((item) => [String(item.id), item]),
        );
        const accessPointSiteById = new Map();
        const accessPointSiteNameById = new Map();
        const createdSiteByToken = new Map();
        const potentialSites = new Set();

        providerAccessPoints.forEach((accessPoint) => {
          const accessPointId =
            accessPoint?.id === undefined || accessPoint?.id === null
              ? null
              : String(accessPoint.id);
          if (!accessPointId) return;

          const folderIdRaw =
            accessPoint?.folderId ??
            accessPoint?.folder?.id ??
            accessPoint?.folder_id ??
            null;
          const folderId =
            folderIdRaw === undefined || folderIdRaw === null
              ? null
              : String(folderIdRaw);
          const folder =
            folderId && hierarchyById.has(folderId)
              ? hierarchyById.get(folderId)
              : null;
          const folderPath = folder
            ? buildAccessPointFolderPath(folder, hierarchyById)
            : [];
          const pathLabel = folderPath.length ? folderPath.join(" / ") : "";
          const siteNameCandidate =
            extractConstructionSiteNameFromAccessPointPath(pathLabel) ||
            String(accessPoint?.name || "").trim() ||
            null;
          if (siteNameCandidate) {
            accessPointSiteNameById.set(accessPointId, siteNameCandidate);
          }
          const site = resolveConstructionSiteByName(siteNameCandidate);
          if (site) {
            accessPointSiteById.set(accessPointId, site);
          }
        });

        let providerEmployees = [];
        let providerAccessPointBindings = [];
        if (targetCounterpartyId) {
          const targetDepartmentIds = providerDepartments
            .filter((department) => {
              const contractorFolderName =
                resolveCounterpartyFolderNameByDepartmentId({
                  departmentId: department?.id ?? null,
                  departmentsById,
                });
              const matchedCounterparty = contractorFolderName
                ? resolveCounterpartyByName(contractorFolderName)
                : null;
              return (
                matchedCounterparty &&
                String(matchedCounterparty.id) === targetCounterpartyId
              );
            })
            .map((department) => String(department.id));

          providerSourceSummary.targetDepartmentCount = targetDepartmentIds.length;

          providerEmployees = await getProviderEmployeesByDepartments(
            provider,
            targetDepartmentIds,
          );

          const targetEmployeeIds = Array.from(
            new Set(
              providerEmployees
                .map((employee) =>
                  employee?.id ??
                  employee?.employeeId ??
                  employee?.employee_id ??
                  null,
                )
                .filter((value) => value !== undefined && value !== null)
                .map((value) => String(value)),
            ),
          );
          providerSourceSummary.targetEmployeeCount = targetEmployeeIds.length;

          providerAccessPointBindings =
            await getProviderEmployeeAccessPointBindingsByEmployeeIds(
              provider,
              targetEmployeeIds,
            );
        } else {
          [providerEmployees, providerAccessPointBindings] = await Promise.all([
            getAllProviderEmployees(provider),
            getAllProviderEmployeeAccessPointBindings(provider),
          ]);
        }

        const resolveSiteByAccessPoint = async (accessPointId) => {
          const normalizedAccessPointId = String(accessPointId || "").trim();
          if (!normalizedAccessPointId) {
            return null;
          }

          let site = accessPointSiteById.get(normalizedAccessPointId) || null;
          const siteNameCandidate =
            accessPointSiteNameById.get(normalizedAccessPointId) || null;

          if (!site && siteNameCandidate && createMissingSites) {
            const siteToken = normalizeLookupToken(siteNameCandidate);
            if (siteToken) {
              if (dryRun) {
                potentialSites.add(siteToken);
              } else {
                const cachedCreatedSite = createdSiteByToken.get(siteToken);
                if (cachedCreatedSite) {
                  site = cachedCreatedSite;
                } else {
                  const existingSite = resolveConstructionSiteByName(siteNameCandidate);
                  if (existingSite) {
                    site = existingSite;
                    createdSiteByToken.set(siteToken, existingSite);
                  } else {
                    const createdSite = await ConstructionSite.create({
                      shortName: siteNameCandidate,
                      fullName: siteNameCandidate,
                      createdBy: req.user?.id || null,
                      updatedBy: req.user?.id || null,
                    });
                    site = createdSite;
                    allConstructionSites.push(createdSite);
                    constructionSiteById.set(String(createdSite.id), createdSite);
                    indexSiteByTokens(createdSite);
                    accessPointSiteById.set(normalizedAccessPointId, createdSite);
                    createdSiteByToken.set(siteToken, createdSite);
                    providerSourceSummary.createdConstructionSites += 1;
                  }
                }
              }
            }
          }
          return site;
        };

        const providerCandidateRows = await sequelize.query(
          `
        SELECT
          NULLIF(
            e.raw_payload #>> '{rawItem,additionalData,accessObject,data,department_id}',
            ''
          ) AS "providerDepartmentId",
          e.access_point AS "accessPointId",
          COUNT(*)::int AS "eventsCount",
          MIN(e.event_time) AS "firstEventTime",
          MAX(e.event_time) AS "lastEventTime"
        FROM skud_access_events e
        WHERE ${providerWhereConditions.join(" AND ")}
          AND NULLIF(
            e.raw_payload #>> '{rawItem,additionalData,accessObject,data,department_id}',
            ''
          ) IS NOT NULL
        GROUP BY
          NULLIF(
            e.raw_payload #>> '{rawItem,additionalData,accessObject,data,department_id}',
            ''
          ),
          e.access_point
      `,
          {
            replacements,
            type: QueryTypes.SELECT,
          },
        );
        providerSourceSummary.rawRows = providerCandidateRows.length;

        for (const row of providerCandidateRows) {
          const providerDepartmentId = String(row.providerDepartmentId || "").trim();
          const accessPointId =
            row.accessPointId === undefined || row.accessPointId === null
              ? null
              : String(row.accessPointId);
          if (!providerDepartmentId || !accessPointId) {
            continue;
          }

          const contractorFolderName = resolveCounterpartyFolderNameByDepartmentId({
            departmentId: providerDepartmentId,
            departmentsById,
          });
          const counterparty = contractorFolderName
            ? resolveCounterpartyByName(contractorFolderName)
            : null;
          if (!counterparty) {
            providerSourceSummary.unresolvedCounterparty += 1;
            continue;
          }
          if (
            targetCounterpartyId &&
            String(counterparty.id) !== targetCounterpartyId
          ) {
            continue;
          }
          providerSourceSummary.resolvedCounterparty += 1;

          const site = await resolveSiteByAccessPoint(accessPointId);

          if (!site) {
            providerSourceSummary.unresolvedConstructionSite += 1;
            continue;
          }
          providerSourceSummary.resolvedConstructionSite += 1;

          const pairSizeBefore = candidatesByPair.size;
          addCandidatePair({
            counterpartyId: counterparty.id,
            constructionSiteId: site.id,
            eventsCount: row.eventsCount,
            firstEventTime: row.firstEventTime,
            lastEventTime: row.lastEventTime,
            source: "provider_department_access_point",
          });
          if (candidatesByPair.size > pairSizeBefore) {
            providerSourceSummary.resolvedPairs += 1;
          }
        }

        const employeeCounterpartyFolderByExternalEmpId = new Map();
        providerEmployees.forEach((employee) => {
          const externalEmpIdRaw =
            employee?.id ??
            employee?.employeeId ??
            employee?.employee_id ??
            null;
          if (externalEmpIdRaw === undefined || externalEmpIdRaw === null) {
            return;
          }

          const departmentIdRaw =
            employee?.departmentId ??
            employee?.department_id ??
            employee?.department?.id ??
            null;
          const contractorFolderName = resolveCounterpartyFolderNameByDepartmentId({
            departmentId: departmentIdRaw,
            departmentsById,
          });
          if (!contractorFolderName) {
            return;
          }
          employeeCounterpartyFolderByExternalEmpId.set(
            String(externalEmpIdRaw),
            contractorFolderName,
          );
        });

        providerSourceSummary.rawBindingRows = providerAccessPointBindings.length;
        for (const binding of providerAccessPointBindings) {
          const externalEmpId =
            binding?.employeeId ??
            binding?.employee_id ??
            binding?.externalEmpId ??
            binding?.external_emp_id ??
            null;
          const accessPointId =
            binding?.accessPointId ??
            binding?.access_point_id ??
            binding?.accessPoint ??
            null;
          if (
            externalEmpId === undefined ||
            externalEmpId === null ||
            accessPointId === undefined ||
            accessPointId === null
          ) {
            continue;
          }

          const contractorFolderName = employeeCounterpartyFolderByExternalEmpId.get(
            String(externalEmpId),
          );
          const counterparty = contractorFolderName
            ? resolveCounterpartyByName(contractorFolderName)
            : null;
          if (!counterparty) {
            providerSourceSummary.unresolvedBindingCounterparty += 1;
            continue;
          }
          if (
            targetCounterpartyId &&
            String(counterparty.id) !== targetCounterpartyId
          ) {
            continue;
          }

          const site = await resolveSiteByAccessPoint(accessPointId);
          if (!site) {
            providerSourceSummary.unresolvedBindingConstructionSite += 1;
            continue;
          }

          const pairSizeBefore = candidatesByPair.size;
          addCandidatePair({
            counterpartyId: counterparty.id,
            constructionSiteId: site.id,
            source: "provider_employee_access_point_binding",
          });
          if (candidatesByPair.size > pairSizeBefore) {
            providerSourceSummary.resolvedPairsFromBindings += 1;
          }
        }
        providerSourceSummary.potentialConstructionSites = potentialSites.size;
      } catch (providerError) {
        providerSourceSummary.failed = true;
        providerSourceSummary.error = String(
          providerError?.message || providerError,
        );
        console.warn(
          "Failed to collect SKUD provider department/access-point candidates:",
          providerError?.message || providerError,
        );
      }
    } else {
      providerSourceSummary.skipped = true;
      providerSourceSummary.skipReason = targetCounterpartyId
        ? "provider_expansion_disabled_for_target_counterparty"
        : "provider_expansion_disabled";
    }

    const mergedCandidateRows = Array.from(candidatesByPair.values())
      .map((item) => ({
        ...item,
        sources: Array.from(item.sources),
      }))
      .sort((left, right) => {
        const countDiff =
          Number(right?.eventsCount || 0) - Number(left?.eventsCount || 0);
        if (countDiff !== 0) {
          return countDiff;
        }
        const rightLast = right?.lastEventTime
          ? new Date(right.lastEventTime).getTime()
          : 0;
        const leftLast = left?.lastEventTime
          ? new Date(left.lastEventTime).getTime()
          : 0;
        return rightLast - leftLast;
      });
    const candidatePairsTotal = mergedCandidateRows.length;
    const batchCandidateRows = mergedCandidateRows.slice(0, batchSize);

    if (!batchCandidateRows.length) {
      await logAuditEvent({
        userId: req.user?.id || null,
        eventType: AUDIT_EVENT_TYPES.COUNTERPARTY_SITES_SYNCED,
        entityType: "counterparty",
        entityId: null,
        details: {
          source: "skud_events",
          dryRun,
          from: from || null,
          to: to || null,
          targetCounterpartyId,
          includeProviderExpansion,
          batchSize,
          createMissingSites,
          candidatePairs: 0,
          candidatePairsTotal: 0,
          insertedPairs: 0,
          hasSkudPersonBindingsTable,
          hasSkudSiteAccessPointsTable,
          localCandidatePairs: candidateRows.length,
          providerSourceSummary,
        },
        req,
      });

      return res.json({
        success: true,
        message: dryRun
          ? "Предпросмотр завершен: новых связей не найдено"
          : "Синхронизация завершена: новых связей не найдено",
        data: {
          dryRun,
          summary: {
            candidatePairs: 0,
            existingPairs: 0,
            newPairs: 0,
            insertedPairs: 0,
            skippedPairs: 0,
            batchSize,
            candidatePairsTotal: 0,
            processedPairs: 0,
            remainingPairs: 0,
            from: from || null,
            to: to || null,
            targetCounterpartyId,
            includeProviderExpansion,
            createMissingSites,
            hasSkudPersonBindingsTable,
            hasSkudSiteAccessPointsTable,
            localCandidatePairs: candidateRows.length,
            providerSourceSummary,
          },
          items: [],
        },
      });
    }

    const candidateCounterpartyIds = Array.from(
      new Set(batchCandidateRows.map((row) => String(row.counterpartyId))),
    );
    const candidateConstructionSiteIds = Array.from(
      new Set(batchCandidateRows.map((row) => String(row.constructionSiteId))),
    );
    const existingMappings = await CounterpartyConstructionSiteMapping.findAll({
      where: {
        counterpartyId: { [Op.in]: candidateCounterpartyIds },
        constructionSiteId: { [Op.in]: candidateConstructionSiteIds },
      },
      attributes: ["counterpartyId", "constructionSiteId"],
    });
    const existingPairKeys = new Set(
      existingMappings.map((row) =>
        buildMappingPairKey(row.counterpartyId, row.constructionSiteId),
      ),
    );

    const items = [];
    const newMappings = [];

    batchCandidateRows.forEach((row) => {
      const counterpartyId = String(row.counterpartyId || "").trim();
      const constructionSiteId = String(row.constructionSiteId || "").trim();
      if (!counterpartyId || !constructionSiteId) {
        return;
      }

      const counterparty = counterpartyById.get(counterpartyId) || null;
      const site = constructionSiteById.get(constructionSiteId) || null;
      if (!counterparty || !site) {
        return;
      }

      const pairKey = buildMappingPairKey(counterpartyId, constructionSiteId);
      const alreadyExists = existingPairKeys.has(pairKey);

      if (!alreadyExists) {
        newMappings.push({
          counterpartyId,
          constructionSiteId,
        });
      }

      items.push({
        counterpartyId,
        counterpartyName: counterparty.name,
        constructionSiteId,
        constructionSiteName: site.shortName || site.fullName || "—",
        eventsCount: Number(row.eventsCount || 0),
        firstEventTime: row.firstEventTime || null,
        lastEventTime: row.lastEventTime || null,
        status: alreadyExists ? "existing" : "new",
        sources: Array.isArray(row.sources) ? row.sources : [],
      });
    });

    let insertedPairs = 0;
    if (!dryRun && newMappings.length > 0) {
      await CounterpartyConstructionSiteMapping.bulkCreate(newMappings, {
        ignoreDuplicates: true,
      });
      insertedPairs = newMappings.length;
    }

    const summary = {
      candidatePairs: items.length,
      candidatePairsTotal,
      existingPairs: items.filter((item) => item.status === "existing").length,
      newPairs: newMappings.length,
      insertedPairs,
      skippedPairs: dryRun ? newMappings.length : 0,
      batchSize,
      processedPairs: items.length,
      remainingPairs: Math.max(candidatePairsTotal - items.length, 0),
      from: from || null,
      to: to || null,
      targetCounterpartyId,
      includeProviderExpansion,
      createMissingSites,
      hasSkudPersonBindingsTable,
      hasSkudSiteAccessPointsTable,
      localCandidatePairs: candidateRows.length,
      providerSourceSummary,
    };

    await logAuditEvent({
      userId: req.user?.id || null,
      eventType: AUDIT_EVENT_TYPES.COUNTERPARTY_SITES_SYNCED,
      entityType: "counterparty",
      entityId: null,
      details: {
        source: "skud_events",
        dryRun,
        ...summary,
      },
      req,
    });

    res.json({
      success: true,
      message: dryRun
        ? "Предпросмотр синхронизации сформирован"
        : "Синхронизация из СКУД выполнена",
      data: {
        dryRun,
        summary,
        items,
      },
    });
  } catch (error) {
    console.error("Error syncing counterparty construction sites from SKUD:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Получить список доступных контрагентов для текущего пользователя
export const getAvailableCounterparties = async (req, res, next) => {
  try {
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    let where = {};

    if (req.user.role === "admin") {
      // admin видит всех контрагентов
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - только свой контрагент
      where.id = req.user.counterpartyId;
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - свой контрагент + субподрядчики
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      where.id = { [Op.in]: allowedIds };
    }

    const counterparties = await Counterparty.findAll({
      where,
      attributes: ["id", "name", "inn"],
      include: [
        {
          model: CounterpartyTypeMapping,
          as: "typeMapping",
          attributes: ["types"],
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    });

    res.json({
      success: true,
      data: counterparties,
    });
  } catch (error) {
    console.error("Error fetching available counterparties:", error);
    next(error);
  }
};
