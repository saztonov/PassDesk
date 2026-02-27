import express from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import upload, {
  cleanupUploadedTempFiles,
  fixFilenameEncoding,
  validateUploadedFiles,
} from "../middleware/upload.js";
import {
  confirmRecognizedDocument,
  recognizeDocumentFromImage,
} from "../controllers/ocr.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize("admin", "manager", "user"));

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
