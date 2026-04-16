import {
  File,
  Employee,
  Counterparty,
  EmployeeCounterpartyMapping,
} from "../models/index.js";
import storageProvider from "../config/storage.js";
import archiver from "archiver";
import {
  buildEmployeeFilePath,
  sanitizeFileName,
  formatEmployeeFileName,
  getSafeFileExtension,
} from "../utils/transliterate.js";
import { AppError } from "../middleware/errorHandler.js";
import { checkEmployeeAccess } from "../utils/permissionUtils.js";
import { buildFileProxyUrl } from "../services/fileDownloadTokenService.js";
import EmployeeStatusService from "../services/employeeStatusService.js";
import { decryptFileBuffer } from "../services/fileEncryptionService.js";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
} from "../services/auditEventService.js";
import {
  enqueueEmployeeFileUpload,
  listEmployeeUploadQueue,
} from "../queues/employeeUploads/queue.js";
import {
  enqueueEmployeeOcrJob,
  listEmployeeOcrQueue,
} from "../queues/employeeOcr/queue.js";

const VALID_DOCUMENT_TYPES = [
  "passport",
  "passport_translation",
  "inn_document",
  "patent_front",
  "patent_back",
  "visa",
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
  "bank_details",
  "snils_card",
  "kig",
  "diploma",
  "migration_card",
  "arrival_notice",
  "patent_payment_receipt",
  "insurance_policy",
  "memo_approval",
  "employment_history_stdr",
  "registration_amina",
  "military_id",
  "other",
];

/**
 * Helper: Загрузить сотрудника с маппингами для проверки прав
 */
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

const sanitizeZipEntryName = (value) =>
  String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/\.\.+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 160)
    .trim() || "Без_названия";

/**
 * Загрузка файлов для сотрудника
 */
