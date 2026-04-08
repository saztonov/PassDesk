import express from "express";
import { param } from "express-validator";
import { authenticate, authorize } from "../middleware/auth.js";
import upload, {
  cleanupUploadedTempFiles,
  fixFilenameEncoding,
  validateUploadedFiles,
} from "../middleware/upload.js";
import { validate } from "../middleware/validator.js";
import {
  applyOcrConflict,
  confirmRecognizedDocument,
  getOcrPrompts,
  getEmployeeConflictsSummary,
  getOcrConflictsList,
  recognizeDocumentFromImage,
  scanDocumentImage,
  updateOcrPrompts,
  resolveOcrConflict,
} from "../controllers/ocr.controller.js";

const router = express.Router();

const employeeIdParamValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  validate,
];

const conflictIdParamValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
  validate,
];

router.use(authenticate);
router.use(authorize("admin", "manager", "user"));

router.get(
  "/conflicts/summary/:employeeId",
  employeeIdParamValidation,
  getEmployeeConflictsSummary,
);
router.get("/conflicts", authorize("admin", "manager", "user"), getOcrConflictsList);
router.post(
  "/conflicts/:id/resolve",
  authorize("admin", "manager"),
  conflictIdParamValidation,
  resolveOcrConflict,
);
router.post(
  "/conflicts/:id/apply",
  authorize("admin", "manager"),
  conflictIdParamValidation,
  applyOcrConflict,
);

router.get("/prompts", authorize("admin"), getOcrPrompts);
router.put("/prompts", authorize("admin"), updateOcrPrompts);

router.post(
  "/scan",
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  scanDocumentImage,
);

router.post(
  "/recognize",
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  recognizeDocumentFromImage,
);

router.post("/confirm", confirmRecognizedDocument);

export default router;
