import { File, Application, Counterparty } from "../models/index.js";
import storageProvider from "../config/storage.js";
import {
  transliterate,
  formatApplicationFileName,
  getSafeFileExtension,
} from "../utils/transliterate.js";
import { AppError } from "../middleware/errorHandler.js";
import { buildFileProxyUrl } from "../services/fileDownloadTokenService.js";

/**
 * Построение пути для файлов заявки
 * @param {string} counterpartyName - Название контрагента
 * @param {string} applicationNumber - Номер заявки
 * @returns {string} - Относительный путь вида /Counterparty_Name/Application_Number
 */
const buildApplicationFilePath = (counterpartyName, applicationNumber) => {
  const transliteratedCounterparty = transliterate(counterpartyName);
  const transliteratedApplicationNumber = transliterate(applicationNumber);

  return `/${transliteratedCounterparty}/${transliteratedApplicationNumber}`;
};

/**
 * Загрузка файлов для заявки
 */
export const uploadApplicationFiles = async (req, res, next) => {
  try {
    const { applicationId } = req.params;

    console.log("📤 Upload request for application:", {
      applicationId,
      filesCount: req.files?.length,
      user: req.user?.id,
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

    // Загружаем данные заявки с контрагентом
    const application = await Application.findOne({
      where: {
        id: applicationId,
        createdBy: req.user.id, // Только свои заявки
      },
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!application) {
      throw new AppError("Заявка не найдена", 404);
    }

    if (!application.counterparty) {
      throw new AppError("У заявки не указан контрагент", 400);
    }

    // Формируем путь: /PassDesk/Counterparty_Name/Application_Number/
    const relativePath = buildApplicationFilePath(
      application.counterparty.name,
      application.applicationNumber,
    ).replace(/^\/+/, "");

    const uploadedFiles = [];
    const errors = [];

    // Загружаем каждый файл
    for (const file of req.files) {
      try {
        console.log(
          `📁 Uploading file: ${file.originalname}, size: ${file.size} bytes`,
        );

        // Получаем расширение файла
        const extension = getSafeFileExtension(file.originalname);

        // Форматируем имя файла для заявки: заявка_номер_контрагент_дата.расширение
        const formattedFileName = formatApplicationFileName(
          application.applicationNumber,
          application.counterparty.name,
          application.createdAt,
          extension,
        );

        const timestamp = Date.now();
        const fileName = `${timestamp}_${formattedFileName}`;
        const filePath = storageProvider.resolvePath(
          `${relativePath}/${fileName}`,
        );

        console.log(`📝 Formatted filename: ${formattedFileName}`);

        await storageProvider.uploadFile({
          fileBuffer: file.buffer,
          fileLocalPath: file.path,
          mimeType: file.mimetype,
          originalName: file.originalname,
          filePath,
        });

        console.log(`✅ File uploaded to storage: ${filePath}`);

        // Сохраняем информацию о файле в БД
        const fileRecord = await File.create({
          fileKey: fileName,
          fileName: formattedFileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: filePath,
          publicUrl: null,
          resourceId: null,
          entityType: "application",
          entityId: applicationId,
          employeeId: null, // Файлы заявки НЕ привязаны к конкретному сотруднику
          uploadedBy: req.user.id,
          documentType: "application_scan", // Тип документа для сканов заявки
        });

        console.log(`✅ File record saved to DB: ${fileRecord.id}`);
        uploadedFiles.push(fileRecord);
      } catch (error) {
        console.error(
          `❌ Error uploading file ${file.originalname}:`,
          error.message,
        );
        errors.push({
          fileName: file.originalname,
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
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

/**
 * Получение списка файлов заявки
 */
export const getApplicationFiles = async (req, res, next) => {
  try {
    const { applicationId } = req.params;

    // Проверяем существование заявки и права доступа
    const application = await Application.findOne({
      where: {
        id: applicationId,
        createdBy: req.user.id, // Только свои заявки
      },
    });

    if (!application) {
      throw new AppError("Заявка не найдена", 404);
    }

    // Получаем все файлы заявки.
    // SEC-NEW-2: filePath и publicUrl удалены из whitelist — утекали
    // внутренний storage-путь и direct URL. Скачивание через /files/proxy/:fileId.
    const files = await File.findAll({
      where: {
        entityType: "application",
        entityId: applicationId,
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
        "createdAt",
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
 * Удаление файла заявки
 */
export const deleteApplicationFile = async (req, res, next) => {
  try {
    const { applicationId, fileId } = req.params;

    // Проверяем, что заявка принадлежит пользователю
    const application = await Application.findOne({
      where: {
        id: applicationId,
        createdBy: req.user.id, // Только свои заявки
      },
    });

    if (!application) {
      throw new AppError("Заявка не найдена", 404);
    }

    // Находим файл
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "application",
        entityId: applicationId,
        isDeleted: false,
      },
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
export const getApplicationFileDownloadLink = async (req, res, next) => {
  try {
    const { applicationId, fileId } = req.params;

    // Проверяем, что заявка принадлежит пользователю
    const application = await Application.findOne({
      where: {
        id: applicationId,
        createdBy: req.user.id, // Только свои заявки
      },
    });

    if (!application) {
      throw new AppError("Заявка не найдена", 404);
    }

    // Находим файл
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "application",
        entityId: applicationId,
        isDeleted: false,
      },
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
export const getApplicationFileViewLink = async (req, res, next) => {
  try {
    const { applicationId, fileId } = req.params;

    // Проверяем, что заявка принадлежит пользователю
    const application = await Application.findOne({
      where: {
        id: applicationId,
        createdBy: req.user.id, // Только свои заявки
      },
    });

    if (!application) {
      throw new AppError("Заявка не найдена", 404);
    }

    // Находим файл
    const file = await File.findOne({
      where: {
        id: fileId,
        entityType: "application",
        entityId: applicationId,
        isDeleted: false,
      },
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
