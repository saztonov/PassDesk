import storageProvider from "../config/storage.js";
import { AppError } from "../middleware/errorHandler.js";
import { checkEmployeeAccess } from "../utils/permissionUtils.js";
import { decryptFileBuffer } from "../services/fileEncryptionService.js";
import {
  verifyFileProxyToken,
  buildFileProxyUrl,
} from "../services/fileDownloadTokenService.js";

/**
 * Проверка прав доступа к файлу
 * Проверяет, имеет ли пользователь доступ к сущности, которой принадлежит файл
 */
const checkFileAccess = async (file, user) => {
  // Админ имеет доступ ко всем файлам
  if (user.role === "admin") {
    return true;
  }

  const {
    File,
    Employee,
    Application,
    EmployeeCounterpartyMapping,
    Counterparty,
  } = await import("../models/index.js");

  // Проверка по типу сущности
  if (file.entityType === "employee") {
    // Загружаем сотрудника с маппингами
    const employee = await Employee.findByPk(file.entityId, {
      include: [
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              attributes: ["id"],
            },
          ],
        },
      ],
    });

    if (!employee) {
      throw new AppError(
        "Сотрудник, которому принадлежит файл, не найден",
        404,
      );
    }

    // Используем стандартную проверку доступа к сотруднику
    await checkEmployeeAccess(user, employee);
    return true;
  }

  if (file.entityType === "application") {
    // Загружаем заявку
    const application = await Application.findByPk(file.entityId);

    if (!application) {
      throw new AppError("Заявка, которой принадлежит файл, не найдена", 404);
    }

    // Пользователь может видеть только свои заявки
    if (application.createdBy !== user.id) {
      throw new AppError("Нет доступа к этому файлу", 403);
    }

    return true;
  }

  // Для других типов сущностей - запрещаем доступ обычным пользователям
  throw new AppError("Нет доступа к этому файлу", 403);
};

