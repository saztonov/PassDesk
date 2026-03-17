import express from "express";
import { body, param, query } from "express-validator";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validator.js";
import upload, {
  fixFilenameEncoding,
  validateUploadedFiles,
  cleanupUploadedTempFiles,
} from "../middleware/upload.js";
import rateLimit from "express-rate-limit";
import {
  getOtCategories,
  createOtCategory,
  updateOtCategory,
  deleteOtCategory,
  reorderOtCategory,
} from "../controllers/otCategory.controller.js";
import {
  getOtDocuments,
  createOtDocument,
  updateOtDocument,
  deleteOtDocument,
  uploadOtDocumentTemplate,
  downloadOtDocumentTemplate,
} from "../controllers/otDocument.controller.js";
import {
  getOtTemplates,
  createOtTemplate,
  deleteOtTemplate,
  downloadOtTemplateFile,
} from "../controllers/otTemplate.controller.js";
import {
  getOtInstructions,
  createOtInstruction,
  updateOtInstruction,
  deleteOtInstruction,
  downloadOtInstructionFile,
} from "../controllers/otInstruction.controller.js";
import {
  getOtContractorDocuments,
  uploadOtContractorDocument,
  approveOtContractorDocument,
  rejectOtContractorDocument,
  downloadOtContractorDocumentFile,
  getOtContractorDocumentFileView,
  deleteOtContractorDocumentFile,
} from "../controllers/otContractorDocument.controller.js";
import {
  getOtContractorStatuses,
  getOtContractorStatusSummary,
  overrideOtContractorStatus,
  recalculateOtContractorStatus,
} from "../controllers/otContractorStatus.controller.js";
import {
  getOtComments,
  createOtComment,
  updateOtComment,
  deleteOtComment,
} from "../controllers/otComment.controller.js";

const router = express.Router();
const uuidListPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idParamValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
  validate,
];

const contractorDocFileParamsValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
  param("fileId").isUUID().withMessage("fileId должен быть UUID"),
  validate,
];

const contractorStatusParamsValidation = [
  param("counterpartyId")
    .isUUID()
    .withMessage("counterpartyId должен быть UUID"),
  param("siteId").isUUID().withMessage("siteId должен быть UUID"),
  validate,
];

const contractorStatusQueryValidation = [
  query("constructionSiteId")
    .isUUID()
    .withMessage("constructionSiteId должен быть UUID"),
  query("counterpartyId")
    .optional()
    .isUUID()
    .withMessage("counterpartyId должен быть UUID"),
  validate,
];

