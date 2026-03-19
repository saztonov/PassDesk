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
  query("direction").optional().isInt({ min: 1, max: 2 }),
  query("allow").optional().isBoolean(),
  query("departmentId").optional().isString().trim().notEmpty(),
  query("passageOnly").optional().isBoolean(),
  query("sortBy").optional().isIn(["eventTime"]),
  query("sortOrder").optional().isIn(["asc", "desc"]),
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

router.get("/health", authorize("admin"), skudController.health);
router.get("/stats", authorize("admin"), skudController.stats);
router.get(
  "/local/employees",
  authorize("admin"),
  paginationValidation,
  skudController.localEmployees,
);
router.get(
  "/provider/employees",
  authorize("admin"),
  paginationValidation,
  skudController.providerEmployees,
);
router.get(
  "/provider/departments",
  authorize("admin"),
  skudController.providerDepartments,
);
router.get(
  "/provider/access-points",
  authorize("admin"),
  skudController.providerAccessPoints,
);
router.post(
  "/provider/departments",
  authorize("admin"),
  body("name").isString().trim().notEmpty(),
  body("parentId").optional({ nullable: true }).isString().trim(),
  body("description").optional().isString(),
  validate,
  skudController.createProviderDepartment,
);
router.put(
  "/provider/departments/:departmentId",
  authorize("admin"),
  param("departmentId").isString().trim().notEmpty(),
  body("name").optional().isString().trim().notEmpty(),
  body("parentId").optional({ nullable: true }).isString().trim(),
  body("description").optional().isString(),
  validate,
  skudController.updateProviderDepartment,
);
router.delete(
  "/provider/departments/:departmentId",
  authorize("admin"),
  param("departmentId").isString().trim().notEmpty(),
  validate,
  skudController.deleteProviderDepartment,
);
router.get(
  "/provider/employees/:externalEmpId",
  authorize("admin"),
  param("externalEmpId").isString().trim().notEmpty(),
  validate,
  skudController.providerEmployee,
);
router.get(
  "/events",
  authorize("admin"),
  paginationValidation,
  skudController.events,
);
router.post(
  "/events/pull",
  authorize("admin"),
  body("limit").optional().isInt({ min: 1, max: 500 }),
  body("offset").optional().isInt({ min: 0 }),
  body("from").optional().isISO8601(),
  body("to").optional().isISO8601(),
  validate,
  skudController.pullEvents,
);
router.get(
  "/sync-jobs",
  authorize("admin"),
  paginationValidation,
  skudController.syncJobs,
);
router.post(
  "/bindings/import/preview",
  authorize("admin"),
  body("rows").isArray({ min: 1 }),
  validate,
  skudController.previewBindingImport,
);
router.post(
  "/bindings/import/execute",
  authorize("admin"),
  body("rows").isArray({ min: 1 }),
  validate,
  skudController.executeBindingImport,
);
router.post(
  "/bindings/employee/:employeeId",
  authorize("admin"),
  employeeIdParamValidation,
  body("externalEmpId").isString().trim().notEmpty(),
  validate,
  skudController.upsertBinding,
);
router.get(
  "/bindings/employee/:employeeId",
  authorize("admin"),
  employeeIdParamValidation,
  skudController.getEmployeeBinding,
);
router.get(
  "/bindings/audit",
  authorize("admin"),
  paginationValidation,
  skudController.auditBindings,
);
router.post(
  "/sync/employee/:employeeId",
  authorize("admin"),
  employeeIdParamValidation,
  skudController.syncEmployee,
);
router.post(
  "/sync/employee/:employeeId/block",
  authorize("admin"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  body("priority").optional().isIn(["normal", "high"]),
  validate,
  skudController.blockEmployee,
);
router.post(
  "/sync/employee/:employeeId/unblock",
  authorize("admin"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  body("priority").optional().isIn(["normal", "high"]),
  validate,
  skudController.unblockEmployee,
);
router.post(
  "/sync/employee/:employeeId/blacklist",
  authorize("admin"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  validate,
  skudController.blacklistEmployee,
);
router.post(
  "/sync/employee/:employeeId/blacklist/clear",
  authorize("admin"),
  employeeIdParamValidation,
  body("reasonCode").optional().isString().trim(),
  body("statusReason").optional().isString().trim(),
  validate,
  skudController.clearBlacklistEmployee,
);

router.get(
  "/cards",
  authorize("admin"),
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
  authorize("admin"),
  body("cardId").isUUID(),
  validate,
  skudController.blockCard,
);
router.post(
  "/cards/unbind",
  authorize("admin"),
  body("cardId").isUUID(),
  validate,
  skudController.unbindCard,
);

router.post(
  "/qr/issue",
  authorize("admin"),
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

// Site <-> Sigur access points mapping
router.get(
  "/site-access-points/:siteId",
  authorize("admin"),
  param("siteId").isUUID(),
  validate,
  skudController.getSiteAccessPoints,
);
router.put(
  "/site-access-points/:siteId",
  authorize("admin"),
  param("siteId").isUUID(),
  body("accessPointIds").isArray(),
  body("accessPointIds.*").isInt({ min: 1 }),
  validate,
  skudController.setSiteAccessPoints,
);
router.delete(
  "/site-access-points/entry/:id",
  authorize("admin"),
  param("id").isUUID(),
  validate,
  skudController.deleteSiteAccessPoint,
);

webhookRouter.use(webhookLimiter);
webhookRouter.post("/webdel/decision", skudController.webdelDecision);
webhookRouter.post("/webdel/events", skudController.webdelEvents);

export { webhookRouter };
export default router;
