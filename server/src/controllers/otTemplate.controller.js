import { OtTemplate, File } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertOtAccess } from '../utils/otAccess.js';
import { uploadOtFile } from '../services/otFileService.js';
import storageProvider from '../config/storage.js';

export const getOtTemplates = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const includeDeleted = req.query.includeDeleted === '1';

    const templates = await OtTemplate.findAll({
      where: includeDeleted ? {} : { isDeleted: false },
      include: [
        {
          model: File,
          as: 'file',
          attributes: ['id', 'fileName', 'originalName', 'mimeType', 'fileSize', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching OT templates:', error);
    next(error);
  }
};

export const createOtTemplate = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { name, description = null } = req.body;

    if (!req.file) {
      throw new AppError('Файл не предоставлен', 400);
    }

    const fileRecord = await uploadOtFile({
      file: req.file,
      folderParts: ['templates', name || req.file.originalname],
      uploadedBy: req.user.id,
      entityType: 'other'
    });

    const template = await OtTemplate.create({
      name: name || req.file.originalname,
      description,
      fileId: fileRecord.id
    });

    res.status(201).json({
      success: true,
      message: 'Шаблон загружен',
      data: template
    });
  } catch (error) {
    console.error('Error creating OT template:', error);
    next(error);
  }
};

export const deleteOtTemplate = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;

    const template = await OtTemplate.findByPk(id);
    if (!template || template.isDeleted) {
      throw new AppError('Шаблон не найден', 404);
    }

    await template.update({ isDeleted: true });

    res.json({
      success: true,
      message: 'Шаблон удален'
    });
  } catch (error) {
    console.error('Error deleting OT template:', error);
    next(error);
  }
};

export const downloadOtTemplateFile = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const { id } = req.params;

    const template = await OtTemplate.findByPk(id);
    if (!template || template.isDeleted) {
      throw new AppError('Шаблон не найден', 404);
    }

    const file = await File.findByPk(template.fileId);
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
    console.error('Error downloading OT template file:', error);
    next(error);
  }
};
