import { Op } from "sequelize";
import {
  Status,
  EmployeeStatusMapping,
  Employee,
  Setting,
  UserEmployeeMapping,
  EmployeeCounterpartyMapping,
  CounterpartySubcounterpartyMapping,
} from "../models/index.js";
import {
  AUDIT_EVENT_TYPES,
  getEmployeeCounterpartyAuditDetails,
  logAuditEvent,
} from "./auditEventService.js";

const EMPLOYEE_SAFE_ATTRIBUTES = [
  "id",
  "firstName",
  "lastName",
  "middleName",
  "positionId",
  "isActive",
  "createdAt",
  "updatedAt",
];

const touchEmployeeRecord = async (employeeId, userId, transaction = null) => {
  if (!employeeId || !userId) {
    return;
  }

  await Employee.update(
    {
      updatedBy: userId,
      updatedAt: new Date(),
    },
    {
      where: { id: employeeId },
      ...(transaction ? { transaction } : {}),
    },
  );
};

/**
 * Сервис для управления статусами сотрудников
 */
class EmployeeStatusService {
  /**
   * Получить все статусы по группам
   */
  static async getAllStatuses() {
    return await Status.findAll({
      order: [
        ["group", "ASC"],
        ["name", "ASC"],
      ],
    });
  }

  /**
   * Получить статусы по группе
   */
  static async getStatusesByGroup(group) {
    return await Status.findAll({
      where: { group },
      order: [["name", "ASC"]],
    });
  }

