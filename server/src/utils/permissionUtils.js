import { Op } from "sequelize";
import {
  EmployeeCounterpartyMapping,
  Setting,
  UserEmployeeMapping,
  CounterpartySubcounterpartyMapping,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Проверяет права доступа пользователя к сотруднику.
 * Выбрасывает AppError(403) если доступ запрещен.
 *
 * @param {Object} user - объект пользователя (req.user)
 * @param {Object} employee - объект сотрудника (должен содержать employeeCounterpartyMappings или мы их догрузим)
 * @param {string} operation - тип операции: 'read' или 'write' (по умолчанию 'write')
 * @returns {Promise<boolean>} - true если доступ разрешен
 */
export const checkEmployeeAccess = async (
  user,
  employee,
  operation = "write",
) => {
  // Админ имеет доступ ко всему
  if (user.role === "admin") return true;

  const defaultCounterpartyId = await Setting.getSetting(
    "default_counterparty_id",
  );
  const normalizedOperation = String(operation || "write").toLowerCase();
  const isWriteOperation = normalizedOperation !== "read";
  const isManager = user.role === "manager";
  const isTransferOperation = normalizedOperation === "transfer";

  // Для manager оставляем прежнее поведение на чтение,
  // а операции записи ограничиваем рамками его контрагента/субподрядчиков.
  // Перевод сотрудника выделен отдельно: manager может инициировать его.
  if (isManager && (!isWriteOperation || isTransferOperation)) {
    return true;
  }

  if (user.counterpartyId === defaultCounterpartyId) {
    // Пользователи дефолтного контрагента (бюро пропусков)
    // Для обычных пользователей чтение/запись только по персональной привязке.
    const userEmployeeLink = await UserEmployeeMapping.findOne({
      where: {
        userId: user.id,
        employeeId: employee.id,
        counterpartyId: null, // Для default контрагента counterpartyId = NULL
      },
    });

    if (!userEmployeeLink) {
      throw new AppError(
        "Недостаточно прав. Вы можете управлять только привязанными к вам сотрудниками.",
        403,
      );
    }
  } else {
    // Пользователи конкретных контрагентов (подрядчики)
    // могут управлять всеми сотрудниками своей организации И сотрудниками своих субподрядчиков

    let hasAccess = false;

    // Проверяем доступ к сотрудникам своего контрагента
    if (employee.employeeCounterpartyMappings) {
      hasAccess = employee.employeeCounterpartyMappings.some(
        (mapping) => mapping.counterpartyId === user.counterpartyId,
      );
    } else {
      // Если маппинги не загружены, проверяем через БД
      const mapping = await EmployeeCounterpartyMapping.findOne({
        where: {
          employeeId: employee.id,
          counterpartyId: user.counterpartyId,
        },
      });
      hasAccess = !!mapping;
    }

    // Если нет прямого доступа, проверяем, не является ли контрагент сотрудника субподрядчиком
    if (!hasAccess) {
      // Получаем список субподрядчиков текущего контрагента
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const subcontractorIds = subcontractors.map((s) => s.childCounterpartyId);

      if (subcontractorIds.length > 0) {
        // Проверяем, принадлежит ли сотрудник одному из субподрядчиков
        if (employee.employeeCounterpartyMappings) {
          hasAccess = employee.employeeCounterpartyMappings.some((mapping) =>
            subcontractorIds.includes(mapping.counterpartyId),
          );
        } else {
          const mapping = await EmployeeCounterpartyMapping.findOne({
            where: {
              employeeId: employee.id,
              counterpartyId: subcontractorIds,
            },
          });
          hasAccess = !!mapping;
        }
      }
    }

    if (!hasAccess) {
      throw new AppError(
        "Недостаточно прав. Сотрудник не принадлежит вашей организации или вашим субподрядчикам.",
        403,
      );
    }
  }

  return true;
};

export const getAccessibleEmployeeIds = async (
  user,
  employeeIds,
  operation = "write",
  transaction = null,
) => {
  const uniqueIds = [...new Set((employeeIds || []).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { allowedIds: [], deniedIds: [] };
  }

  if (user.role === "admin") {
    return { allowedIds: uniqueIds, deniedIds: [] };
  }
  if (user.role === "manager") {
    return { allowedIds: uniqueIds, deniedIds: [] };
  }

  const defaultCounterpartyId = await Setting.getSetting(
    "default_counterparty_id",
  );
  let allowedIds = [];

  if (user.counterpartyId === defaultCounterpartyId) {
    const mappings = await UserEmployeeMapping.findAll({
      where: {
        userId: user.id,
        employeeId: { [Op.in]: uniqueIds },
        counterpartyId: null,
      },
      attributes: ["employeeId"],
      transaction,
    });
    allowedIds = mappings.map((m) => m.employeeId);
  } else {
    const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
      where: { parentCounterpartyId: user.counterpartyId },
      attributes: ["childCounterpartyId"],
      transaction,
    });

    const allowedCounterpartyIds = [
      user.counterpartyId,
      ...subcontractors.map((s) => s.childCounterpartyId),
    ];

    const mappings = await EmployeeCounterpartyMapping.findAll({
      where: {
        employeeId: { [Op.in]: uniqueIds },
        counterpartyId: { [Op.in]: allowedCounterpartyIds },
      },
      attributes: ["employeeId"],
      transaction,
    });
    allowedIds = mappings.map((m) => m.employeeId);
  }

  const allowedSet = new Set(allowedIds.map((id) => String(id)));
  const deniedIds = uniqueIds.filter((id) => !allowedSet.has(String(id)));

  return {
    allowedIds: uniqueIds.filter((id) => allowedSet.has(String(id))),
    deniedIds,
  };
};
