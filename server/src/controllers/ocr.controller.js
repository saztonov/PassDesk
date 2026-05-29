import axios from "axios";
import { AppError } from "../middleware/errorHandler.js";
import {
  Counterparty,
  Employee,
  EmployeeCounterpartyMapping,
  File,
} from "../models/index.js";
import storageProvider from "../config/storage.js";
import { checkEmployeeAccess } from "../utils/permissionUtils.js";
import { readUploadedFileBuffer } from "../middleware/upload.js";
import {
  detectDocumentScan,
  normalizeDocumentType,
  recognizeDocument,
  getOcrPromptsState,
  saveOcrPromptsState,
} from "../services/ocr/ocrService.js";
import { convertPdfFirstPageToImageDataUrl } from "../services/pdf/pdfToImageService.js";
import {
  applyEmployeeOcrConflict,
  getEmployeeOcrConflictSummary,
  listEmployeeOcrConflicts,
  notifyManagersAboutOcrConflicts,
  resolveEmployeeOcrConflict,
  saveEmployeeOcrConflicts,
} from "../services/ocrConflictService.js";

const MAX_IMAGE_SIZE_BYTES = Number(
  process.env.OCR_MAX_FILE_SIZE || 12 * 1024 * 1024,
);
const OCR_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const OCR_SUPPORTED_SOURCE_MIME_TYPES = new Set([
  ...OCR_SUPPORTED_IMAGE_MIME_TYPES,
  "application/pdf",
]);

