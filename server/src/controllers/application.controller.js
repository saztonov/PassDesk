import {
  Application,
  Counterparty,
  ConstructionSite,
  Contract,
  Employee,
  User,
  ApplicationEmployeeMapping,
  ApplicationFileMapping,
  File,
  Citizenship,
  EmployeeCounterpartyMapping,
  CounterpartyConstructionSiteMapping,
  Position,
  Department,
  sequelize,
  Status,
  EmployeeStatusMapping,
} from "../models/index.js";
import { Op } from "sequelize";
import storageProvider from "../config/storage.js";
import { generateApplicationDocument } from "../services/documentService.js";
import EmployeeStatusService from "../services/employeeStatusService.js";
import { getAccessibleEmployeeIds } from "../utils/permissionUtils.js";
import { AppError } from "../middleware/errorHandler.js";
import { sanitizeFileName } from "../utils/transliterate.js";

const STATUS_GROUP = "status";
const PROCESSABLE_STATUSES = new Set(["status_new", "status_tb_passed"]);
const CONSENT_DOCUMENT_TYPES = [
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
];

const getUniqueIds = (ids = []) => [
  ...new Set((ids || []).map((id) => String(id)).filter(Boolean)),
];

const sanitizeZipPathSegment = (value, fallback = "employee") => {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[_.\s]+|[_.\s]+$/g, "");

  return normalized || fallback;
};

