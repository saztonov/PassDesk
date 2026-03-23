import express from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validator.js";
import { authenticate, authorize } from "../middleware/auth.js";
import upload, {
  fixFilenameEncoding,
  validateUploadedFiles,
  cleanupUploadedTempFiles,
} from "../middleware/upload.js";
import rateLimit from "express-rate-limit";
import * as employeeController from "../controllers/employee.controller.js";
import * as employeeFileController from "../controllers/employeeFile.controller.js";
import * as employeeDocumentTypeController from "../controllers/employeeDocumentType.controller.js";
import * as employeeDocumentsTableController from "../controllers/employeeDocumentsTable.controller.js";
import * as telegramController from "../controllers/telegram.controller.js";

const router = express.Router();

// Rate limiter для импорта сотрудников (защита от DoS атак)
const importRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // Максимум 5 импортов за 15 минут на одного пользователя
  message: "Слишком много попыток импорта. Попробуйте через 15 минут.",
  standardHeaders: true, // Возвращать информацию о лимите в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключить заголовки `X-RateLimit-*`
  // Ключ по userId для индивидуального лимита на пользователя
  keyGenerator: (req) => {
    return req.user?.id || req.ip; // Используем userId если доступен, иначе IP
  },
  skip: (req) => {
    // Админы не подпадают под rate limit
    return req.user?.role === "admin";
  },
});

// Rate limiter для проверки ИНН (защита от перебора)
const checkInnRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 30,
  message: "Слишком много проверок ИНН. Попробуйте снова через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Rate limiter для upload-эндпоинтов
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 12,
  message: "Слишком много загрузок. Попробуйте снова через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Все маршруты требуют аутентификации
router.use(authenticate);

// Validation rules
// Для черновиков - мягкая валидация (без обязательных ФИО полей)
const createEmployeeValidation = [
  body("lastName").optional({ values: "falsy" }).trim(),
  body("firstName").optional().trim(),
  body("middleName").optional().trim(),
  body("positionId").optional().trim(),
  body("email").optional().trim(),
  body("phone").optional().trim(),
  body("bankAccountNumber").optional().trim(),
];

// Для обновления черновика - мягкая валидация
const updateEmployeeDraftValidation = [
  body("lastName").optional({ values: "falsy" }).trim(),
  body("firstName").optional().trim(),
  body("middleName").optional().trim(),
  body("positionId").optional().trim(),
  body("email").optional().trim(),
  body("phone").optional().trim(),
  body("bankAccountNumber").optional().trim(),
  body("inn").optional().trim(),
  body("snils").optional().trim(),
  body("kig").optional().trim(),
  body("passportNumber").optional().trim(),
  body("passportDate").optional().trim(),
  body("passportIssuer").optional().trim(),
  body("registrationAddress").optional().trim(),
  body("patentNumber").optional().trim(),
  body("blankNumber").optional().trim(),
  body("notes").optional().trim(),
];

// Для полного сохранения - строгая валидация
const updateEmployeeValidation = [
  body("firstName").optional().notEmpty().trim(),
  body("lastName").optional().notEmpty().trim(),
  body("middleName").optional().trim(),
  body("positionId").optional({ values: "falsy" }).trim(),
  body("email").optional().trim(),
  body("phone").optional().trim(),
  body("bankAccountNumber").optional().trim(),
];

// Более мягкая валидация для профиля пользователя
const updateMyProfileValidation = [
  body("firstName").optional().trim(),
  body("lastName").optional().trim(),
  body("middleName").optional().trim(),
  body("positionId").optional().trim(), // Изменено с position на positionId
  body("email").optional().isEmail().withMessage("Введите корректный email"),
  body("phone").optional().trim(),
  body("bankAccountNumber").optional().trim(),
  body("inn").optional().trim(),
  body("snils").optional().trim(),
  body("kig").optional().trim(),
  body("passportNumber").optional().trim(),
  body("passportIssuer").optional().trim(),
  body("registrationAddress").optional().trim(),
  body("patentNumber").optional().trim(),
  body("blankNumber").optional().trim(),
  body("notes").optional().trim(),
];

const idParamValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
  validate,
];

const employeeIdParamValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  validate,
];

const employeeFileParamsValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  param("fileId").isUUID().withMessage("fileId должен быть UUID"),
  validate,
];

const employeeStatusMappingParamsValidation = [
  param("employeeId").isUUID().withMessage("employeeId должен быть UUID"),
  param("statusMappingId")
    .isUUID()
    .withMessage("statusMappingId должен быть UUID"),
  validate,
];

// Employee routes
// ⚠️ Специфичные маршруты ДОЛЖНЫ быть перед параметризованными (/:id)
router.get(
  "/my-profile",
  authorize("admin", "manager", "user", "laborer"),
  employeeController.getMyProfile,
); // Получить свой профиль
router.put(
  "/my-profile",
  authorize("admin", "manager", "user", "laborer"),
  updateMyProfileValidation,
  validate,
  employeeController.updateMyProfile,
); // Обновить свой профиль
router.get(
  "/my-profile/telegram",
  authorize("admin", "manager", "user"),
  telegramController.getMyTelegramBindingState,
);
router.post(
  "/my-profile/telegram/link-code",
  authorize("admin", "manager", "user"),
  telegramController.createMyTelegramLinkCode,
);
router.delete(
  "/my-profile/telegram/link",
  authorize("admin", "manager", "user"),
  telegramController.unlinkMyTelegramBinding,
);
router.post(
  "/my-profile/skud/qr",
  authorize("admin", "manager", "user", "laborer"),
  body("channel").optional().isIn(["mobile", "web"]),
  validate,
  employeeController.issueMyProfileSkudQr,
);

router.use(authorize("admin", "manager", "user"));
router.get(
  "/check-inn",
  checkInnRateLimiter,
  employeeController.checkEmployeeByInn,
); // Проверить наличие сотрудника по ИНН
router.get("/search", employeeController.searchEmployees); // Поиск
router.get(
  "/document-types",
  employeeDocumentTypeController.getEmployeeDocumentTypes,
); // Типы документов сотрудника (с образцами)
router.get(
  "/document-types/admin",
  authorize("admin"),
  employeeDocumentTypeController.getEmployeeDocumentTypesForAdmin,
); // Типы документов для управления в админке
router.put(
  "/document-types/:id",
  authorize("admin"),
  idParamValidation,
  employeeDocumentTypeController.updateEmployeeDocumentType,
); // Обновление метаданных типа документа
router.post(
  "/document-types/:id/sample",
  authorize("admin"),
  idParamValidation,
  uploadRateLimiter,
  upload.single("sample"),
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  employeeDocumentTypeController.uploadEmployeeDocumentTypeSample,
); // Загрузка образца документа
router.delete(
  "/document-types/:id/sample",
  authorize("admin"),
  idParamValidation,
  employeeDocumentTypeController.deleteEmployeeDocumentTypeSample,
); // Удаление образца документа

// Импорт сотрудников из Excel (доступен всем авторизованным) - ДОЛЖНО быть перед /:id
// Защита от DoS: максимум 5 импортов за 15 минут на пользователя
router.post(
  "/import/validate",
  importRateLimiter,
  employeeController.validateEmployeesImport,
); // Валидация данных
router.post(
  "/import/execute",
  importRateLimiter,
  employeeController.importEmployees,
); // Финальный импорт

router.get(
  "/documents/table",
  authorize("admin", "manager", "user"),
  employeeDocumentsTableController.getCounterpartyDocumentsTable,
);
router.get(
  "/documents/export/zip",
  authorize("admin", "manager", "user"),
  employeeDocumentsTableController.downloadCounterpartyDocumentsZip,
);
router.get(
  "/documents/export/excel",
  authorize("admin", "manager", "user"),
  employeeDocumentsTableController.exportCounterpartyDocumentsExcel,
);

