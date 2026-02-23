import express from "express";
import { param, query, body } from "express-validator";
import { employeeStatusController } from "../controllers/employeeStatus.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validator.js";

const router = express.Router();

const employeeIdParamValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  validate,
];

const employeeIdAndGroupParamsValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  param("group").isString().trim().notEmpty(),
  validate,
];

const statusesBatchValidation = [
  body("employeeIds")
    .isArray({ min: 1 })
    .withMessage("employeeIds должен быть массивом"),
  body("employeeIds.*")
    .isUUID()
    .withMessage("Все employeeIds должны быть UUID"),
  validate,
];

const listEmployeesWithStatusesValidation = [
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
  validate,
];

// Все статусы (публичное)
router.get(
  "/employees/statuses/all",
  authenticate,
  employeeStatusController.getAllStatuses,
);

// Статусы по группе (публичное)
router.get(
  "/employees/statuses/group/:group",
  authenticate,
  employeeStatusController.getStatusesByGroup,
);

// Текущий статус сотрудника по группе
router.get(
  "/employees/:employeeId/status/group/:group",
  authenticate,
  employeeIdAndGroupParamsValidation,
  employeeStatusController.getEmployeeCurrentStatus,
);

// Все текущие статусы сотрудника
router.get(
  "/employees/:employeeId/statuses",
  authenticate,
  employeeIdParamValidation,
  employeeStatusController.getEmployeeAllStatuses,
);

// Batch: получить статусы для нескольких сотрудников одним запросом
router.post(
  "/employees/statuses/batch",
  authenticate,
  statusesBatchValidation,
  employeeStatusController.getStatusesBatch,
);

// Сотрудник со статусами (с деталями)
router.get(
  "/employees/:employeeId/with-statuses",
  authenticate,
  employeeIdParamValidation,
  employeeStatusController.getEmployeeWithStatuses,
);

// Список сотрудников со статусами
router.get(
  "/employees/with-statuses",
  authenticate,
  authorize("admin", "manager", "user"),
  listEmployeesWithStatusesValidation,
  employeeStatusController.getEmployeesWithStatuses,
);

// Установить новый статус (требует прав admin)
router.post(
  "/employees/:employeeId/status",
  authenticate,
  authorize("admin"),
  employeeIdParamValidation,
  body("statusId").isUUID().withMessage("statusId должен быть UUID"),
  validate,
  employeeStatusController.setEmployeeStatus,
);

export default router;
