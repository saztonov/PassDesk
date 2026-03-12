import express from "express";
import { body, param, query } from "express-validator";
import rateLimit from "express-rate-limit";
import { skudController } from "../controllers/skud.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validator.js";

const router = express.Router();

const webhookRouter = express.Router();

const paginationValidation = [
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  query("eventType").optional().isString().trim().notEmpty(),
  query("allow").optional().isBoolean(),
  query("departmentId").optional().isString().trim().notEmpty(),
  query("passageOnly").optional().isBoolean(),
  validate,
];

const employeeIdParamValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  validate,
];

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many SKUD webhook requests",
  },
});

router.use(authenticate);

router.get("/health", authorize("admin", "manager"), skudController.health);
router.get("/stats", authorize("admin", "manager"), skudController.stats);
router.get(
  "/local/employees",
  authorize("admin", "manager"),
  paginationValidation,
  skudController.localEmployees,
);
router.get(
  "/provider/employees",
  authorize("admin", "manager"),
  paginationValidation,
  skudController.providerEmployees,
);
router.get(
  "/provider/departments",
  authorize("admin", "manager"),
  skudController.providerDepartments,
);
router.post(
  "/provider/departments",
  authorize("admin", "manager"),
  body("name").isString().trim().notEmpty(),
  body("parentId").optional({ nullable: true }).isString().trim(),
  body("description").optional().isString(),
  validate,
  skudController.createProviderDepartment,
);
router.put(
  "/provider/departments/:departmentId",
  authorize("admin", "manager"),
  param("departmentId").isString().trim().notEmpty(),
  body("name").optional().isString().trim().notEmpty(),
  body("parentId").optional({ nullable: true }).isString().trim(),
  body("description").optional().isString(),
  validate,
  skudController.updateProviderDepartment,
);
router.delete(
  "/provider/departments/:departmentId",
  authorize("admin", "manager"),
  param("departmentId").isString().trim().notEmpty(),
  validate,
  skudController.deleteProviderDepartment,
);
router.get(
  "/provider/employees/:externalEmpId",
  authorize("admin", "manager"),
  param("externalEmpId").isString().trim().notEmpty(),
  validate,
  skudController.providerEmployee,
);
router.get(
  "/events",
  authorize("admin", "manager"),
  paginationValidation,
  skudController.events,
);
router.post(
  "/events/pull",
  authorize("admin", "manager"),
  body("limit").optional().isInt({ min: 1, max: 500 }),
  body("offset").optional().isInt({ min: 0 }),
  body("from").optional().isISO8601(),
  body("to").optional().isISO8601(),
  validate,
  skudController.pullEvents,
);
router.get(
  "/sync-jobs",
  authorize("admin", "manager"),
  paginationValidation,
  skudController.syncJobs,
);
router.post(
  "/bindings/import/preview",
  authorize("admin", "manager"),
  body("rows").isArray({ min: 1, max: 5000 }),
  validate,
  skudController.previewBindingImport,
);
router.post(
  "/bindings/import/execute",
  authorize("admin", "manager"),
  body("rows").isArray({ min: 1, max: 5000 }),
  validate,
  skudController.executeBindingImport,
);
router.post(
  "/bindings/employee/:employeeId",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  body("externalEmpId").isString().trim().notEmpty(),
  validate,
  skudController.upsertBinding,
);
router.get(
  "/bindings/employee/:employeeId",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  skudController.getEmployeeBinding,
);
router.post(
  "/sync/employee/:employeeId",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  skudController.syncEmployee,
);
router.post(
  "/sync/employee/:employeeId/block",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  body("priority").optional().isIn(["normal", "high"]),
  validate,
  skudController.blockEmployee,
);
router.post(
  "/sync/employee/:employeeId/unblock",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  body("priority").optional().isIn(["normal", "high"]),
  validate,
  skudController.unblockEmployee,
);
router.post(
  "/sync/employee/:employeeId/blacklist",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  validate,
  skudController.blacklistEmployee,
);
router.post(
  "/sync/employee/:employeeId/blacklist/clear",
  authorize("admin", "manager"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  validate,
  skudController.clearBlacklistEmployee,
);

router.get(
  "/cards",
  authorize("admin", "manager"),
  paginationValidation,
  skudController.listCards,
);
router.post(
  "/cards/assign",
  authorize("admin", "manager"),
  body("employeeId").isUUID(),
  body("cardNumber").isString().trim().notEmpty(),
  body("cardType").optional().isString().trim(),
  body("notes").optional().isString(),
  validate,
  skudController.assignCard,
);
router.post(
  "/cards/block",
  authorize("admin", "manager"),
  body("cardId").isUUID(),
  validate,
  skudController.blockCard,
);
router.post(
  "/cards/unbind",
  authorize("admin", "manager"),
  body("cardId").isUUID(),
  validate,
  skudController.unbindCard,
);

router.post(
  "/qr/issue",
  authorize("admin", "manager", "user"),
  body("employeeId").isUUID(),
  body("tokenType").optional().isIn(["persistent", "one_time"]),
  body("channel").optional().isIn(["web", "mobile", "telegram"]),
  validate,
  skudController.issueQr,
);
router.post(
  "/qr/verify",
  body("token").isString().trim().notEmpty(),
  body("markUsed").optional().isBoolean(),
  validate,
  skudController.verifyQr,
);

router.post(
  "/events/ingest",
  authorize("admin"),
  body().isObject(),
  validate,
  skudController.ingestEventDirect,
);

webhookRouter.use(webhookLimiter);
webhookRouter.post("/webdel/decision", skudController.webdelDecision);
webhookRouter.post("/webdel/events", skudController.webdelEvents);

export { webhookRouter };
export default router;
