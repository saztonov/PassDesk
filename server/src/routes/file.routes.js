import express from "express";
import { param } from "express-validator";
import { authenticate, authorize } from "../middleware/auth.js";
import upload, {
  fixFilenameEncoding,
  validateUploadedFiles,
  cleanupUploadedTempFiles,
} from "../middleware/upload.js";
import * as fileController from "../controllers/file.controller.js";
import { validate } from "../middleware/validator.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Слишком много загрузок файлов. Попробуйте снова через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Все маршруты требуют аутентификации
router.use(authenticate);
router.use(authorize("admin", "user", "manager", "ot_admin", "ot_engineer"));

// Routes
router.post(
  "/upload",
  uploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  fileController.uploadFile,
);
router.post(
  "/upload-multiple",
  uploadRateLimiter,
  upload.array("files", 5),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  fileController.uploadMultipleFiles,
);
router.get(
  "/id/:fileId",
  param("fileId").isUUID().withMessage("fileId должен быть UUID"),
  validate,
  fileController.getFileById,
); // Получить файл по ID
router.get("/:fileKey", fileController.getFile); // Получить файл по ключу
router.get("/:fileKey/public", fileController.getPublicLink);
router.delete("/:fileKey", fileController.deleteFile);

export default router;