const fetchEmployeeWithMappings = async (employeeId) => {
  return Employee.findByPk(employeeId, {
    include: [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
  });
};

const fetchFileWithEmployee = async (fileId) => {
  return File.findOne({
    where: {
      id: fileId,
      isDeleted: false,
      entityType: "employee",
    },
    include: [
      {
        model: Employee,
        as: "employee",
        include: [
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            include: [
              {
                model: Counterparty,
                as: "counterparty",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    ],
  });
};

const ensureSupportedOcrMimeType = (mimeType = "") => {
  if (!OCR_SUPPORTED_SOURCE_MIME_TYPES.has(String(mimeType).toLowerCase())) {
    throw new AppError(
      "OCR поддерживает только фото/PDF (jpg, jpeg, png, webp, pdf)",
      400,
    );
  }
};

const ensureFileSize = (size) => {
  if (!size || size <= 0) {
    throw new AppError("Пустой файл не поддерживается", 400);
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      `Файл превышает лимит OCR (${Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB)`,
      400,
    );
  }
};

const buildImageDataUrl = (buffer, mimeType) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

const buildConflictUpdateUniqueMessage = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") {
    return null;
  }

  const field = String(error?.errors?.[0]?.path || "").trim();

  const fieldNames = {
    inn: "ИНН",
    snils: "СНИЛС",
    kig: "КИГ",
    kig_hash: "КИГ",
    passport_number: "Номер паспорта",
    passport_number_hash: "Номер паспорта",
  };

  const fieldLabel = fieldNames[field] || field || "Значение";
  return `${fieldLabel} уже используется у другого сотрудника`;
};

const fetchStoredFileBuffer = async (filePath) => {
  if (typeof storageProvider.getFileBuffer === "function") {
    return storageProvider.getFileBuffer(filePath);
  }

  if (typeof storageProvider.getDownloadUrl !== "function") {
    throw new AppError(
      "Текущий storage-провайдер не поддерживает чтение файла для OCR",
      500,
    );
  }

  const download = await storageProvider.getDownloadUrl(filePath);
  if (!download?.url) {
    throw new AppError("Не удалось получить ссылку на файл для OCR", 500);
  }

  const response = await axios.get(download.url, {
    responseType: "arraybuffer",
  });

  return Buffer.from(response.data);
};

const tryDecryptFileBuffer = async (buffer, fileRecord) => {
  if (fileRecord.isEncrypted !== true) {
    return buffer;
  }

  try {
    const module = await import("../services/fileEncryptionService.js");
    if (typeof module.decryptFileBuffer !== "function") {
      throw new Error("decryptFileBuffer export not found");
    }

    return module.decryptFileBuffer(buffer, {
      encryptionAlgorithm: fileRecord.encryptionAlgorithm,
      encryptionKeyVersion: fileRecord.encryptionKeyVersion,
      encryptionIv: fileRecord.encryptionIv,
      encryptionTag: fileRecord.encryptionTag,
      documentType: fileRecord.documentType,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("Cannot find module") ||
      message.includes("ERR_MODULE_NOT_FOUND")
    ) {
      throw new AppError(
        "OCR временно недоступен для зашифрованных файлов (модуль дешифрования не найден)",
        503,
      );
    }

    throw new AppError("Ошибка дешифрования файла для OCR", 500);
  }
};

const getImageSource = async (req) => {
  const body = req.body || {};
  const hasUpload = Boolean(req.file);
  const fileId = body.fileId || null;
  const employeeId = body.employeeId || null;

  if (hasUpload) {
    if (!employeeId) {
      throw new AppError("Для прямой загрузки OCR требуется employeeId", 400);
    }

    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee || employee.isDeleted) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee);

    const uploadedBuffer = await readUploadedFileBuffer(req.file);
    ensureSupportedOcrMimeType(req.file.mimetype || "");
    ensureFileSize(uploadedBuffer.length);

    return {
      source: "upload",
      fileRecord: null,
      buffer: uploadedBuffer,
      mimeType: req.file.mimetype,
      documentType: body.documentType || body.type || null,
    };
  }

  if (!fileId) {
    throw new AppError("Требуется fileId или multipart file", 400);
  }

  const fileRecord = await fetchFileWithEmployee(fileId);
  if (!fileRecord) {
    throw new AppError("Файл не найден", 404);
  }
  if (!fileRecord.employee) {
    throw new AppError("Файл не привязан к сотруднику", 400);
  }

  // Канал 1.2b: если клиент передал employeeId и он не совпадает с
  // владельцем файла — это cross-employee запрос (например, stale callback
  // от другой карточки). Отбиваем явной 409, чтобы расхождение попало
  // в логи и клиент мог его перехватить.
  if (employeeId && String(employeeId) !== String(fileRecord.employee.id)) {
    throw new AppError("Файл принадлежит другому сотруднику", 409);
  }

  await checkEmployeeAccess(req.user, fileRecord.employee);

  ensureSupportedOcrMimeType(fileRecord.mimeType || "");
  ensureFileSize(fileRecord.fileSize || 0);

  const storedBuffer = await fetchStoredFileBuffer(fileRecord.filePath);
  const decryptedBuffer = await tryDecryptFileBuffer(storedBuffer, fileRecord);

  return {
    source: "fileId",
    fileRecord,
    buffer: decryptedBuffer,
    mimeType: fileRecord.mimeType,
    documentType: body.documentType || body.type || fileRecord.documentType,
  };
};

export const recognizeDocumentFromImage = async (req, res, next) => {
  try {
    const body = req.body || {};
    const imageSource = await getImageSource(req);
    const resolvedDocumentType = normalizeDocumentType(imageSource.documentType);

    if (!resolvedDocumentType) {
      throw new AppError("documentType обязателен", 400);
    }

    const normalizedMimeType = String(imageSource.mimeType || "").toLowerCase();
    let imageDataUrl;
    if (normalizedMimeType === "application/pdf") {
      try {
        imageDataUrl = await convertPdfFirstPageToImageDataUrl({
          pdfBuffer: imageSource.buffer,
        });
      } catch (error) {
        throw new AppError(
          `Не удалось обработать PDF для OCR: ${error?.message || "unknown error"}`,
          422,
        );
      }
    } else {
      imageDataUrl = buildImageDataUrl(imageSource.buffer, imageSource.mimeType);
    }

    const result = await recognizeDocument({
      fileId: imageSource.fileRecord?.id || null,
      documentType: resolvedDocumentType,
      imageDataUrl,
      model: body.model,
      prompt: body.prompt,
    });

    // Канал 3.3: если все попытки провалили quality gate, recognizeDocument
    // возвращает кандидата с qualityGate: "failed". Синхронному клиенту
    // отдаём 422, чтобы он не применял подозрительные данные в форму.
    if (result?.qualityGate === "failed") {
      throw new AppError(
        "OCR-перевод низкого качества: не удалось извлечь ФИО и подтверждающие поля. Загрузите более чёткий скан.",
        422,
      );
    }

    return res.json({
      success: true,
      data: {
        ...result,
        source: imageSource.source,
        fileId: imageSource.fileRecord?.id || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const scanDocumentImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError("Для AI scan требуется файл", 400);
    }

    const uploadedBuffer = await readUploadedFileBuffer(req.file);
    if (!OCR_SUPPORTED_IMAGE_MIME_TYPES.has(String(req.file.mimetype || "").toLowerCase())) {
      throw new AppError(
        "AI scan поддерживает только фото (jpg, jpeg, png, webp)",
        400,
      );
    }
    ensureFileSize(uploadedBuffer.length);

    const result = await detectDocumentScan({
      documentType: req.body?.documentType || req.body?.type || null,
      imageDataUrl: buildImageDataUrl(uploadedBuffer, req.file.mimetype),
      model: req.body?.model,
      prompt: req.body?.prompt,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmRecognizedDocument = async (req, res, next) => {
  try {
    const { fileId, provider, result, conflicts, employeeId } = req.body || {};

    if (!fileId) {
      throw new AppError("fileId обязателен", 400);
    }

    const fileRecord = await fetchFileWithEmployee(fileId);
    if (!fileRecord) {
      throw new AppError("Файл не найден", 404);
    }
    if (!fileRecord.employee) {
      throw new AppError("Файл не привязан к сотруднику", 400);
    }

    // Канал 1.2b: 409 на расхождении владельца — диагностика stale callback.
    if (employeeId && String(employeeId) !== String(fileRecord.employee.id)) {
      throw new AppError("Файл принадлежит другому сотруднику", 409);
    }

    await checkEmployeeAccess(req.user, fileRecord.employee);

    const normalizedProvider =
      typeof provider === "string" ? provider.slice(0, 64) : null;
    const normalizedResult =
      result && typeof result === "object" && !Array.isArray(result)
        ? JSON.stringify(result)
        : null;

    await File.sequelize.query(
      `UPDATE files
       SET ocr_verified = TRUE,
           ocr_verified_at = COALESCE(ocr_verified_at, NOW()),
           ocr_provider = COALESCE(ocr_provider, :provider),
           ocr_result_json = COALESCE(ocr_result_json, CASE
             WHEN :resultJson IS NULL THEN NULL
             ELSE CAST(:resultJson AS jsonb)
           END)
       WHERE id = :fileId`,
      {
        replacements: {
          fileId: fileRecord.id,
          provider: normalizedProvider,
          resultJson: normalizedResult,
        },
      },
    );

    const persistedConflicts = await saveEmployeeOcrConflicts({
      employeeId: fileRecord.employee.id,
      fileId: fileRecord.id,
      documentType: fileRecord.documentType || null,
      ocrDocumentType: normalizeString(result?.documentType || null),
      conflicts: Array.isArray(conflicts) ? conflicts : [],
      createdBy: req.user.id,
    });

    const newConflicts = [
      ...persistedConflicts.created,
      ...persistedConflicts.reopened,
    ];

    if (newConflicts.length > 0) {
      await notifyManagersAboutOcrConflicts({
        employee: fileRecord.employee,
        documentType: fileRecord.documentType || null,
        conflicts: newConflicts,
      });
    }

    return res.json({
      success: true,
      message: "OCR подтвержден",
      data: {
        fileId: fileRecord.id,
        ocrVerified: true,
        conflictsCreated: newConflicts.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const normalizeString = (value) => String(value || "").trim();

export const getEmployeeConflictsSummary = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const employee = await fetchEmployeeWithMappings(employeeId);

    if (!employee || employee.isDeleted) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee, "read");

    const summary = await getEmployeeOcrConflictSummary(employeeId);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

export const getOcrConflictsList = async (req, res, next) => {
  try {
    const {
      status = "open",
      page = 1,
      limit = 50,
      employeeId = null,
      search = "",
      counterpartyId = null,
    } =
      req.query || {};
    const normalizedEmployeeId = normalizeString(employeeId);
    const normalizedCounterpartyId = normalizeString(counterpartyId);

    if (normalizedEmployeeId) {
      const employee = await fetchEmployeeWithMappings(normalizedEmployeeId);

      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }

      await checkEmployeeAccess(req.user, employee, "read");
    } else if (req.user?.role === "user") {
      throw new AppError(
        "Для пользователя доступен только просмотр конфликтов по конкретному сотруднику",
        403,
      );
    }

    const data = await listEmployeeOcrConflicts({
      status,
      page,
      limit,
      employeeId: normalizedEmployeeId || null,
      search,
      counterpartyId: normalizedCounterpartyId || null,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const resolveOcrConflict = async (req, res, next) => {
  try {
    const conflict = await resolveEmployeeOcrConflict({
      conflictId: req.params.id,
      resolvedBy: req.user.id,
    });

    if (!conflict) {
      throw new AppError("OCR-конфликт не найден", 404);
    }

    return res.json({
      success: true,
      message: "Конфликт закрыт, данные карточки сохранены",
      data: {
        id: conflict.id,
        status: "resolved",
      },
    });
  } catch (error) {
    next(error);
  }
};

export const applyOcrConflict = async (req, res, next) => {
  try {
    const result = await applyEmployeeOcrConflict({
      conflictId: req.params.id,
      resolvedBy: req.user.id,
    });

    if (!result?.conflict) {
      throw new AppError("OCR-конфликт не найден", 404);
    }

    return res.json({
      success: true,
      message: "Значение OCR применено к карточке сотрудника",
      data: {
        id: result.conflict.id,
        status: "resolved",
        appliedPatch: result.appliedPatch || {},
      },
    });
  } catch (error) {
    const uniqueMessage = buildConflictUpdateUniqueMessage(error);
    if (uniqueMessage) {
      return next(new AppError(uniqueMessage, 409));
    }

    next(error);
  }
};

export const getOcrPrompts = async (_req, res, next) => {
  try {
    const state = await getOcrPromptsState();
    return res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    next(error);
  }
};

export const updateOcrPrompts = async (req, res, next) => {
  try {
    const prompts = req.body?.prompts;
    if (!prompts || typeof prompts !== "object") {
      throw new AppError("prompts должен быть объектом", 400);
    }

    const saved = await saveOcrPromptsState(prompts);
    return res.json({
      success: true,
      message: "OCR промпты сохранены",
      data: saved,
    });
  } catch (error) {
    next(error);
  }
};
