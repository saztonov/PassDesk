import sequelize from "../config/database.js";
import {
  Counterparty,
  Employee,
  EmployeeCounterpartyMapping,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import EmployeeStatusService from "./employeeStatusService.js";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
} from "./auditEventService.js";

const toCounterpartySummary = (counterparty) =>
  counterparty
    ? {
        id: counterparty.id,
        name: counterparty.name,
        inn: counterparty.inn || null,
      }
    : null;

export const transferEmployeeBetweenCounterparties = async ({
  employeeId,
  targetCounterpartyId,
  userId,
  req = null,
  transaction: externalTransaction = null,
  source = "employee_transfer",
}) => {
  const executeTransfer = async (transaction) => {
    const employee = await Employee.findByPk(employeeId, { transaction });
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    const targetCounterparty = await Counterparty.findByPk(targetCounterpartyId, {
      transaction,
    });
    if (!targetCounterparty) {
      throw new AppError("Контрагент не найден", 404);
    }

    const activeMappings = await EmployeeCounterpartyMapping.findAll({
      where: {
        employeeId,
        dismissedAt: null,
      },
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "inn"],
        },
      ],
      order: [
        ["updatedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
      transaction,
    });

    const targetActiveMapping = activeMappings.find(
      (mapping) => String(mapping.counterpartyId) === String(targetCounterpartyId),
    );
    if (targetActiveMapping) {
      throw new AppError("Сотрудник уже привязан к этому контрагенту", 400);
    }

    const fromCounterparties = activeMappings
      .map((mapping) => toCounterpartySummary(mapping.counterparty))
      .filter(Boolean);

    const now = new Date();

    if (activeMappings.length > 0) {
      await EmployeeCounterpartyMapping.update(
        { dismissedAt: now },
        {
          where: {
            employeeId,
            dismissedAt: null,
          },
          transaction,
        },
      );
    }

    let targetMapping = await EmployeeCounterpartyMapping.findOne({
      where: {
        employeeId,
        counterpartyId: targetCounterpartyId,
        constructionSiteId: null,
      },
      order: [
        ["updatedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
      transaction,
    });

    if (targetMapping) {
      await targetMapping.update(
        {
          dismissedAt: null,
          departmentId: null,
          constructionSiteId: null,
        },
        { transaction },
      );
    } else {
      targetMapping = await EmployeeCounterpartyMapping.create(
        {
          employeeId,
          counterpartyId: targetCounterpartyId,
          departmentId: null,
          constructionSiteId: null,
          dismissedAt: null,
        },
        { transaction },
      );
    }

    await employee.update(
      {
        updatedBy: userId,
        updatedAt: now,
      },
      { transaction },
    );

    await EmployeeStatusService.setStatusByName(
      employeeId,
      "status_active_employed",
      userId,
      {
        transaction,
        auditContext: {
          req,
          reason: "employee_transferred",
          metadata: {
            source,
            targetCounterparty: toCounterpartySummary(targetCounterparty),
          },
        },
      },
    );

    await EmployeeStatusService.resetActiveUploadFlags(employeeId, userId, {
      transaction,
      auditContext: {
        req,
        reason: "employee_transferred",
        metadata: {
          source,
          targetCounterparty: toCounterpartySummary(targetCounterparty),
        },
      },
    });

    await logAuditEvent({
      userId,
      eventType: AUDIT_EVENT_TYPES.EMPLOYEE_TRANSFERRED,
      entityType: "employee",
      entityId: employeeId,
      details: {
        counterpartyId: targetCounterparty.id,
        counterpartyName: targetCounterparty.name,
        source,
        fromCounterparties,
        toCounterparty: toCounterpartySummary(targetCounterparty),
      },
      req,
      transaction,
    });

    return {
      employee,
      mapping: targetMapping,
      counterparty: targetCounterparty,
      fromCounterparties,
    };
  };

  if (externalTransaction) {
    return executeTransfer(externalTransaction);
  }

  return sequelize.transaction(executeTransfer);
};
