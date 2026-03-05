import EmployeeStatusService from "../services/employeeStatusService.js";
import { getAccessibleEmployeeIds } from "../utils/permissionUtils.js";
import { AppError } from "../middleware/errorHandler.js";
import { Status } from "../models/index.js";
import { handleSkudStatusTrigger } from "../services/skud/SkudSyncService.js";
import { isSkudEnabled } from "../services/skud/skudConfig.js";

/**
 * Контроллер для управления статусами сотрудников
 */
export const employeeStatusController = {
  /**
   * Получить все статусы
   */
  async getAllStatuses(req, res, next) {
    try {
      const statuses = await EmployeeStatusService.getAllStatuses();
      res.json(statuses);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить статусы по группе
   */
  async getStatusesByGroup(req, res, next) {
    try {
      const { group } = req.params;
      const statuses = await EmployeeStatusService.getStatusesByGroup(group);
      res.json(statuses);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить текущий статус сотрудника по группе
   */
  async getEmployeeCurrentStatus(req, res, next) {
    try {
      const { employeeId, group } = req.params;
      const { deniedIds } = await getAccessibleEmployeeIds(
        req.user,
        [employeeId],
        "read",
      );

      if (deniedIds.length > 0) {
        return next(new AppError("Недостаточно прав", 403));
      }

      const status = await EmployeeStatusService.getCurrentStatus(
        employeeId,
        group,
      );

      if (!status) {
        return res.status(404).json({ error: "Статус не найден" });
      }

      res.json(status);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить все текущие статусы сотрудника
   */
  async getEmployeeAllStatuses(req, res, next) {
    try {
      const { employeeId } = req.params;
      const { deniedIds } = await getAccessibleEmployeeIds(
        req.user,
        [employeeId],
        "read",
      );

      if (deniedIds.length > 0) {
        return next(new AppError("Недостаточно прав", 403));
      }

      const statuses =
        await EmployeeStatusService.getAllCurrentStatuses(employeeId);
      res.json(statuses);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Установить новый статус для сотрудника
   */
  async setEmployeeStatus(req, res, next) {
    try {
      const { employeeId } = req.params;
      const { statusId } = req.body;
      const userId = req.user.id;

      if (!statusId) {
        return res.status(400).json({ error: "statusId обязателен" });
      }

      const { deniedIds } = await getAccessibleEmployeeIds(
        req.user,
        [employeeId],
        "write",
      );
      if (deniedIds.length > 0) {
        return next(new AppError("Недостаточно прав", 403));
      }

      const mapping = await EmployeeStatusService.setStatus(
        employeeId,
        statusId,
        userId,
      );

      if (isSkudEnabled()) {
        const status = await Status.findByPk(statusId, {
          attributes: ["id", "name", "group"],
        });
        if (status?.group === "status_secure") {
          await handleSkudStatusTrigger({
            employeeId,
            statusName: status.name,
            userId,
            source: "set_employee_status",
          });
        }
      }

      res.json(mapping);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить сотрудника со всеми его текущими статусами
   */
  async getEmployeeWithStatuses(req, res, next) {
    try {
      const { employeeId } = req.params;
      const { deniedIds } = await getAccessibleEmployeeIds(
        req.user,
        [employeeId],
        "read",
      );

      if (deniedIds.length > 0) {
        return next(new AppError("Недостаточно прав", 403));
      }

      const employee =
        await EmployeeStatusService.getEmployeeWithStatuses(employeeId);
      res.json(employee);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить список сотрудников со статусами
   */
  async getEmployeesWithStatuses(req, res, next) {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

      const result = await EmployeeStatusService.getEmployeesWithStatuses({
        user: req.user,
        limit: parsedLimit,
        offset: parsedOffset,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Получить статусы для нескольких сотрудников одним запросом (batch)
   */
  async getStatusesBatch(req, res, next) {
    try {
      const { employeeIds } = req.body;

      if (!employeeIds || !Array.isArray(employeeIds)) {
        return res
          .status(400)
          .json({ error: "employeeIds должен быть массивом" });
      }

      if (employeeIds.length === 0) {
        return res.json({});
      }

      if (employeeIds.length > 1000) {
        return res
          .status(400)
          .json({ error: "Максимум 1000 сотрудников за один запрос" });
      }

      const { deniedIds } = await getAccessibleEmployeeIds(
        req.user,
        employeeIds,
        "read",
      );
      if (deniedIds.length > 0) {
        return next(new AppError("Недостаточно прав", 403));
      }

      const statuses =
        await EmployeeStatusService.getStatusesBatch(employeeIds);
      res.json(statuses);
    } catch (error) {
      next(error);
    }
  },
};
