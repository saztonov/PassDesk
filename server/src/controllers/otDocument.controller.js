import { OtDocument, OtCategory, File } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertOtAccess } from '../utils/otAccess.js';
import { uploadOtFile } from '../services/otFileService.js';
import storageProvider from '../config/storage.js';

export const getOtDocuments = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const { categoryId, includeDeleted } = req.query;
    const where = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (includeDeleted !== '1') {
      where.isDeleted = false;
    }

    const documents = await OtDocument.findAll({
      where,
      include: [
        {
          model: OtCategory,
          as: 'category',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    console.error('Error fetching OT documents:', error);
    next(error);
  }
};

export const createOtDocument = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { categoryId, name, description = null, isRequired = false } = req.body;

    if (!categoryId || !name) {
      throw new AppError('categoryId и name обязательны', 400);
    }

    const category = await OtCategory.findByPk(categoryId);
    if (!category || category.isDeleted) {
      throw new AppError('Категория не найдена', 404);
    }

    const document = await OtDocument.create({
      categoryId,
      name,
      description,
      isRequired
    });

    res.status(201).json({
      success: true,
      message: 'Документ создан',
      data: document
    });
  } catch (error) {
    console.error('Error creating OT document:', error);
    next(error);
  }
};

export const updateOtDocument = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;
    const { name, description, isRequired, categoryId } = req.body;

    const document = await OtDocument.findByPk(id);
    if (!document || document.isDeleted) {
      throw new AppError('Документ не найден', 404);
    }

    if (categoryId) {
      const category = await OtCategory.findByPk(categoryId);
      if (!category || category.isDeleted) {
        throw new AppError('Категория не найдена', 404);
      }
    }

    await document.update({
      name: name ?? document.name,
      description: description ?? document.description,
      isRequired: isRequired ?? document.isRequired,
      categoryId: categoryId ?? document.categoryId
    });

    res.json({
      success: true,
      message: 'Документ обновлен',
      data: document
    });
  } catch (error) {
    console.error('Error updating OT document:', error);
    next(error);
  }
};

export const deleteOtDocument = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;

    const document = await OtDocument.findByPk(id);
    if (!document || document.isDeleted) {
      throw new AppError('Документ не найден', 404);
    }

    await document.update({ isDeleted: true });

    res.json({
      success: true,
      message: 'Документ удален'
    });
  } catch (error) {
    console.error('Error deleting OT document:', error);
    next(error);
  }
};

export const uploadOtDocumentTemplate = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;

    if (!req.file) {
      throw new AppError('Файл не предоставлен', 400);
    }

    const document = await OtDocument.findByPk(id);
    if (!document || document.isDeleted) {
      throw new AppError('Документ не найден', 404);
    }

    const fileRecord = await uploadOtFile({
      file: req.file,
      folderParts: ['templates', document.name],
      uploadedBy: req.user.id,
      entityType: 'other',
      entityId: document.id
    });

    await document.update({ templateFileId: fileRecord.id });

    res.status(201).json({
      success: true,
      message: 'Шаблон загружен',
      data: {
        documentId: document.id,
        templateFileId: fileRecord.id
      }
    });
  } catch (error) {
    console.error('Error uploading OT document template:', error);
    next(error);
  }
};

export const downloadOtDocumentTemplate = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const { id } = req.params;

    const document = await OtDocument.findByPk(id);
    if (!document || document.isDeleted) {
      throw new AppError('Документ не найден', 404);
    }

    if (!document.templateFileId) {
      throw new AppError('Шаблон не загружен', 404);
    }

    const file = await File.findByPk(document.templateFileId);
    if (!file || file.isDeleted) {
      throw new AppError('Файл не найден', 404);
    }

    const downloadData = await storageProvider.getDownloadUrl(file.filePath, {
      expiresIn: 3600,
      fileName: file.fileName || file.originalName
    });

    res.json({
      success: true,
      data: {
        url: downloadData.url,
        fileName: file.fileName || file.originalName
      }
    });
  } catch (error) {
    console.error('Error downloading OT document template:', error);
    next(error);
  }
};