// Общие маршруты
// Если есть activeOnly=true, используем отдельный контроллер для выгрузки
router.get("/", (req, res, next) => {
  const controller =
    req.query.activeOnly === "true"
      ? employeeController.getActiveEmployeesForExport
      : employeeController.getAllEmployees;
  controller(req, res, next);
});
router.post(
  "/",
  createEmployeeValidation,
  validate,
  employeeController.createEmployee,
); // Валидация для создания черновика/карточки
router.get(
  "/deleted",
  authorize("admin", "manager"),
  employeeController.getDeletedEmployees,
);
router.get(
  "/marked-for-deletion",
  authorize("admin", "manager"),
  employeeController.getMarkedForDeletionEmployees,
);
router.post(
  "/:id/restore",
  idParamValidation,
  authorize("admin", "manager"),
  employeeController.restoreEmployee,
);
router.post(
  "/:id/discard-draft",
  idParamValidation,
  authorize("admin", "manager", "user"),
  employeeController.discardDraftEmployee,
);
router.delete(
  "/:id/permanent",
  idParamValidation,
  authorize("admin", "manager"),
  employeeController.permanentlyDeleteEmployee,
);
router.post(
  "/:id/mark-for-deletion",
  idParamValidation,
  authorize("user", "admin"),
  employeeController.markEmployeeForDeletion,
);
router.post(
  "/:id/unmark-for-deletion",
  idParamValidation,
  authorize("admin"),
  employeeController.unmarkEmployeeForDeletion,
);

// Маршруты с параметрами (/:id должны быть в конце)
router.get("/:id", idParamValidation, employeeController.getEmployeeById);
router.put(
  "/:id/draft",
  idParamValidation,
  updateEmployeeDraftValidation,
  validate,
  employeeController.updateEmployee,
); // Обновление черновика - мягкая валидация
router.put(
  "/:id",
  idParamValidation,
  updateEmployeeValidation,
  validate,
  employeeController.updateEmployee,
); // Полное обновление - строгая валидация
router.put(
  "/:id/construction-sites",
  idParamValidation,
  employeeController.updateEmployeeConstructionSites,
); // Убрали authorize('admin')
router.put(
  "/:id/department",
  idParamValidation,
  employeeController.updateEmployeeDepartment,
); // Убрали authorize('admin')
router.put(
  "/:employeeId/status/:statusMappingId/upload",
  employeeStatusMappingParamsValidation,
  employeeController.updateStatusUploadFlag,
); // Обновить флаг is_upload для статуса
router.put(
  "/:employeeId/statuses/upload",
  employeeIdParamValidation,
  employeeController.updateAllStatusesUploadFlag,
); // Обновить флаг is_upload для всех активных статусов
router.post(
  "/:employeeId/status/edited",
  employeeIdParamValidation,
  employeeController.setEditedStatus,
); // Установить статус "Редактирован" с is_upload
router.post(
  "/:id/action/fire",
  idParamValidation,
  employeeController.fireEmployee,
); // Уволить сотрудника
router.post(
  "/:id/action/reinstate",
  idParamValidation,
  employeeController.reinstateEmployee,
); // Принять уволенного сотрудника
router.post(
  "/:id/action/deactivate",
  idParamValidation,
  employeeController.deactivateEmployee,
); // Деактивировать сотрудника
router.post(
  "/:id/action/activate",
  idParamValidation,
  employeeController.activateEmployee,
); // Активировать сотрудника
router.post(
  "/:id/transfer",
  idParamValidation,
  authorize("admin"),
  employeeController.transferEmployeeToCounterparty,
); // Перевести сотрудника в другую компанию (только admin)
router.delete("/:id", idParamValidation, employeeController.deleteEmployee); // Проверка прав в контроллере

// Employee files routes
// Пользователи (user) могут загружать файлы только для своего профиля
router.post(
  "/:employeeId/files",
  employeeIdParamValidation,
  uploadRateLimiter,
  upload.array("files", 10), // максимум 10 файлов за раз
  validateUploadedFiles,
  fixFilenameEncoding,
  cleanupUploadedTempFiles,
  employeeFileController.uploadEmployeeFiles,
);
router.get(
  "/:employeeId/files",
  employeeIdParamValidation,
  employeeFileController.getEmployeeFiles,
);
router.delete(
  "/:employeeId/files/:fileId",
  employeeFileParamsValidation,
  employeeFileController.deleteEmployeeFile,
);
router.get(
  "/:employeeId/files/:fileId/download",
  employeeFileParamsValidation,
  employeeFileController.getEmployeeFileDownloadLink,
);

// Get employee file view link
router.get(
  "/:employeeId/files/:fileId/view",
  employeeFileParamsValidation,
  employeeFileController.getEmployeeFileViewLink,
);

export default router;