const buildEmployeeConsentFolderName = (employee) => {
  const source = employee?.toJSON ? employee.toJSON() : employee || {};
  const fullName = [source.lastName, source.firstName, source.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return sanitizeZipPathSegment(fullName, `employee_${source.id || "unknown"}`);
};

const buildApplicationRequestStatusWhere = (requestedStatuses = []) => {
  const normalized = Array.isArray(requestedStatuses)
    ? requestedStatuses
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (normalized.length === 0) {
    return null;
  }

  const predicates = [];

  if (normalized.includes("active")) {
    predicates.push(`(
      EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND esm.status_group = 'status'
          AND s.name IN ('status_new', 'status_tb_passed', 'status_processed')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND esm.status_group = 'status_active'
          AND s.name IN ('status_active_fired', 'status_active_fired_compl', 'status_active_inactive')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND esm.status_group = 'status_secure'
          AND s.name IN ('status_secure_block', 'status_secure_block_compl')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND (
            (esm.status_group IN ('status_card', 'card draft') AND s.name = 'status_card_draft')
            OR
            (esm.status_group IN ('status', 'draft') AND s.name = 'status_draft')
          )
      )
    )`);
  }

  if (normalized.includes("draft")) {
    predicates.push(`(
      EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND (
            (esm.status_group IN ('status_card', 'card draft') AND s.name = 'status_card_draft')
            OR
            (esm.status_group IN ('status', 'draft') AND s.name = 'status_draft')
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND esm.status_group = 'status_active'
          AND s.name IN ('status_active_fired', 'status_active_fired_compl', 'status_active_inactive')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM employees_statuses_mapping esm
        JOIN statuses s ON s.id = esm.status_id
        WHERE esm.employee_id = "Employee"."id"
          AND esm.is_active IS NOT FALSE
          AND esm.status_group = 'status_secure'
          AND s.name IN ('status_secure_block', 'status_secure_block_compl')
      )
    )`);
  }

  if (normalized.includes("fired")) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM employees_statuses_mapping esm
      JOIN statuses s ON s.id = esm.status_id
      WHERE esm.employee_id = "Employee"."id"
        AND esm.is_active IS NOT FALSE
        AND esm.status_group = 'status_active'
        AND s.name IN ('status_active_fired', 'status_active_fired_compl')
    )`);
  }

  if (predicates.length === 0) {
    return null;
  }

  return {
    [Op.and]: [sequelize.literal(`(${predicates.join(" OR ")})`)],
  };
};

const buildApplicationRequestEmployeeWhere = ({
  requestedStatuses = [],
  counterpartyId = null,
  constructionSiteId = null,
  scopedCounterpartyId = null,
}) => {
  const conditions = [];
  const statusWhere = buildApplicationRequestStatusWhere(requestedStatuses);

  if (statusWhere?.[Op.and]?.length) {
    conditions.push(...statusWhere[Op.and]);
  }

  const effectiveCounterpartyId = scopedCounterpartyId || counterpartyId;
  if (effectiveCounterpartyId || constructionSiteId) {
    const mappingPredicates = [`ecm.employee_id = "Employee"."id"`];

    if (effectiveCounterpartyId) {
      mappingPredicates.push(
        `ecm.counterparty_id = ${sequelize.escape(effectiveCounterpartyId)}`,
      );
    }

    if (constructionSiteId) {
      mappingPredicates.push(
        `ecm.construction_site_id = ${sequelize.escape(constructionSiteId)}`,
      );
    }

    conditions.push(
      sequelize.literal(
        `EXISTS (
          SELECT 1
          FROM employee_counterparty_mapping ecm
          WHERE ${mappingPredicates.join(" AND ")}
        )`,
      ),
    );
  }

  if (conditions.length === 0) {
    return {};
  }

  return {
    [Op.and]: conditions,
  };
};

const transitionEmployeesToProcessedStatus = async ({
  employeeIds,
  userId,
  transaction,
}) => {
  const uniqueEmployeeIds = getUniqueIds(employeeIds);
  if (uniqueEmployeeIds.length === 0) {
    return;
  }

  const [processedStatus, currentMappings] = await Promise.all([
    Status.findOne({
      where: { name: "status_processed", group: STATUS_GROUP },
      transaction,
    }),
    EmployeeStatusMapping.findAll({
      where: {
        employeeId: { [Op.in]: uniqueEmployeeIds },
        statusGroup: STATUS_GROUP,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
          attributes: ["id", "name"],
        },
      ],
      transaction,
    }),
  ]);

  if (!processedStatus) {
    console.error("[application] Статус 'status_processed' не найден");
    return;
  }

  const employeeIdsToProcess = [];
  const seen = new Set();
  for (const mapping of currentMappings) {
    const employeeId = String(mapping.employeeId);
    const currentStatusName = mapping?.status?.name;
    if (PROCESSABLE_STATUSES.has(currentStatusName) && !seen.has(employeeId)) {
      seen.add(employeeId);
      employeeIdsToProcess.push(employeeId);
    }
  }

  if (employeeIdsToProcess.length === 0) {
    return;
  }

  await EmployeeStatusMapping.update(
    {
      isActive: false,
      updatedBy: userId,
    },
    {
      where: {
        employeeId: { [Op.in]: employeeIdsToProcess },
        statusGroup: STATUS_GROUP,
        isActive: true,
      },
      transaction,
    },
  );

  const existingProcessedMappings = await EmployeeStatusMapping.findAll({
    where: {
      employeeId: { [Op.in]: employeeIdsToProcess },
      statusId: processedStatus.id,
    },
    attributes: ["id", "employeeId"],
    transaction,
  });

  const existingProcessedMappingIds = existingProcessedMappings.map(
    (mapping) => mapping.id,
  );
  if (existingProcessedMappingIds.length > 0) {
    await EmployeeStatusMapping.update(
      {
        isActive: true,
        updatedBy: userId,
      },
      {
        where: {
          id: { [Op.in]: existingProcessedMappingIds },
        },
        transaction,
      },
    );
  }

  const existingEmployeeIds = new Set(
    existingProcessedMappings.map((mapping) => String(mapping.employeeId)),
  );
  const mappingsToCreate = employeeIdsToProcess
    .filter((employeeId) => !existingEmployeeIds.has(String(employeeId)))
    .map((employeeId) => ({
      employeeId,
      statusId: processedStatus.id,
      statusGroup: STATUS_GROUP,
      createdBy: userId,
      updatedBy: userId,
      isActive: true,
    }));

  if (mappingsToCreate.length > 0) {
    await EmployeeStatusMapping.bulkCreate(mappingsToCreate, { transaction });
  }
};

const upsertEmployeeCounterpartyMappings = async ({
  employeeIds,
  counterpartyId,
  constructionSiteId,
  transaction,
}) => {
  const uniqueEmployeeIds = getUniqueIds(employeeIds);
  if (uniqueEmployeeIds.length === 0) {
    return;
  }

  const existingMappings = await EmployeeCounterpartyMapping.findAll({
    where: {
      counterpartyId,
      constructionSiteId,
      employeeId: { [Op.in]: uniqueEmployeeIds },
    },
    attributes: ["employeeId"],
    transaction,
  });

  const existingEmployeeIds = new Set(
    existingMappings.map((mapping) => String(mapping.employeeId)),
  );
  const existingEmployeeIdsList = [...existingEmployeeIds];

  if (existingEmployeeIdsList.length > 0) {
    await EmployeeCounterpartyMapping.update(
      { updatedAt: new Date() },
      {
        where: {
          counterpartyId,
          constructionSiteId,
          employeeId: { [Op.in]: existingEmployeeIdsList },
        },
        transaction,
      },
    );
  }

  const mappingsToCreate = uniqueEmployeeIds
    .filter((employeeId) => !existingEmployeeIds.has(String(employeeId)))
    .map((employeeId) => ({
      employeeId,
      counterpartyId,
      constructionSiteId,
      departmentId: null,
    }));

  if (mappingsToCreate.length > 0) {
    await EmployeeCounterpartyMapping.bulkCreate(mappingsToCreate, {
      transaction,
      ignoreDuplicates: true,
    });
  }
};

// Функция генерации номера заявки
const generateApplicationNumber = async (constructionSiteId) => {
  try {
    // Если объект строительства не указан, используем запасной формат
    if (!constructionSiteId) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      return `APP-${timestamp}-${random}`;
    }

    // Загружаем объект строительства
    const site = await ConstructionSite.findByPk(constructionSiteId);

    if (site && site.shortName) {
      // Получаем первые 3 буквы названия объекта (только русские буквы)
      const sitePrefix = site.shortName
        .replace(/[^А-ЯЁа-яё]/g, "") // Оставляем только русские буквы
        .substring(0, 3)
        .toUpperCase();

      // Форматируем дату (ДДММГГ)
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = String(now.getFullYear()).substring(2);
      const dateStr = `${day}${month}${year}`;

      // Получаем начало и конец текущего дня
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
      );
      const endOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
      );

      // Подсчитываем количество заявок на этот объект за сегодня
      const count = await Application.count({
        where: {
          constructionSiteId: constructionSiteId,
          createdAt: {
            [Op.between]: [startOfDay, endOfDay],
          },
        },
      });

      // Порядковый номер (следующий)
      const sequence = String(count + 1).padStart(3, "0");

      // Формируем номер заявки: ЗИЛ-171125-001
      return `${sitePrefix}-${dateStr}-${sequence}`;
    }
  } catch (error) {
    console.error("Error generating application number:", error);
  }

  // В случае ошибки используем старый формат
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `APP-${timestamp}-${random}`;
};

// Получить все заявки
export const getAllApplications = async (req, res, next) => {
  try {
    const { counterpartyId, status, page = 1, limit = 10 } = req.query;

    const where = {};

    // Каждый пользователь видит только свои заявки
    where.createdBy = req.user.id;

    if (counterpartyId) {
      where.counterparty_id = counterpartyId;
    }

    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Application.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "type"],
        },
        {
          model: ConstructionSite,
          as: "constructionSite",
          attributes: ["id", "shortName", "fullName"],
        },
        {
          model: Contract,
          as: "subcontract",
          attributes: ["id", "contractNumber"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "firstName", "lastName"],
        },
        {
          model: Employee,
          as: "employees",
          include: [
            {
              model: Citizenship,
              as: "citizenship",
              attributes: ["name"],
            },
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              include: [
                {
                  model: Counterparty,
                  as: "counterparty",
                  attributes: ["name", "inn", "kpp"],
                },
              ],
            },
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
            "middleName",
            "kig",
            "kigEnc",
            "kigKeyVersion",
            "birthDate",
            "snils",
            "inn",
            "positionId",
          ],
          through: { attributes: [] }, // Не включать поля из связующей таблицы
        },
        {
          model: File,
          as: "scanFile",
          attributes: [
            "id",
            "fileKey",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
            "createdAt",
          ],
          required: false, // LEFT JOIN - заявка может существовать без скана
        },
        {
          model: File,
          as: "files",
          attributes: [
            "id",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
          ],
          through: {
            attributes: ["employeeId"], // Включаем employeeId из маппинга
            as: "fileMapping",
          },
        },
      ],
    });

    res.json({
      success: true,
      data: {
        applications: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    next(error);
  }
};

// Получить заявку по ID
export const getApplicationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
      include: [
        {
          model: Counterparty,
          as: "counterparty",
        },
        {
          model: ConstructionSite,
          as: "constructionSite",
        },
        {
          model: Contract,
          as: "subcontract",
        },
        {
          model: User,
          as: "creator",
        },
        {
          model: Employee,
          as: "employees",
          include: [
            {
              model: Citizenship,
              as: "citizenship",
              attributes: ["name"],
            },
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              include: [
                {
                  model: Counterparty,
                  as: "counterparty",
                  attributes: ["name", "inn", "kpp"],
                },
              ],
            },
            {
              model: Position,
              as: "position",
              attributes: ["id", "name"],
            },
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
          ],
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "middleName",
            "kig",
            "kigEnc",
            "kigKeyVersion",
            "birthDate",
            "snils",
            "inn",
            "positionId",
          ],
          through: { attributes: [] },
        },
        {
          model: File,
          as: "scanFile",
          attributes: [
            "id",
            "fileKey",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
            "createdAt",
          ],
          required: false, // LEFT JOIN - заявка может существовать без скана
        },
      ],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("Error fetching application:", error);
    next(error);
  }
};

// Создать заявку
export const createApplication = async (req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    console.log(
      "[createApplication] start",
      "user:",
      req.user?.id,
      "counterpartyId:",
      req.user?.counterpartyId,
    );
  }

  const transaction = await sequelize.transaction();

  try {
    const { employeeIds, selectedFiles, ...applicationData } = req.body;

    // Проверяем, что выбран хотя бы один сотрудник
    if (
      !employeeIds ||
      !Array.isArray(employeeIds) ||
      employeeIds.length === 0
    ) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Необходимо выбрать хотя бы одного сотрудника",
      });
    }

    const { deniedIds: deniedEmployeeIds } = await getAccessibleEmployeeIds(
      req.user,
      employeeIds,
      "write",
      transaction,
    );
    if (deniedEmployeeIds.length > 0) {
      await transaction.rollback();
      return next(
        new AppError(
          "Недостаточно прав для работы с выбранными сотрудниками",
          403,
        ),
      );
    }

    if (applicationData.constructionSiteId && req.user.role !== "admin") {
      const siteMapping = await CounterpartyConstructionSiteMapping.findOne({
        where: {
          counterpartyId: req.user.counterpartyId,
          constructionSiteId: applicationData.constructionSiteId,
        },
        transaction,
      });

      if (!siteMapping) {
        await transaction.rollback();
        return next(
          new AppError(
            "Недостаточно прав для выбора объекта строительства",
            403,
          ),
        );
      }
    }

    if (applicationData.subcontractId) {
      const subcontract = await Contract.findByPk(
        applicationData.subcontractId,
        {
          transaction,
        },
      );

      if (!subcontract) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Договор не найден",
        });
      }

      if (subcontract.type !== "subcontract") {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Некорректный тип договора для заявки",
        });
      }

      if (
        req.user.role !== "admin" &&
        subcontract.counterparty1Id !== req.user.counterpartyId &&
        subcontract.counterparty2Id !== req.user.counterpartyId
      ) {
        await transaction.rollback();
        return next(new AppError("Недостаточно прав для выбора договора", 403));
      }

      if (
        applicationData.constructionSiteId &&
        String(subcontract.constructionSiteId) !==
          String(applicationData.constructionSiteId)
      ) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Договор не принадлежит выбранному объекту строительства",
        });
      }
    }

    // Генерируем номер заявки
    const applicationNumber = await generateApplicationNumber(
      applicationData.constructionSiteId,
    );

    // Создаем заявку
    const application = await Application.create(
      {
        ...applicationData,
        applicationNumber,
        counterpartyId: req.user.counterpartyId,
        createdBy: req.user.id,
      },
      { transaction },
    );

    // Добавляем сотрудников через таблицу маппинга
    const mappingRecords = employeeIds.map((employeeId) => ({
      applicationId: application.id,
      employeeId: employeeId,
    }));

    await ApplicationEmployeeMapping.bulkCreate(mappingRecords, {
      transaction,
    });

    try {
      await transitionEmployeesToProcessedStatus({
        employeeIds,
        userId: req.user.id,
        transaction,
      });
    } catch (statusSyncError) {
      console.error(
        "[createApplication] Ошибка пакетного обновления статусов:",
        statusSyncError.message,
        statusSyncError.stack,
      );
      // Сохраняем прежнее поведение: создание заявки не блокируется ошибкой смены статусов.
    }

    // Обновляем/создаем записи в employee_counterparty_mapping для каждого сотрудника
    // Только если указан объект строительства
    if (applicationData.constructionSiteId) {
      await upsertEmployeeCounterpartyMappings({
        employeeIds,
        counterpartyId: req.user.counterpartyId,
        constructionSiteId: applicationData.constructionSiteId,
        transaction,
      });
    }

    // Добавляем файлы, если они выбраны
    // selectedFiles должен быть массивом объектов: [{ employeeId, fileId }, ...]
    if (
      selectedFiles &&
      Array.isArray(selectedFiles) &&
      selectedFiles.length > 0
    ) {
      const selectedEmployeeIds = [
        ...new Set(
          selectedFiles.map((item) => item?.employeeId).filter(Boolean),
        ),
      ];
      const selectedFileIds = [
        ...new Set(selectedFiles.map((item) => item?.fileId).filter(Boolean)),
      ];

      if (selectedEmployeeIds.length === 0 || selectedFileIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Некорректный список файлов для привязки",
        });
      }

      const employeeIdSet = new Set(employeeIds.map((id) => String(id)));
      const invalidEmployeeIds = selectedEmployeeIds.filter(
        (id) => !employeeIdSet.has(String(id)),
      );
      if (invalidEmployeeIds.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Файлы можно привязывать только к сотрудникам из заявки",
        });
      }

      const { deniedIds: deniedSelectedEmployeeIds } =
        await getAccessibleEmployeeIds(
          req.user,
          selectedEmployeeIds,
          "write",
          transaction,
        );
      if (deniedSelectedEmployeeIds.length > 0) {
        await transaction.rollback();
        return next(
          new AppError(
            "Недостаточно прав для привязки файлов к выбранным сотрудникам",
            403,
          ),
        );
      }

      const files = await File.findAll({
        where: {
          id: { [Op.in]: selectedFileIds },
          isDeleted: false,
        },
        attributes: ["id", "employeeId"],
        transaction,
      });
      const fileMap = new Map(
        files.map((file) => [String(file.id), String(file.employeeId)]),
      );

      const invalidFiles = selectedFiles.filter(({ employeeId, fileId }) => {
        const mappedEmployeeId = fileMap.get(String(fileId));
        return !mappedEmployeeId || String(employeeId) !== mappedEmployeeId;
      });

      if (invalidFiles.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Некоторые файлы не принадлежат указанным сотрудникам",
        });
      }

      const fileRecords = selectedFiles.map(({ employeeId, fileId }) => ({
        applicationId: application.id,
        employeeId: employeeId,
        fileId: fileId,
      }));

      await ApplicationFileMapping.bulkCreate(fileRecords, { transaction });
    }

    await transaction.commit();

    // Загружаем заявку с сотрудниками и файлами
    const result = await Application.findByPk(application.id, {
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
            "middleName",
            "positionId",
          ],
          through: { attributes: [] },
        },
        {
          model: File,
          as: "files",
          attributes: [
            "id",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
          ],
          through: {
            attributes: ["employeeId"],
            as: "fileMapping",
          },
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Заявка успешно создана",
      data: result,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating application:", error);

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

// Обновить заявку
export const updateApplication = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { employeeIds, ...updates } = req.body;

    const application = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
      transaction,
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    // Обновляем данные заявки (не перезаписываем counterpartyId)
    const { counterpartyId, ...updateData } = updates;

    const targetConstructionSiteId =
      updateData.constructionSiteId ?? application.constructionSiteId;
    const targetSubcontractId =
      updateData.subcontractId ?? application.subcontractId;

    if (updateData.constructionSiteId && req.user.role !== "admin") {
      const siteMapping = await CounterpartyConstructionSiteMapping.findOne({
        where: {
          counterpartyId: req.user.counterpartyId,
          constructionSiteId: updateData.constructionSiteId,
        },
        transaction,
      });

      if (!siteMapping) {
        await transaction.rollback();
        return next(
          new AppError(
            "Недостаточно прав для выбора объекта строительства",
            403,
          ),
        );
      }
    }

    if (targetSubcontractId) {
      const subcontract = await Contract.findByPk(targetSubcontractId, {
        transaction,
      });

      if (!subcontract) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Договор не найден",
        });
      }

      if (subcontract.type !== "subcontract") {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Некорректный тип договора для заявки",
        });
      }

      if (
        req.user.role !== "admin" &&
        subcontract.counterparty1Id !== req.user.counterpartyId &&
        subcontract.counterparty2Id !== req.user.counterpartyId
      ) {
        await transaction.rollback();
        return next(new AppError("Недостаточно прав для выбора договора", 403));
      }

      if (
        targetConstructionSiteId &&
        String(subcontract.constructionSiteId) !==
          String(targetConstructionSiteId)
      ) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Договор не принадлежит выбранному объекту строительства",
        });
      }
    }

    await application.update(
      {
        ...updateData,
        updatedBy: req.user.id,
      },
      { transaction },
    );

    // Если переданы employeeIds, обновляем связи
    if (employeeIds && Array.isArray(employeeIds)) {
      if (employeeIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Необходимо выбрать хотя бы одного сотрудника",
        });
      }

      const { deniedIds: deniedEmployeeIds } = await getAccessibleEmployeeIds(
        req.user,
        employeeIds,
        "write",
        transaction,
      );
      if (deniedEmployeeIds.length > 0) {
        await transaction.rollback();
        return next(
          new AppError(
            "Недостаточно прав для работы с выбранными сотрудниками",
            403,
          ),
        );
      }

      // Получаем старый список сотрудников из заявки
      const oldEmployeeMappings = await ApplicationEmployeeMapping.findAll({
        where: { applicationId: id },
        attributes: ["employeeId"],
        transaction,
      });
      const oldEmployeeIds = oldEmployeeMappings.map((m) => m.employeeId);

      // Определяем сотрудников, у которых были сняты чекбоксы
      const nextEmployeeIdSet = new Set(
        employeeIds.map((empId) => String(empId)),
      );
      const removedEmployeeIds = oldEmployeeIds.filter(
        (empId) => !nextEmployeeIdSet.has(String(empId)),
      );

      // Удаляем старые связи
      await ApplicationEmployeeMapping.destroy({
        where: { applicationId: id },
        transaction,
      });

      // Создаем новые связи
      const mappingRecords = employeeIds.map((employeeId) => ({
        applicationId: id,
        employeeId: employeeId,
      }));

      await ApplicationEmployeeMapping.bulkCreate(mappingRecords, {
        transaction,
      });

      await upsertEmployeeCounterpartyMappings({
        employeeIds,
        counterpartyId: application.counterpartyId,
        constructionSiteId: application.constructionSiteId,
        transaction,
      });

      // Удаляем записи из employee_counterparty_mapping для сотрудников, у которых сняли чекбоксы
      if (removedEmployeeIds.length > 0) {
        await EmployeeCounterpartyMapping.destroy({
          where: {
            employeeId: { [Op.in]: removedEmployeeIds },
            counterpartyId: application.counterpartyId,
            constructionSiteId: application.constructionSiteId,
          },
          transaction,
        });
      }
    }

    await transaction.commit();

    // Загружаем обновленную заявку с сотрудниками
    const result = await Application.findByPk(id, {
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
            "middleName",
            "positionId",
          ],
          through: { attributes: [] },
        },
      ],
    });

    res.json({
      success: true,
      message: "Заявка успешно обновлена",
      data: result,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating application:", error);

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

// Удалить заявку
export const deleteApplication = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const application = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
      include: [
        {
          model: Employee,
          as: "employees",
          attributes: ["id"],
          through: { attributes: [] },
        },
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name"],
        },
      ],
      transaction,
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    console.log("=== DELETING APPLICATION ===");
    console.log("Application:", {
      id: application.id,
      number: application.applicationNumber,
    });

    // 1. Удаляем файлы, прикрепленные к заявке
    const files = await File.findAll({
      where: {
        entityType: "application",
        entityId: id,
        isDeleted: false,
      },
      transaction,
    });

    console.log(`Found ${files.length} files to delete`);

    // Удаляем каждый файл из хранилища
    for (const file of files) {
      try {
        console.log(`Deleting file from storage: ${file.filePath}`);
        await storageProvider.deleteFile(file.filePath);
        console.log(`✓ File deleted: ${file.filePath}`);
      } catch (error) {
        console.error(`✗ Error deleting file from storage: ${file.filePath}`);
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
        });
        // Продолжаем удаление, даже если файл уже отсутствует
      }
    }

    // Физически удаляем файлы из БД
    const deletedFilesCount = await File.destroy({
      where: {
        entityType: "application",
        entityId: id,
      },
      transaction,
    });
    console.log(`Deleted ${deletedFilesCount} file records from DB`);

    // 2. Удаляем записи из employee_counterparty_mapping для сотрудников этой заявки
    // Удаляем только те записи, которые соответствуют комбинации:
    // сотрудник из заявки + контрагент заявки + объект заявки
    const employeeIds = application.employees.map((emp) => emp.id);

    if (employeeIds.length > 0) {
      const deletedMappingsCount = await EmployeeCounterpartyMapping.destroy({
        where: {
          employeeId: employeeIds,
          counterpartyId: application.counterpartyId,
          constructionSiteId: application.constructionSiteId,
        },
        transaction,
      });
      console.log(
        `Deleted ${deletedMappingsCount} employee-counterparty mappings`,
      );
    }

    // 3. Удаляем саму заявку (каскадно удалятся записи из application_employees_mapping)
    await application.destroy({ transaction });

    await transaction.commit();

    console.log("✓ Application deleted successfully");

    res.json({
      success: true,
      message: "Заявка успешно удалена",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting application:", error);
    next(error);
  }
};

// Копировать заявку
export const copyApplication = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const original = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
      include: [
        {
          model: Employee,
          as: "employees",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
      transaction,
    });

    if (!original) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    // Создаем копию
    const copy = await Application.create(
      {
        counterpartyId: original.counterpartyId,
        constructionSiteId: original.constructionSiteId,
        subcontractId: original.subcontractId,
        notes: original.notes ? `Копия: ${original.notes}` : "Копия заявки",
        status: "draft",
        createdBy: req.user.id,
      },
      { transaction },
    );

    // Копируем сотрудников
    const employeeIds = original.employees.map((emp) => emp.id);
    await copy.addEmployees(employeeIds, { transaction });

    await transaction.commit();

    // Загружаем копию с сотрудниками
    const result = await Application.findByPk(copy.id, {
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
            "middleName",
            "positionId",
          ],
          through: { attributes: [] },
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Заявка успешно скопирована",
      data: result,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error copying application:", error);
    next(error);
  }
};

// Получить договоры для выбранного контрагента и объекта
export const getContractsForApplication = async (req, res, next) => {
  try {
    const { counterpartyId, constructionSiteId } = req.query;

    if (!counterpartyId || !constructionSiteId) {
      return res.status(400).json({
        success: false,
        message: "Требуются counterpartyId и constructionSiteId",
      });
    }

    // Проверка прав: пользователь может смотреть договоры только своего контрагента
    if (
      req.user.role !== "admin" &&
      req.user.counterpartyId !== counterpartyId
    ) {
      return next(
        new AppError("Нет доступа к данным другого контрагента", 403),
      );
    }

    // Получаем контрагента
    const counterparty = await Counterparty.findByPk(counterpartyId);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    const result = {
      generalContract: null,
      subcontracts: [],
    };

    // Ищем договор генподряда для этого объекта
    const generalContract = await Contract.findOne({
      where: {
        construction_site_id: constructionSiteId,
        type: "general_contract",
        [Op.or]: [
          { counterparty1_id: counterpartyId },
          { counterparty2_id: counterpartyId },
        ],
      },
      include: [
        { model: Counterparty, as: "counterparty1" },
        { model: Counterparty, as: "counterparty2" },
      ],
    });

    if (generalContract) {
      result.generalContract = generalContract;
    }

    // Если контрагент - подрядчик, ищем договоры подряда
    if (counterparty.type === "contractor") {
      const subcontracts = await Contract.findAll({
        where: {
          construction_site_id: constructionSiteId,
          type: "subcontract",
          [Op.or]: [
            { counterparty1_id: counterpartyId },
            { counterparty2_id: counterpartyId },
          ],
        },
        include: [
          { model: Counterparty, as: "counterparty1" },
          { model: Counterparty, as: "counterparty2" },
        ],
      });

      result.subcontracts = subcontracts;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Получить сотрудников для выбранного контрагента
export const getEmployeesForApplication = async (req, res, next) => {
  try {
    const { counterpartyId } = req.query;

    if (!counterpartyId) {
      return res.status(400).json({
        success: false,
        message: "Требуется counterpartyId",
      });
    }

    if (
      req.user.role !== "admin" &&
      String(req.user.counterpartyId) !== String(counterpartyId)
    ) {
      return next(
        new AppError("Нет доступа к данным другого контрагента", 403),
      );
    }

    // Теперь сотрудники связаны с контрагентами через маппинг
    const employees = await Employee.findAll({
      include: [
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          where: {
            counterpartyId: counterpartyId,
          },
          attributes: [],
        },
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
        "middleName",
        "positionId",
      ],
      order: [["firstName", "ASC"], ["middleName", "ASC"]],
    });

    res.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

export const getRequestEmployeesForApplication = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      counterpartyId = null,
      constructionSiteId = null,
      statuses = null,
    } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const requestedStatuses = Array.isArray(statuses)
      ? statuses
      : typeof statuses === "string" && statuses.trim().startsWith("[")
        ? JSON.parse(statuses)
        : statuses
          ? [statuses]
          : [];

    const mappingWhere = {};
    let mappingRequired = false;
    let scopedCounterpartyId = null;

    if (constructionSiteId) {
      mappingWhere.constructionSiteId = constructionSiteId;
      mappingRequired = true;
    }

    if (counterpartyId) {
      mappingWhere.counterpartyId = counterpartyId;
      mappingRequired = true;
    }

    if (req.user.role === "user") {
      if (!req.user.counterpartyId) {
        return next(new AppError("Контрагент пользователя не найден", 403));
      }

      scopedCounterpartyId = req.user.counterpartyId;
      mappingWhere.counterpartyId = req.user.counterpartyId;
      mappingRequired = true;
    }

    const where = buildApplicationRequestEmployeeWhere({
      requestedStatuses,
      counterpartyId,
      constructionSiteId,
      scopedCounterpartyId,
    });

    const mappingInclude = {
      model: EmployeeCounterpartyMapping,
      as: "employeeCounterpartyMappings",
      attributes: ["id", "counterpartyId", "departmentId", "constructionSiteId"],
      required: mappingRequired,
      ...(Object.keys(mappingWhere).length > 0 ? { where: mappingWhere } : {}),
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "inn", "kpp"],
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

    const count = await Employee.count({ where });

    const pageEmployeeRows = await Employee.findAll({
      where,
      attributes: ["id"],
      order: [
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
      limit: safeLimit,
      offset,
      raw: true,
    });

    const pageEmployeeIds = pageEmployeeRows.map((employee) => employee.id);

    if (pageEmployeeIds.length === 0) {
      return res.json({
        success: true,
        data: {
          employees: [],
          pagination: {
            total: count,
            page: safePage,
            limit: safeLimit,
            pages: Math.ceil(count / safeLimit),
          },
        },
      });
    }

    const employees = await Employee.findAll({
      where: {
        id: {
          [Op.in]: pageEmployeeIds,
        },
      },
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code"],
        },
        {
          model: Citizenship,
          as: "birthCountry",
          attributes: ["id", "name", "code"],
          required: false,
        },
        {
          model: Position,
          as: "position",
          attributes: ["id", "name"],
          required: false,
        },
        mappingInclude,
        {
          model: File,
          as: "files",
          attributes: ["id", "fileKey", "fileName", "documentType"],
          where: {
            documentType: {
              [Op.in]: CONSENT_DOCUMENT_TYPES,
            },
            isDeleted: false,
          },
          required: false,
        },
      ],
      attributes: [
        "id",
        "firstName",
        "lastName",
        "lastNameEnc",
        "lastNameHash",
        "lastNameKeyVersion",
        "middleName",
        "gender",
        "birthDate",
        "birthRegion",
        "birthCity",
        "snils",
        "positionId",
        "inn",
        "kig",
        "kigEnc",
        "kigHash",
        "kigKeyVersion",
        "kigEndDate",
        "phone",
        "passportType",
        "passportNumber",
        "passportNumberEnc",
        "passportNumberHash",
        "passportNumberKeyVersion",
        "passportDate",
        "passportIssuer",
        "passportDepartmentCode",
        "passportExpiryDate",
        "registrationAddress",
        "patentNumber",
        "patentNumberEnc",
        "patentNumberHash",
        "patentNumberKeyVersion",
        "patentIssueDate",
        "blankNumber",
        "bankAccountNumber",
        "bankBik",
        "idAll",
      ],
      order: [["updatedAt", "DESC"]],
    });

    const employeesById = new Map(
      employees.map((employee) => [
        String(employee.id),
        employee?.toJSON ? employee.toJSON() : employee,
      ]),
    );
    const orderedEmployees = pageEmployeeIds
      .map((employeeId) => employeesById.get(String(employeeId)))
      .filter(Boolean);

    res.json({
      success: true,
      data: {
        employees: orderedEmployees,
        pagination: {
          total: count,
          page: safePage,
          limit: safeLimit,
          pages: Math.ceil(count / safeLimit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching request employees:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Экспортировать заявку в Word
export const exportApplicationToWord = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверяем доступ к заявке
    const application = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    // Генерируем документ Word
    const buffer = await generateApplicationDocument(id);

    // Формируем имя файла
    const fileName = `Заявка_${application.applicationNumber}.docx`;

    // Отправляем файл
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error exporting application to Word:", error);
    next(error);
  }
};

// Выгрузить согласия на обработку перс. данных Застройщика в ZIP
export const downloadDeveloperBiometricConsents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { employeeIds } = req.body; // Массив ID выбранных сотрудников

    // Проверяем доступ к заявке
    const application = await Application.findOne({
      where: {
        id: id,
        createdBy: req.user.id, // Только свои заявки
      },
      include: [
        {
          model: Employee,
          as: "employees",
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "middleName",
          ],
        },
      ],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Заявка не найдена",
      });
    }

    // Валидируем, что employeeIds - это массив
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Необходимо выбрать хотя бы одного сотрудника",
      });
    }

    const { deniedIds: deniedEmployeeIds } = await getAccessibleEmployeeIds(
      req.user,
      employeeIds,
      "read",
    );
    if (deniedEmployeeIds.length > 0) {
      return next(
        new AppError(
          "Недостаточно прав для работы с выбранными сотрудниками",
          403,
        ),
      );
    }

    const applicationEmployeeIdSet = new Set(
      application.employees.map((emp) => String(emp.id)),
    );
    const invalidEmployeeIds = employeeIds.filter(
      (employeeId) => !applicationEmployeeIdSet.has(String(employeeId)),
    );

    if (invalidEmployeeIds.length > 0) {
      return next(
        new AppError("Сотрудники не принадлежат выбранной заявке", 403),
      );
    }

    // Получаем все согласия на перс. данные для выбранных сотрудников
    const consentFiles = await File.findAll({
      where: {
        documentType: {
          [Op.in]: CONSENT_DOCUMENT_TYPES,
        },
        employeeId: {
          [Op.in]: employeeIds,
        },
        isDeleted: false,
      },
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "middleName",
          ],
        },
      ],
    });

    if (consentFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Нет согласий на обработку перс. данных для выбранных сотрудников",
      });
    }

    // Импортируем archiver и axios для загрузки файлов
    const archiver = (await import("archiver")).default;
    const axios = (await import("axios")).default;

    // Создаем ZIP архив
    const archive = archiver("zip", { zlib: { level: 9 } });

    // Обработчики ошибок
    archive.on("error", (err) => {
      console.error("Archiver error:", err);
      if (!res.headersSent) {
        next(err);
      }
    });

    // Устанавливаем заголовки для скачивания ZIP
    const fileName = `Согласия_ПерсДанные_${application.applicationNumber}_${new Date().toISOString().split("T")[0]}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    // Пайпим архив в response
    archive.pipe(res);

    const usedArchivePaths = new Set();

    // Добавляем файлы в архив
    for (const file of consentFiles) {
      try {
        const employeeFolder = buildEmployeeConsentFolderName(file.employee);
        const safeFileName = sanitizeFileName(file.fileName || "consent");
        let archivePath = `${employeeFolder}/${safeFileName}`;
        let duplicateIndex = 1;

        while (usedArchivePaths.has(archivePath)) {
          const dotIndex = safeFileName.lastIndexOf(".");
          const baseName =
            dotIndex >= 0 ? safeFileName.slice(0, dotIndex) : safeFileName;
          const extension = dotIndex >= 0 ? safeFileName.slice(dotIndex) : "";
          archivePath = `${employeeFolder}/${baseName}_${duplicateIndex}${extension}`;
          duplicateIndex += 1;
        }

        usedArchivePaths.add(archivePath);

        // Получаем подписанный URL для файла
        const downloadData = await storageProvider.getDownloadUrl(
          file.filePath,
          {
            expiresIn: 3600,
            fileName: file.fileName,
          },
        );

        // Загружаем файл по URL и добавляем в архив
        const fileResponse = await axios.get(downloadData.url, {
          responseType: "stream",
          timeout: 30000,
        });

        archive.append(fileResponse.data, { name: archivePath });
      } catch (error) {
        console.error(`Error downloading file ${file.fileKey}:`, error.message);
        // Продолжаем со следующего файла, не прерываем весь процесс
      }
    }

    // Завершаем архив
    await archive.finalize();
  } catch (error) {
    console.error("Error downloading biometric consents:", error);
    if (error.statusCode && !res.headersSent) {
      return next(error);
    }

    // Проверяем, был ли уже отправлен заголовок ответа
    if (!res.headersSent) {
      next(error);
    }
  }
};