const buildContentDisposition = (disposition, fileName) => {
  const safeDisposition = disposition === "inline" ? "inline" : "attachment";
  const encodedFileName = encodeURIComponent(fileName || "file").replace(
    /'/g,
    "%27",
  );

  return `${safeDisposition}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;
};

const ensureStorageSupportsBufferRead = () => {
  if (typeof storageProvider.getFileBuffer !== "function") {
    throw new AppError(
      "Текущий провайдер хранения не поддерживает чтение файлов через proxy",
      500,
    );
  }
};

export const proxyFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      throw new AppError("Требуется token для доступа к файлу", 401);
    }

    let tokenPayload;
    try {
      tokenPayload = verifyFileProxyToken(token);
    } catch (error) {
      throw new AppError("Недействительный token для доступа к файлу", 401);
    }

    if (String(tokenPayload.fileId) !== String(fileId)) {
      throw new AppError("Token не соответствует файлу", 403);
    }

    const { File } = await import("../models/index.js");
    const file = await File.findOne({
      where: {
        id: fileId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    ensureStorageSupportsBufferRead();
    const storedBuffer = await storageProvider.getFileBuffer(file.filePath);

    let responseBuffer = storedBuffer;
    if (file.isEncrypted) {
      responseBuffer = decryptFileBuffer(storedBuffer, {
        encryptionAlgorithm: file.encryptionAlgorithm,
        encryptionKeyVersion: file.encryptionKeyVersion,
        encryptionIv: file.encryptionIv,
        encryptionTag: file.encryptionTag,
        documentType: file.documentType,
      });
    }

    const fileName = file.fileName || file.originalName || "file";
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(tokenPayload.disposition, fileName),
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(responseBuffer.length));

    return res.status(200).send(responseBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Загрузка файла в Object Storage
 * ВНИМАНИЕ: Этот endpoint устарел. Используйте загрузку через /employees/:id/files
 */
export const uploadFile = async (req, res, next) => {
  try {
    // Только админы могут загружать файлы напрямую (без привязки к сущности)
    if (req.user.role !== "admin") {
      throw new AppError(
        "Загрузка файлов напрямую доступна только администраторам. Используйте загрузку через /employees/:id/files",
        403,
      );
    }

    if (!req.file) {
      throw new AppError("No file provided", 400);
    }

    const file = req.file;
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.originalname}`;
    const filePath = storageProvider.resolvePath(fileName);

    await storageProvider.uploadFile({
      fileBuffer: file.buffer,
      fileLocalPath: file.path,
      mimeType: file.mimetype,
      originalName: file.originalname,
      filePath,
    });

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        fileKey: fileName,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        path: filePath,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Загрузка нескольких файлов
 * ВНИМАНИЕ: Этот endpoint устарел. Используйте загрузку через /employees/:id/files
 */
export const uploadMultipleFiles = async (req, res, next) => {
  try {
    // Только админы могут загружать файлы напрямую (без привязки к сущности)
    if (req.user.role !== "admin") {
      throw new AppError(
        "Загрузка файлов напрямую доступна только администраторам",
        403,
      );
    }

    if (!req.files || req.files.length === 0) {
      throw new AppError("No files provided", 400);
    }

    const uploadPromises = req.files.map(async (file) => {
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.originalname}`;
      const filePath = storageProvider.resolvePath(fileName);

      await storageProvider.uploadFile({
        fileBuffer: file.buffer,
        fileLocalPath: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        filePath,
      });

      return {
        fileKey: fileName,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        path: filePath,
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.status(201).json({
      success: true,
      message: "Files uploaded successfully",
      data: {
        files: uploadedFiles,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получить ссылку для скачивания файла по ID
 * ПРОВЕРКА ПРАВ ДОСТУПА через связанную сущность
 */
export const getFileById = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    // Импортируем модель File
    const { File } = await import("../models/index.js");

    // Находим файл по ID
    const file = await File.findOne({
      where: {
        id: fileId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new AppError("Файл не найден", 404);
    }

    // ПРОВЕРКА ПРАВ ДОСТУПА
    await checkFileAccess(file, req.user);

    if (file.isEncrypted) {
      return res.json({
        success: true,
        data: {
          url: buildFileProxyUrl(req, file.id, "attachment"),
          fileName: file.fileName || file.originalName,
        },
      });
    }

    const downloadData = await storageProvider.getDownloadUrl(file.filePath, {
      expiresIn: 3600,
      fileName: file.fileName || file.originalName,
    });

    res.json({
      success: true,
      data: {
        url: downloadData.url,
        fileName: file.fileName || file.originalName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получить ссылку для скачивания файла по fileKey
 * ПРОВЕРКА ПРАВ ДОСТУПА через связанную сущность
 */
export const getFile = async (req, res, next) => {
  try {
    const { fileKey } = req.params;

    // Импортируем модель File
    const { File } = await import("../models/index.js");

    // Ищем файл по fileKey в БД для проверки прав
    const file = await File.findOne({
      where: {
        fileKey: fileKey,
        isDeleted: false,
      },
    });

    // Если файл найден в БД - проверяем права
    if (file) {
      await checkFileAccess(file, req.user);

      if (file.isEncrypted) {
        return res.json({
          success: true,
          data: {
            url: buildFileProxyUrl(req, file.id, "attachment"),
            fileName: file.fileName || file.originalName || fileKey,
          },
        });
      }
    } else {
      // Файл не в БД - только админы могут получить доступ
      if (req.user.role !== "admin") {
        throw new AppError("Файл не найден или нет прав доступа", 404);
      }
    }

    const filePath = storageProvider.resolvePath(fileKey);
    const downloadData = await storageProvider.getDownloadUrl(filePath, {
      expiresIn: 3600,
      fileName: fileKey,
    });

    res.json({
      success: true,
      data: {
        url: downloadData.url,
        fileName: fileKey,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получить публичную ссылку на файл
 * ПРОВЕРКА ПРАВ ДОСТУПА через связанную сущность
 */
export const getPublicLink = async (req, res, next) => {
  try {
    const { fileKey } = req.params;

    // Импортируем модель File
    const { File } = await import("../models/index.js");

    // Ищем файл по fileKey в БД для проверки прав
    const file = await File.findOne({
      where: {
        fileKey: fileKey,
        isDeleted: false,
      },
    });

    // Если файл найден в БД - проверяем права
    if (file) {
      await checkFileAccess(file, req.user);

      if (file.isEncrypted) {
        return res.json({
          success: true,
          data: {
            publicUrl: buildFileProxyUrl(req, file.id, "inline"),
            fileName: file.fileName || file.originalName || fileKey,
          },
        });
      }
    } else {
      // Файл не в БД - только админы могут получить доступ
      if (req.user.role !== "admin") {
        throw new AppError("Файл не найден или нет прав доступа", 404);
      }
    }

    const filePath = storageProvider.resolvePath(fileKey);
    const publicLink = await storageProvider.getPublicUrl(filePath, {
      expiresIn: 86400,
    });

    res.json({
      success: true,
      data: {
        publicUrl: publicLink.url,
        fileName: fileKey,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Удалить файл
 * ТОЛЬКО АДМИНИСТРАТОРЫ могут удалять файлы напрямую
 */
export const deleteFile = async (req, res, next) => {
  try {
    // Только админы могут удалять файлы напрямую по ключу
    // Обычные пользователи должны использовать /employees/:id/files/:fileId
    if (req.user.role !== "admin") {
      throw new AppError(
        "Удаление файлов напрямую доступно только администраторам",
        403,
      );
    }

    const { fileKey } = req.params;
    const filePath = storageProvider.resolvePath(fileKey);
    await storageProvider.deleteFile(filePath);

    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
