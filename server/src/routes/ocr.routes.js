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
  confirmRecognizedDocument,
  getEmployeeConflictsSummary,
  getOcrConflictsList,
  recognizeDocumentFromImage,
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
router.get("/conflicts", authorize("admin"), getOcrConflictsList);
router.post(
  "/conflicts/:id/resolve",
  authorize("admin"),
  conflictIdParamValidation,
  resolveOcrConflict,
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
