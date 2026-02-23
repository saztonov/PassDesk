import { DocumentType } from "../models/index.js";
import storageProvider from "../config/storage.js";
import { sanitizeFileName } from "../utils/transliterate.js";
import { AppError } from "../middleware/errorHandler.js";
import { QueryTypes } from "sequelize";

const SAMPLE_FILE_MAX_AGE_SECONDS = 60 * 60;
const ALLOWED_SAMPLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

let hasDocumentTypeRequiredColumnCache = null;

const hasDocumentTypeRequiredColumn = async () => {
  if (hasDocumentTypeRequiredColumnCache !== null) {
    return hasDocumentTypeRequiredColumnCache;
  }

  const rows = await DocumentType.sequelize.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_types'
          AND column_name = 'is_required'
      ) AS exists
    `,
    { type: QueryTypes.SELECT },
  );

  hasDocumentTypeRequiredColumnCache = Boolean(rows?.[0]?.exists);
  return hasDocumentTypeRequiredColumnCache;
};

const getDocumentTypeAttributes = (hasRequiredColumn) => [
  "id",
  "code",
  "name",
  "description",
  "sampleUrl",
  "sampleMimeType",
  "sampleFilePath",
  "sampleOriginalName",
  "sampleHighlightedFields",
  "sortOrder",
  "isActive",
  ...(hasRequiredColumn ? ["isRequired"] : []),
  "updatedAt",
];

const normalizeHighlightedFields = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
};

const resolveSampleUrl = async (documentType) => {
  if (documentType.sampleFilePath) {
    try {
      const viewData = await storageProvider.getPublicUrl(
        documentType.sampleFilePath,
        {
          expiresIn: SAMPLE_FILE_MAX_AGE_SECONDS,
        },
      );
      if (viewData?.url) {
        return viewData.url;
      }
    } catch (error) {
      console.error(
        `Error generating signed sample url for document type ${documentType.code}:`,
        error.message,
      );
    }
  }

  return documentType.sampleUrl || null;
};

const formatDocumentType = async (item) => ({
  id: item.id,
  value: item.code,
  label: item.name,
  code: item.code,
  name: item.name,
  description: item.description,
  sampleUrl: await resolveSampleUrl(item),
  sampleMimeType: item.sampleMimeType,
  sampleOriginalName: item.sampleOriginalName,
  hasSample: Boolean(item.sampleFilePath || item.sampleUrl),
  sampleHighlightedFields: normalizeHighlightedFields(
    item.sampleHighlightedFields,
  ),
  sortOrder: item.sortOrder,
  isActive: item.isActive,
  isRequired: Boolean(item?.isRequired),
  updatedAt: item.updatedAt,
});

/**
 * Получение типов документов сотрудника (с ссылками на образцы)
 */
export const getEmployeeDocumentTypes = async (_req, res, next) => {
  try {
    const hasRequiredColumn = await hasDocumentTypeRequiredColumn();
    const documentTypes = await DocumentType.findAll({
      where: { isActive: true },
      attributes: getDocumentTypeAttributes(hasRequiredColumn),
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });

    res.json({
      success: true,
      data: await Promise.all(
        documentTypes.map((item) => formatDocumentType(item)),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получение типов документов для админки
 */
export const getEmployeeDocumentTypesForAdmin = async (_req, res, next) => {
  try {
    const hasRequiredColumn = await hasDocumentTypeRequiredColumn();
    const documentTypes = await DocumentType.findAll({
      attributes: getDocumentTypeAttributes(hasRequiredColumn),
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });

    res.json({
      success: true,
      data: await Promise.all(
        documentTypes.map((item) => formatDocumentType(item)),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновление метаданных типа документа (админ)
 */
export const updateEmployeeDocumentType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hasRequiredColumn = await hasDocumentTypeRequiredColumn();
    const {
      name,
      description,
      sortOrder,
      isActive,
      isRequired,
      sampleHighlightedFields,
    } = req.body;

    const documentType = await DocumentType.findByPk(id, {
      attributes: getDocumentTypeAttributes(hasRequiredColumn),
    });
    if (!documentType) {
      throw new AppError("Тип документа не найден", 404);
    }

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) {
        throw new AppError("Название типа документа не может быть пустым", 400);
      }
      documentType.name = normalizedName;
    }

    if (description !== undefined) {
      documentType.description = description
        ? String(description).trim()
        : null;
    }

    if (sortOrder !== undefined) {
      const numericSortOrder = Number(sortOrder);
      if (!Number.isFinite(numericSortOrder)) {
        throw new AppError("sortOrder должен быть числом", 400);
      }
      documentType.sortOrder = numericSortOrder;
    }

    if (isActive !== undefined) {
      documentType.isActive = Boolean(isActive);
    }

    if (isRequired !== undefined && hasRequiredColumn) {
      documentType.isRequired = Boolean(isRequired);
    }

    if (sampleHighlightedFields !== undefined) {
      documentType.sampleHighlightedFields = normalizeHighlightedFields(
        sampleHighlightedFields,
      );
    }

    await documentType.save();

    res.json({
      success: true,
      message: "Тип документа обновлен",
      data: await formatDocumentType(documentType),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Загрузка файла-образца для типа документа (админ)
 */
export const uploadEmployeeDocumentTypeSample = async (req, res, next) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const hasRequiredColumn = await hasDocumentTypeRequiredColumn();

    if (!file) {
      throw new AppError("Файл образца не передан", 400);
    }

    if (!ALLOWED_SAMPLE_MIME_TYPES.has(file.mimetype)) {
      throw new AppError(
        "Неподдерживаемый формат образца. Допустимы PDF, JPG, PNG, WEBP",
        400,
      );
    }

    const documentType = await DocumentType.findByPk(id, {
      attributes: getDocumentTypeAttributes(hasRequiredColumn),
    });
    if (!documentType) {
      throw new AppError("Тип документа не найден", 404);
    }

    const sanitizedName = sanitizeFileName(file.originalname || "sample");
    const timestamp = Date.now();
    const relativePath = `employee-document-samples/${documentType.code}/${timestamp}_${sanitizedName}`;
    const targetPath = storageProvider.resolvePath(relativePath);

    await storageProvider.uploadFile({
      fileBuffer: file.buffer,
      fileLocalPath: file.path,
      mimeType: file.mimetype,
      originalName: file.originalname,
      filePath: targetPath,
    });

    if (documentType.sampleFilePath) {
      try {
        await storageProvider.deleteFile(documentType.sampleFilePath);
      } catch (error) {
        console.warn(
          `Unable to remove previous sample for ${documentType.code}:`,
          error.message,
        );
      }
    }

    documentType.sampleFilePath = targetPath;
    documentType.sampleOriginalName = file.originalname;
    documentType.sampleMimeType = file.mimetype;
    documentType.sampleUrl = null;
    await documentType.save();

    res.json({
      success: true,
      message: "Образец документа загружен",
      data: await formatDocumentType(documentType),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Удаление файла-образца для типа документа (админ)
 */
export const deleteEmployeeDocumentTypeSample = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hasRequiredColumn = await hasDocumentTypeRequiredColumn();

    const documentType = await DocumentType.findByPk(id, {
      attributes: getDocumentTypeAttributes(hasRequiredColumn),
    });
    if (!documentType) {
      throw new AppError("Тип документа не найден", 404);
    }

    if (documentType.sampleFilePath) {
      try {
        await storageProvider.deleteFile(documentType.sampleFilePath);
      } catch (error) {
        console.warn(
          `Unable to remove sample file for ${documentType.code}:`,
          error.message,
        );
      }
    }

    documentType.sampleFilePath = null;
    documentType.sampleOriginalName = null;
    documentType.sampleMimeType = null;
    documentType.sampleUrl = null;
    await documentType.save();

    res.json({
      success: true,
      message: "Образец документа удален",
      data: await formatDocumentType(documentType),
    });
  } catch (error) {
    next(error);
  }
};