export const uploadEmployeeFiles = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { documentType } = req.body; // Получаем тип документа из тела запроса
    const maxFilesPerEmployee =
      parseInt(process.env.MAX_FILES_PER_EMPLOYEE) || 50;

    console.log("📤 Upload request:", {
      employeeId,
      filesCount: req.files?.length,
      user: req.user?.id,
      documentType,
    });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Файлы не предоставлены",
      });
    }

    // Проверяем аутентификацию
    if (!req.user || !req.user.id) {
      throw new AppError("Пользователь не аутентифицирован", 401);
    }

    if (documentType && !VALID_DOCUMENT_TYPES.includes(documentType)) {
      throw new AppError(
        `Неверный тип документа. Допустимые значения: ${VALID_DOCUMENT_TYPES.join(", ")}`,
        400,
      );
    }

    // Загружаем данные сотрудника с контрагентом через маппинг
    const employee = await fetchEmployeeWithMappings(employeeId);

    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    const mapping = employee.employeeCounterpartyMappings?.[0];
    // Для пользователей с дефолтным контрагентом маппинга может и не быть при создании,
    // но если они прошли checkEmployeeAccess, значит они создатели.
    // Однако для сохранения файла нам нужно имя контрагента для пути.
    // Если маппинга нет (редкий случай для созданного сотрудника, обычно создается сразу),
    // нужно решить откуда брать имя папки.
    // В createEmployee маппинг создается всегда.

    if (!mapping || !mapping.counterparty) {
      // Если маппинга нет, но доступ разрешен (например, создатель без маппинга?),
      // это странная ситуация, так как при создании маппинг создается.
      throw new AppError(
        "У сотрудника не указан контрагент (нарушение целостности данных)",
        400,
      );
    }

    const counterparty = mapping.counterparty;

    // Проверка лимитов для обычных пользователей
    if (req.user.role === "user") {
      // Проверяем количество существующих файлов
      const existingFilesCount = await File.count({
        where: {
          entityType: "employee",
          entityId: employeeId,
          isDeleted: false,
        },
      });

      const newFilesCount = req.files.length;
      const totalFiles = existingFilesCount + newFilesCount;

      if (totalFiles > maxFilesPerEmployee) {
        throw new AppError(
          `Превышен лимит файлов. Максимум ${maxFilesPerEmployee} файлов. У вас уже ${existingFilesCount} файлов.`,
          400,
        );
      }

      // Проверяем размер каждого файла (макс 100MB)
      for (const file of req.files) {
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 100) {
          throw new AppError(
            `Файл "${file.originalname}" слишком большой (${fileSizeMB.toFixed(2)}MB). Максимум 100MB.`,
            400,
          );
        }
      }
    }

    // Формируем путь: PassDesk/Counterparty_Name/employee_uuid/
    // Используем UUID сотрудника для стабильности при редактировании ФИО
    const relativeDirectory = buildEmployeeFilePath(
      counterparty.name,
      employee.id,
    ).replace(/^\/+/, "");
    const folderPath = storageProvider.resolvePath(relativeDirectory);

    const uploadedFiles = [];
    const errors = [];

    // Загружаем каждый файл
    for (const file of req.files) {
      try {
        console.log(
          `📁 Uploading file: ${file.originalname}, size: ${file.size} bytes`,
        );
        console.log(`📦 Provider: ${storageProvider.name}`);
        console.log(`📍 Base folder: ${folderPath}`);

        // Получаем расширение файла
        const extension = getSafeFileExtension(file.originalname);

        // Форматируем имя файла в соответствии с типом документа и ФИО
        let formattedFileName;
        if (documentType && documentType !== "other") {
          // Если указан тип документа, используем форматированное имя
          formattedFileName = formatEmployeeFileName(
            documentType,
            employee.lastName,
            employee.firstName,
            employee.middleName,
            extension,
          );
        } else {
          // Иначе используем оригинальное имя
          formattedFileName = sanitizeFileName(file.originalname);
        }

        const timestamp = Date.now();
        const fileName = `${timestamp}_${formattedFileName}`;
        const targetPath = storageProvider.resolvePath(
          `${relativeDirectory}/${fileName}`,
        );

        console.log(`📝 Formatted filename: ${formattedFileName}`);
        console.log(`🔑 File key: ${targetPath}`);

        await storageProvider.uploadFile({
          fileBuffer: file.buffer,
          fileLocalPath: file.path,
          mimeType: file.mimetype,
          originalName: file.originalname,
          filePath: targetPath,
        });

        console.log(`✅ File uploaded to storage: ${targetPath}`);
        console.log(`💾 Now saving to database...`);

        // Сохраняем информацию о файле в БД
        const fileRecord = await File.create({
          fileKey: fileName,
          fileName: formattedFileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: targetPath,
          publicUrl: null,
          resourceId: null,
          entityType: "employee",
          entityId: employeeId,
          employeeId: employeeId, // Явная связь с сотрудником
          uploadedBy: req.user.id,
          documentType: documentType || null, // Сохраняем тип документа
        });

        console.log(`✅ File record saved to DB: ${fileRecord.id}`);
        uploadedFiles.push(fileRecord);
        try {
          await enqueueEmployeeOcrJob({
            employeeId,
            fileId: fileRecord.id,
            documentType: fileRecord.documentType,
            fileName: fileRecord.originalName || fileRecord.fileName || null,
          });
        } catch (enqueueError) {
          console.error(
            "Failed to enqueue OCR job:",
            enqueueError?.message || enqueueError,
          );
        }
      } catch (error) {
        console.error(
          `❌ Error uploading file ${file.originalname}:`,
          error.message,
        );
        console.error(`📋 Error details:`, {
          name: error.name,
          code: error.code,
          statusCode: error.$metadata?.httpStatusCode,
          message: error.message,
          stack: error.stack,
        });
        const publicErrorMessage =
          String(error?.message || "").trim() ||
          String(error?.code || "").trim() ||
          "Ошибка сохранения файла";
        errors.push({
          fileName: file.originalname,
          error: publicErrorMessage,
        });
        // Продолжаем загрузку остальных файлов
      }
    }

    if (uploadedFiles.length === 0) {
      throw new AppError(
        `Не удалось загрузить ни одного файла. ${errors.length > 0 ? "Ошибки: " + errors.map((e) => `${e.fileName}: ${e.error}`).join("; ") : ""}`,
        500,
      );
    }

    console.log(
      `✅ Upload complete! ${uploadedFiles.length} file(s) uploaded successfully`,
    );
    const updatedUploadFlags = await EmployeeStatusService.resetActiveUploadFlags(
      employeeId,
      req.user.id,
      {
        auditContext: {
          req,
          reason: "file_uploaded",
          metadata: {
            documentType: documentType || null,
            filesCount: uploadedFiles.length,
          },
        },
      },
    );
    console.log(
      `✓ Active status upload flags reset to false after file upload: ${updatedUploadFlags}`,
    );

    await logAuditEvent({
      userId: req.user.id,
      eventType: AUDIT_EVENT_TYPES.FILE_UPLOADED,
      entityType: "employee",
      entityId: employeeId,
      details: {
        counterpartyId: mapping?.counterpartyId || null,
        counterpartyName: counterparty?.name || null,
        documentType: documentType || null,
        files: uploadedFiles.map((fileRecord) => ({
          id: fileRecord.id,
          fileName: fileRecord.fileName,
          originalName: fileRecord.originalName,
          documentType: fileRecord.documentType || null,
        })),
      },
      req,
    });

    res.status(201).json({
      success: true,
      message: `Успешно загружено файлов: ${uploadedFiles.length}`,
      data: uploadedFiles,
    });
  } catch (error) {
    console.error("❌ Upload error:", error.message);
    next(error);
  }
};

