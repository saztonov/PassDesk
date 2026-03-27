import express from "express";
import { param } from "express-validator";
import {
  getAllApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  deleteApplication,
  copyApplication,
  getContractsForApplication,
  getEmployeesForApplication,
  getRequestEmployeesForApplication,
  exportApplicationToWord,
  downloadDeveloperBiometricConsents,
} from "../controllers/application.controller.js";
import {
  uploadApplicationFiles,
  getApplicationFiles,
  deleteApplicationFile,
  getApplicationFileDownloadLink,
  getApplicationFileViewLink,
} from "../controllers/applicationFile.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import upload, {
  fixFilenameEncoding,
  validateUploadedFiles,
  cleanupUploadedTempFiles,
} from "../middleware/upload.js";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validator.js";

const router = express.Router();

const idParamValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
  validate,
];

const applicationIdParamValidation = [
  param("applicationId").isUUID().withMessage("applicationId должен быть UUID"),
  validate,
];

const applicationFileParamsValidation = [
  param("applicationId").isUUID().withMessage("applicationId должен быть UUID"),
  param("fileId").isUUID().withMessage("fileId должен быть UUID"),
  validate,
];

const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Слишком много загрузок файлов. Попробуйте снова через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Все роуты требуют аутентификации
router.use(authenticate);
router.use(authorize("admin", "user", "manager"));

// Основные CRUD операции
router.get("/", getAllApplications);
router.get("/:id", idParamValidation, getApplicationById);
router.post("/", createApplication);
router.put("/:id", idParamValidation, updateApplication);
router.delete("/:id", idParamValidation, deleteApplication);

// Дополнительные операции
router.post("/:id/copy", idParamValidation, copyApplication);
router.get("/:id/export/word", idParamValidation, exportApplicationToWord);
router.post(
  "/:id/consents/developer-biometric/download",
  idParamValidation,
  downloadDeveloperBiometricConsents,
);

// Вспомогательные endpoints для формы создания заявки
router.get("/helpers/contracts", getContractsForApplication);
router.get("/helpers/employees", getEmployeesForApplication);
router.get("/helpers/request-employees", getRequestEmployeesForApplication);

// Работа с файлами заявки
router.post(
  "/:applicationId/files",
  applicationIdParamValidation,
  uploadRateLimiter,
  upload.array("files", 10),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  uploadApplicationFiles,
);
router.get(
  "/:applicationId/files",
  applicationIdParamValidation,
  getApplicationFiles,
);
router.delete(
  "/:applicationId/files/:fileId",
  applicationFileParamsValidation,
  deleteApplicationFile,
);
router.get(
  "/:applicationId/files/:fileId/download",
  applicationFileParamsValidation,
  getApplicationFileDownloadLink,
);
router.get(
  "/:applicationId/files/:fileId/view",
  applicationFileParamsValidation,
  getApplicationFileViewLink,
);

export default router;