  /**
   * Получить текущий статус сотрудника по группе
   */
  static async getCurrentStatus(employeeId, statusGroup, options = {}) {
    const { transaction = null } = options;
    const mapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId: employeeId,
        statusGroup: statusGroup,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      ...(transaction ? { transaction } : {}),
    });

    return mapping;
  }

  /**
   * Получить все текущие статусы сотрудника (по всем группам)
   */
  static async getAllCurrentStatuses(employeeId, options = {}) {
    const { transaction = null } = options;
    return await EmployeeStatusMapping.findAll({
      where: {
        employeeId: employeeId,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      order: [["statusGroup", "ASC"]],
      ...(transaction ? { transaction } : {}),
    });
  }

  /**
   * Получить статусы для нескольких сотрудников одним запросом (batch)
   * @param {Array<string>} employeeIds - массив ID сотрудников
   * @returns {Object} объект где ключ = employeeId, значение = массив статусов
   */
  static async getStatusesBatch(employeeIds) {
    const mappings = await EmployeeStatusMapping.findAll({
      where: {
        employeeId: employeeIds,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      order: [
        ["employeeId", "ASC"],
        ["statusGroup", "ASC"],
      ],
    });

    // Группируем по employeeId
    const result = {};
    mappings.forEach((mapping) => {
      const empId = mapping.employeeId;
      if (!result[empId]) {
        result[empId] = [];
      }
      result[empId].push(mapping);
    });

    return result;
  }

  /**
   * Установить новый статус для сотрудника
   * Автоматически деактивирует старый статус из той же группы
   */
  static async setStatus(employeeId, statusId, userId, options = {}) {
    const { transaction = null, auditContext = null } = options;
    // Получить статус чтобы узнать группу
    const newStatus = await Status.findByPk(statusId, {
      ...(transaction ? { transaction } : {}),
    });
    if (!newStatus) {
      throw new Error("Статус не найден");
    }

    // Проверить что сотрудник существует
    const employee = await Employee.findByPk(employeeId, {
      ...(transaction ? { transaction } : {}),
    });
    if (!employee) {
      throw new Error("Сотрудник не найден");
    }

    const previousMapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId,
        statusGroup: newStatus.group,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      ...(transaction ? { transaction } : {}),
    });

    // Деактивировать все статусы этой группы для этого сотрудника
    await EmployeeStatusMapping.update(
      { isActive: false },
      {
        where: {
          employeeId: employeeId,
          statusGroup: newStatus.group,
          isActive: true,
        },
        ...(transaction ? { transaction } : {}),
      },
    );

    // Проверить есть ли уже связь с этим статусом
    let mapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId: employeeId,
        statusId: statusId,
      },
      ...(transaction ? { transaction } : {}),
    });

    if (mapping) {
      // Обновить существующую связь
      mapping.isActive = true;
      mapping.updatedBy = userId;
      await mapping.save(transaction ? { transaction } : undefined);
    } else {
      // Создать новую связь
      mapping = await EmployeeStatusMapping.create(
        {
          employeeId: employeeId,
          statusId: statusId,
          statusGroup: newStatus.group,
          createdBy: userId,
          updatedBy: userId,
          isActive: true,
        },
        transaction ? { transaction } : undefined,
      );
    }

    await touchEmployeeRecord(employeeId, userId, transaction);

    const previousStatusName = previousMapping?.status?.name || null;
    if (
      auditContext &&
      previousStatusName !== newStatus.name
    ) {
      const counterpartyDetails = await getEmployeeCounterpartyAuditDetails(
        employeeId,
        { transaction },
      );
      await logAuditEvent({
        userId,
        eventType: AUDIT_EVENT_TYPES.STATUS_CHANGED,
        entityType: "employee",
        entityId: employeeId,
        details: {
          ...counterpartyDetails,
          statusGroup: newStatus.group,
          from: previousStatusName,
          to: newStatus.name,
          reason: auditContext.reason || null,
          metadata: auditContext.metadata || null,
        },
        req: auditContext.req || null,
        transaction,
      });
    }

    return mapping;
  }

  /**
   * Получить статус сотрудника с полной информацией
   */
  static async getEmployeeWithStatuses(employeeId) {
    const employee = await Employee.findByPk(employeeId, {
      attributes: EMPLOYEE_SAFE_ATTRIBUTES,
      include: [
        {
          model: EmployeeStatusMapping,
          as: "statusMappings",
          where: { isActive: true },
          attributes: [
            "id",
            "employeeId",
            "statusId",
            "statusGroup",
            "isActive",
            "isUpload",
            "createdAt",
            "updatedAt",
          ],
          include: [
            {
              model: Status,
              as: "status",
              attributes: ["id", "name", "group"],
            },
          ],
        },
      ],
    });

    if (!employee) {
      throw new Error("Сотрудник не найден");
    }

    return employee;
  }

  /**
   * Получить список сотрудников с их текущими статусами
   */
  static async getEmployeesWithStatuses(options = {}) {
    const { user, limit = 50, offset = 0, where = {} } = options;
    const allowedRoles = new Set(["admin", "manager", "user"]);

    if (!user || !allowedRoles.has(user.role)) {
      return { count: 0, rows: [] };
    }

    const include = [
      {
        model: EmployeeStatusMapping,
        as: "statusMappings",
        where: { isActive: true },
        required: false,
        attributes: [
          "id",
          "employeeId",
          "statusId",
          "statusGroup",
          "isActive",
          "isUpload",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: Status,
            as: "status",
            attributes: ["id", "name", "group"],
          },
        ],
      },
    ];

    if (user.role !== "admin") {
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );

      if (user.counterpartyId === defaultCounterpartyId) {
        if (user.role === "manager") {
          include.push({
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            where: {
              counterpartyId: defaultCounterpartyId,
            },
            required: true,
            attributes: [],
          });
        } else {
          include.push({
            model: UserEmployeeMapping,
            as: "userEmployeeMappings",
            where: {
              userId: user.id,
              counterpartyId: null,
            },
            required: true,
            attributes: [],
          });
        }
      } else {
        const subcontractors = await CounterpartySubcounterpartyMapping.findAll(
          {
            where: { parentCounterpartyId: user.counterpartyId },
            attributes: ["childCounterpartyId"],
          },
        );

        const allowedCounterpartyIds = [
          user.counterpartyId,
          ...subcontractors.map((item) => item.childCounterpartyId),
        ];

        include.push({
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          where: {
            counterpartyId: { [Op.in]: allowedCounterpartyIds },
          },
          required: true,
          attributes: [],
        });
      }
    }

    return await Employee.findAndCountAll({
      where,
      attributes: [
        "id",
        "firstName",
        "lastName",
        "lastNameEnc",
        "lastNameKeyVersion",
        "middleName",
        "positionId",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
      include,
      limit,
      offset,
      distinct: true,
      order: [
        ["firstName", "ASC"],
        ["middleName", "ASC"],
      ],
    });
  }

  /**
   * Изменить статус по названию (упрощённый метод)
   */
  static async setStatusByName(employeeId, statusName, userId, options = {}) {
    const status = await Status.findOne({
      where: { name: statusName },
      ...(options.transaction ? { transaction: options.transaction } : {}),
    });

    if (!status) {
      throw new Error(`Статус ${statusName} не найден`);
    }

    return await this.setStatus(employeeId, status.id, userId, options);
  }

  /**
   * Активировать или создать статус для группы (без деактивации других статусов этой группы)
   * Используется для специальных переходов типа status_hr_fired_off
   */
  static async activateOrCreateStatus(
    employeeId,
    statusName,
    userId,
    setUploadFlag = false,
    options = {},
  ) {
    const { transaction = null, auditContext = null } = options;
    // Получить статус по названию
    const status = await Status.findOne({
      where: { name: statusName },
      ...(transaction ? { transaction } : {}),
    });

    if (!status) {
      throw new Error(`Статус ${statusName} не найден`);
    }

    console.log(
      `[activateOrCreateStatus] Processing ${statusName} for employee ${employeeId}, setUploadFlag=${setUploadFlag}`,
    );

    const previousActiveMapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId,
        statusGroup: status.group,
        isActive: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      ...(transaction ? { transaction } : {}),
    });

    // Проверить есть ли уже связь с этим статусом
    let mapping = await EmployeeStatusMapping.findOne({
      where: {
        employeeId: employeeId,
        statusId: status.id,
        statusGroup: status.group,
      },
      ...(transaction ? { transaction } : {}),
    });
    const wasActive = mapping?.isActive === true;
    const previousUploadFlag = mapping?.isUpload;

    if (mapping) {
      // Обновить существующую связь
      console.log(
        `[activateOrCreateStatus] Updating existing mapping: is_active ${mapping.isActive} → true, is_upload ${mapping.isUpload} → ${setUploadFlag}`,
      );
      mapping.isActive = true;
      mapping.isUpload = setUploadFlag;
      mapping.updatedBy = userId;
      await mapping.save(transaction ? { transaction } : undefined);
    } else {
      // Создать новую связь
      console.log(
        `[activateOrCreateStatus] Creating new mapping with is_active=true, is_upload=${setUploadFlag}`,
      );
      mapping = await EmployeeStatusMapping.create(
        {
          employeeId: employeeId,
          statusId: status.id,
          statusGroup: status.group,
          isActive: true,
          isUpload: setUploadFlag,
          createdBy: userId,
          updatedBy: userId,
        },
        transaction ? { transaction } : undefined,
      );
    }

    await touchEmployeeRecord(employeeId, userId, transaction);

    const previousActiveStatusName = previousActiveMapping?.status?.name || null;
    if (
      auditContext &&
      (
        previousActiveStatusName !== status.name ||
        !wasActive ||
        previousUploadFlag !== setUploadFlag
      )
    ) {
      const counterpartyDetails = await getEmployeeCounterpartyAuditDetails(
        employeeId,
        { transaction },
      );
      await logAuditEvent({
        userId,
        eventType: AUDIT_EVENT_TYPES.STATUS_CHANGED,
        entityType: "employee",
        entityId: employeeId,
        details: {
          ...counterpartyDetails,
          statusGroup: status.group,
          from: previousActiveStatusName,
          to: status.name,
          isUpload: setUploadFlag,
          reason: auditContext.reason || null,
          metadata: auditContext.metadata || null,
        },
        req: auditContext.req || null,
        transaction,
      });
    }

    console.log(
      `[activateOrCreateStatus] Mapping after save: is_active=${mapping.isActive}, is_upload=${mapping.isUpload}`,
    );
    return mapping;
  }

  /**
   * Сбросить флаг выгрузки в ЗУП для всех активных статусов сотрудника.
   */
  static async resetActiveUploadFlags(employeeId, userId, options = {}) {
    const { transaction = null, auditContext = null } = options;
    const mappingsToReset = await EmployeeStatusMapping.findAll({
      where: {
        employeeId,
        isActive: true,
        isUpload: true,
      },
      include: [
        {
          model: Status,
          as: "status",
        },
      ],
      ...(transaction ? { transaction } : {}),
    });

    if (mappingsToReset.length === 0) {
      return 0;
    }

    const [updatedCount] = await EmployeeStatusMapping.update(
      {
        isUpload: false,
        ...(userId
          ? {
              updatedBy: userId,
              updatedAt: new Date(),
            }
          : {}),
      },
      {
        where: {
          employeeId,
          isActive: true,
          isUpload: true,
        },
        ...(transaction ? { transaction } : {}),
      },
    );

    await touchEmployeeRecord(employeeId, userId, transaction);

    if (auditContext) {
      const counterpartyDetails = await getEmployeeCounterpartyAuditDetails(
        employeeId,
        { transaction },
      );
      await logAuditEvent({
        userId,
        eventType: AUDIT_EVENT_TYPES.ZUP_FLAG_CHANGED,
        entityType: "employee",
        entityId: employeeId,
        details: {
          ...counterpartyDetails,
          from: true,
          to: false,
          scope: "active_statuses",
          changedMappings: mappingsToReset.map((mapping) => ({
            id: mapping.id,
            statusGroup: mapping.statusGroup,
            statusName: mapping.status?.name || null,
          })),
          reason: auditContext.reason || null,
          metadata: auditContext.metadata || null,
        },
        req: auditContext.req || null,
        transaction,
      });
    }

    return updatedCount;
  }

  /**
   * Инициализировать статусы для нового сотрудника
   */
  static async initializeEmployeeStatuses(employeeId, userId, options = {}) {
    const { transaction = null } = options;
    console.log("=== INITIALIZING EMPLOYEE STATUSES ===");
    console.log("Employee ID:", employeeId);
    console.log("User ID:", userId);

    // Создать начальные статусы для всех групп
    const statusNames = {
      status: "status_draft",
      status_card: "status_card_draft",
      status_active: "status_active_employed",
      status_secure: "status_secure_allow",
    };
    const statusPairs = Object.entries(statusNames);
    const statusNameSet = [
      ...new Set(statusPairs.map(([, statusName]) => statusName)),
    ];
    const statuses = await Status.findAll({
      where: {
        name: {
          [Op.in]: statusNameSet,
        },
      },
      ...(transaction ? { transaction } : {}),
    });

    const statusByGroupAndName = new Map(
      statuses.map((status) => [`${status.group}:${status.name}`, status]),
    );

    const rowsToCreate = statusPairs.map(([group, statusName]) => {
      console.log(`Looking for status: ${statusName} in group: ${group}`);
      const status = statusByGroupAndName.get(`${group}:${statusName}`);

      if (!status) {
        console.error(`Status ${statusName} NOT FOUND!`);
        throw new Error(`Статус ${statusName} не найден`);
      }

      console.log(`Found status: ${status.id}, creating mapping...`);
      return {
        employeeId: employeeId,
        statusId: status.id,
        statusGroup: group,
        createdBy: userId,
        updatedBy: userId,
        isActive: true,
      };
    });

    const mappings = await EmployeeStatusMapping.bulkCreate(
      rowsToCreate,
      transaction ? { transaction } : undefined,
    );
    mappings.forEach((mapping) => {
      console.log(`✓ Created mapping for ${mapping.statusGroup}:`, mapping.id);
    });

    console.log("=== EMPLOYEE STATUSES INITIALIZED ===");
    return mappings;
  }
}

export default EmployeeStatusService;