export const enqueueEmployeeFiles = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { documentType } = req.body;
    const maxFilesPerEmployee =
      parseInt(process.env.MAX_FILES_PER_EMPLOYEE) || 50;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Файлы не предоставлены",
      });
    }

    if (!req.user || !req.user.id) {
      throw new AppError("Пользователь не аутентифицирован", 401);
    }

    if (documentType && !VALID_DOCUMENT_TYPES.includes(documentType)) {
      throw new AppError(
        `Неверный тип документа. Допустимые значения: ${VALID_DOCUMENT_TYPES.join(", ")}`,
        400,
      );
    }

    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee);

    const mapping = employee.employeeCounterpartyMappings?.[0];
    if (!mapping || !mapping.counterparty) {
      throw new AppError(
        "У сотрудника не указан контрагент (нарушение целостности данных)",
        400,
      );
    }

    if (req.user.role === "user") {
      const existingFilesCount = await File.count({
        where: {
          entityType: "employee",
          entityId: employeeId,
          isDeleted: false,
        },
      });
      const newFilesCount = req.files.length;
      const totalFiles = existingFilesCount + newFilesCount;

      if (totalFiles > maxFilesPerEmployee) {
        throw new AppError(
          `Превышен лимит файлов. Максимум ${maxFilesPerEmployee} файлов. У вас уже ${existingFilesCount} файлов.`,
          400,
        );
      }
    }

    req.skipUploadCleanup = true;

    const jobs = [];
    for (const file of req.files) {
      const job = await enqueueEmployeeFileUpload({
        employeeId,
        documentType,
        userId: req.user.id,
        userRole: req.user.role,
        tempPath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      if (job) {
        jobs.push({
          id: String(job.id),
          fileName: file.originalname,
          documentType: documentType || null,
          status: "queued",
          attempts: 0,
          error: null,
        });
      }
    }

    res.status(202).json({
      success: true,
      message: `Файлы отправлены в очередь: ${jobs.length}`,
      data: jobs,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeUploadQueue = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }
    await checkEmployeeAccess(req.user, employee);

    const queueItems = await listEmployeeUploadQueue(employeeId);
    res.json({
      success: true,
      data: queueItems,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeOcrQueue = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }
    await checkEmployeeAccess(req.user, employee);

    const queueItems = await listEmployeeOcrQueue(employeeId);
    res.json({
      success: true,
      data: queueItems,
    });
  } catch (error) {
    next(error);
  }
};

export const enqueueEmployeeOcrForFile = async (req, res, next) => {
  try {
    const { employeeId, fileId } = req.params;
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }
    await checkEmployeeAccess(req.user, employee);

    const fileRecord = await File.findOne({
      where: {
        id: fileId,
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
    });
    if (!fileRecord) {
      throw new AppError("Файл не найден", 404);
    }

    const job = await enqueueEmployeeOcrJob({
      employeeId,
      fileId: fileRecord.id,
      documentType: fileRecord.documentType,
      fileName: fileRecord.originalName || fileRecord.fileName || null,
      force: true,
    });

    res.status(202).json({
      success: true,
      message: "OCR отправлен в очередь",
      data: job ? { id: String(job.id), fileId: fileRecord.id } : null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение списка файлов сотрудника
 */
export const getEmployeeFiles = async (req, res, next) => {
  try {
    const { employeeId } = req.params;

    // Проверяем существование сотрудника и права доступа
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    // Получаем все файлы сотрудника.
    // SEC-NEW-2: filePath и publicUrl УДАЛЕНЫ из whitelist — они утекали
    // внутренний storage-путь и direct URL, что обходит proxy/ACL слой.
    // Для скачивания клиент должен использовать /files/proxy/:fileId.
    // ocrResultJson пока оставлен — используется DocumentTypeUploader для
    // автозаполнения формы после upload. TODO: вынести в отдельный
    // role-gated endpoint GET /files/:fileId/ocr-result с audit-log.
    const files = await File.findAll({
      where: {
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "fileKey",
        "fileName",
        "originalName",
        "mimeType",
        "fileSize",
        "documentType",
        "createdAt",
        "ocrVerified",
        "ocrVerifiedAt",
        "ocrProvider",
        "ocrResultJson",
      ],
    });

    res.json({
      success: true,
      data: files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Скачать все файлы сотрудника одним ZIP-архивом
 */
export const downloadEmployeeFilesZip = async (req, res, next) => {
  try {
    const { employeeId } = req.params;

    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee);

    const files = await File.findAll({
      where: {
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
      order: [["createdAt", "DESC"]],
    });

    if (!files.length) {
      throw new AppError("Нет файлов для выгрузки", 400);
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (error) => {
      if (!res.headersSent) {
        next(error);
      }
    });

    const fileName = `employee_files_${new Date().toISOString().split("T")[0]}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    archive.pipe(res);

    const usedNames = new Map();

    for (const file of files) {
      try {
        const sourceBuffer = await storageProvider.getFileBuffer(file.filePath);
        const fileBuffer = file.isEncrypted
          ? decryptFileBuffer(sourceBuffer, {
              encryptionAlgorithm: file.encryptionAlgorithm,
              encryptionKeyVersion: file.encryptionKeyVersion,
              encryptionIv: file.encryptionIv,
              encryptionTag: file.encryptionTag,
              documentType: file.documentType,
            })
          : sourceBuffer;

        const baseName = sanitizeZipEntryName(
          file.fileName || file.originalName || file.fileKey || `${file.id}.bin`,
        );

        const existingCount = usedNames.get(baseName) || 0;
        let entryName = baseName;
        if (existingCount > 0) {
          const dotIndex = baseName.lastIndexOf(".");
          if (dotIndex > 0) {
            entryName = `${baseName.slice(0, dotIndex)} (${existingCount + 1})${baseName.slice(dotIndex)}`;
          } else {
            entryName = `${baseName} (${existingCount + 1})`;
          }
        }
        usedNames.set(baseName, existingCount + 1);

        archive.append(fileBuffer, { name: entryName });
      } catch (error) {
        console.error(`Error adding file ${file.id} to zip:`, error.message);
      }
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
};

/**
 * Удаление файла сотрудника
 */
export const deleteEmployeeFile = async (req, res, next) => {
  try {
    const { employeeId, fileId } = req.params;

    // Проверяем права доступа к сотруднику
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    // Находим файл с проверкой прав через сотрудника
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
      include: [
        {
          model: Employee,
          as: "employee",
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              attributes: ["counterpartyId"],
            },
          ],
        },
      ],
    });

    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    // Удаляем файл из хранилища
    try {
      await storageProvider.deleteFile(file.filePath);
    } catch (error) {
      console.error("Error deleting file from storage:", error);
      // Продолжаем даже если не удалось удалить из хранилища
    }

    // Физически удаляем запись из БД
    await file.destroy();
    const updatedUploadFlags = await EmployeeStatusService.resetActiveUploadFlags(
      employeeId,
      req.user.id,
      {
        auditContext: {
          req,
          reason: "file_deleted",
          metadata: {
            fileId: file.id,
            documentType: file.documentType || null,
          },
        },
      },
    );
    console.log(
      `✓ Active status upload flags reset to false after file deletion: ${updatedUploadFlags}`,
    );

    await logAuditEvent({
      userId: req.user.id,
      eventType: AUDIT_EVENT_TYPES.FILE_DELETED,
      entityType: "employee",
      entityId: employeeId,
      details: {
        counterpartyId:
          employee.employeeCounterpartyMappings?.find((mapping) => !mapping.dismissedAt)
            ?.counterpartyId ||
          employee.employeeCounterpartyMappings?.[0]?.counterpartyId ||
          null,
        fileId: file.id,
        fileName: file.fileName,
        originalName: file.originalName,
        documentType: file.documentType || null,
      },
      req,
    });

    res.json({
      success: true,
      message: "Файл успешно удален",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение ссылки для скачивания файла
 */
export const getEmployeeFileDownloadLink = async (req, res, next) => {
  try {
    const { employeeId, fileId } = req.params;

    // Проверяем права доступа к сотруднику
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    // Находим файл с проверкой прав
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
      include: [
        {
          model: Employee,
          as: "employee",
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              attributes: ["counterpartyId"],
            },
          ],
        },
      ],
    });

    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    if (file.isEncrypted) {
      return res.json({
        success: true,
        data: {
          downloadUrl: buildFileProxyUrl(req, file.id, "attachment"),
          fileName: file.fileName || file.originalName,
        },
      });
    }

    const downloadData = await storageProvider.getDownloadUrl(file.filePath, {
      expiresIn: 3600,
      fileName: file.fileName || file.originalName, // Передаём имя файла для заголовка Content-Disposition
    });

    res.json({
      success: true,
      data: {
        downloadUrl: downloadData.url,
        fileName: file.fileName || file.originalName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение ссылки для просмотра файла (публичная ссылка)
 */
export const getEmployeeFileViewLink = async (req, res, next) => {
  try {
    const { employeeId, fileId } = req.params;

    // Проверяем права доступа к сотруднику
    const employee = await fetchEmployeeWithMappings(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkEmployeeAccess(req.user, employee);

    // Находим файл с проверкой прав
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "employee",
        entityId: employeeId,
        isDeleted: false,
      },
      include: [
        {
          model: Employee,
          as: "employee",
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              attributes: ["counterpartyId"],
            },
          ],
        },
      ],
    });

    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    if (file.isEncrypted) {
      return res.json({
        success: true,
        data: {
          viewUrl: buildFileProxyUrl(req, file.id, "inline"),
          fileName: file.fileName || file.originalName,
          mimeType: file.mimeType,
        },
      });
    }

    const viewData = await storageProvider.getPublicUrl(file.filePath, {
      expiresIn: 86400,
    });

    res.json({
      success: true,
      data: {
        viewUrl: viewData.url,
        fileName: file.fileName || file.originalName,
        mimeType: file.mimeType,
      },
    });
  } catch (error) {
    next(error);
  }
};