const contractorStatusSummaryQueryValidation = [
  query("constructionSiteIds")
    .optional()
    .custom((value) => {
      const siteIds = String(value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (!siteIds.length) {
        return true;
      }

      const hasInvalidUuid = siteIds.some((id) => !uuidListPattern.test(id));
      if (hasInvalidUuid) {
        throw new Error("constructionSiteIds должны быть UUID через запятую");
      }

      return true;
    }),
  validate,
];

const contractorDocsQueryValidation = [
  query("constructionSiteId")
    .isUUID()
    .withMessage("constructionSiteId должен быть UUID"),
  query("counterpartyId")
    .optional()
    .isUUID()
    .withMessage("counterpartyId должен быть UUID"),
  validate,
];

const contractorDocsBodyValidation = [
  body("documentId")
    .optional()
    .isUUID()
    .withMessage("documentId должен быть UUID"),
  body("categoryId")
    .optional()
    .isUUID()
    .withMessage("categoryId должен быть UUID"),
  body("documentName")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("documentName обязателен"),
  body("constructionSiteId")
    .isUUID()
    .withMessage("constructionSiteId должен быть UUID"),
  body("counterpartyId")
    .optional()
    .isUUID()
    .withMessage("counterpartyId должен быть UUID"),
  body().custom((value) => {
    const hasDocumentId = Boolean(value?.documentId);
    const hasCategoryId = Boolean(value?.categoryId);
    const hasDocumentName =
      typeof value?.documentName === "string" && value.documentName.trim() !== "";

    if (hasDocumentId || (hasCategoryId && hasDocumentName)) {
      return true;
    }

    throw new Error(
      "Нужно передать либо documentId, либо categoryId вместе с documentName",
    );
  }),
  validate,
];

const contractorDocFileQueryValidation = [
  query("fileId").optional().isUUID().withMessage("fileId должен быть UUID"),
  validate,
];

const otUploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: "Слишком много загрузок файлов. Попробуйте снова через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

router.use(authenticate);
router.use(authorize("admin", "user", "ot_admin", "ot_engineer"));

// Categories
router.get("/categories", getOtCategories);
router.post("/categories", createOtCategory);
router.patch("/categories/:id", idParamValidation, updateOtCategory);
router.delete("/categories/:id", idParamValidation, deleteOtCategory);
router.patch("/categories/:id/order", idParamValidation, reorderOtCategory);

// Documents
router.get("/documents", getOtDocuments);
router.post("/documents", createOtDocument);
router.patch("/documents/:id", idParamValidation, updateOtDocument);
router.delete("/documents/:id", idParamValidation, deleteOtDocument);
router.post(
  "/documents/:id/template",
  idParamValidation,
  otUploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  uploadOtDocumentTemplate,
);
router.get(
  "/documents/:id/template",
  idParamValidation,
  downloadOtDocumentTemplate,
);

// Templates
router.get("/templates", getOtTemplates);
router.post(
  "/templates",
  otUploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  createOtTemplate,
);
router.delete("/templates/:id", idParamValidation, deleteOtTemplate);
router.get("/templates/:id/file", idParamValidation, downloadOtTemplateFile);

// Instructions
router.get("/instructions", getOtInstructions);
router.post(
  "/instructions",
  otUploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  createOtInstruction,
);
router.patch(
  "/instructions/:id",
  idParamValidation,
  otUploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  updateOtInstruction,
);
router.delete("/instructions/:id", idParamValidation, deleteOtInstruction);
router.get(
  "/instructions/:id/file",
  idParamValidation,
  downloadOtInstructionFile,
);

// Contractor documents
router.get(
  "/contractor-docs",
  contractorDocsQueryValidation,
  getOtContractorDocuments,
);
router.post(
  "/contractor-docs",
  otUploadRateLimiter,
  upload.single("file"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  contractorDocsBodyValidation,
  uploadOtContractorDocument,
);
router.post(
  "/contractor-docs/:id/approve",
  idParamValidation,
  approveOtContractorDocument,
);
router.post(
  "/contractor-docs/:id/reject",
  idParamValidation,
  rejectOtContractorDocument,
);
router.get(
  "/contractor-docs/:id/file",
  idParamValidation,
  contractorDocFileQueryValidation,
  downloadOtContractorDocumentFile,
);
router.get(
  "/contractor-docs/:id/files/:fileId/view",
  contractorDocFileParamsValidation,
  getOtContractorDocumentFileView,
);
router.delete(
  "/contractor-docs/:id/files/:fileId",
  contractorDocFileParamsValidation,
  deleteOtContractorDocumentFile,
);

// Contractor statuses
router.get(
  "/contractor-status",
  contractorStatusQueryValidation,
  getOtContractorStatuses,
);
router.get(
  "/contractor-status/summary",
  contractorStatusSummaryQueryValidation,
  getOtContractorStatusSummary,
);
router.post(
  "/contractor-status/:counterpartyId/:siteId/override",
  contractorStatusParamsValidation,
  overrideOtContractorStatus,
);
router.post(
  "/contractor-status/:counterpartyId/:siteId/recalculate",
  contractorStatusParamsValidation,
  recalculateOtContractorStatus,
);

// Comments
router.get("/comments", getOtComments);
router.post("/comments", createOtComment);
router.patch("/comments/:id", idParamValidation, updateOtComment);
router.delete("/comments/:id", idParamValidation, deleteOtComment);

export default router;
