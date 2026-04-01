import { OtInstruction, File } from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { assertOtAccess } from "../utils/otAccess.js";
import { uploadOtFile } from "../services/otFileService.js";
import storageProvider from "../config/storage.js";

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const normalizeInstructionText = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const toBoolean = (value) => {
  if (value === true || value === false) return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const cleanupFile = async (fileId) => {
  if (!fileId) return;

  const file = await File.findByPk(fileId);
  if (!file || file.isDeleted) {
    return;
  }

  await file.update({ isDeleted: true });

  try {
    await storageProvider.deleteFile(file.filePath);
  } catch (deleteError) {
    console.warn(
      "Warning deleting OT instruction file from storage:",
      deleteError?.message || deleteError,
    );
  }
};

export const getOtInstructions = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const instructions = await OtInstruction.findAll({
      include: [
        {
          model: File,
          as: "file",
          attributes: [
            "id",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
            "isDeleted",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: instructions,
    });
  } catch (error) {
    console.error("Error fetching OT instructions:", error);
    next(error);
  }
};

export const createOtInstruction = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const text = normalizeInstructionText(req.body?.text);

    if (!text && !req.file) {
      throw new AppError("Нужно указать текст или файл", 400);
    }

    let fileRecord = null;
    if (req.file) {
      fileRecord = await uploadOtFile({
        file: req.file,
        folderParts: ["instructions"],
        uploadedBy: req.user.id,
        entityType: "other",
      });
    }

    const instruction = await OtInstruction.create({
      text,
      fileId: fileRecord?.id || null,
    });

    res.status(201).json({
      success: true,
      message: "Инструкция добавлена",
      data: instruction,
    });
  } catch (error) {
    console.error("Error creating OT instruction:", error);
    next(error);
  }
};

export const updateOtInstruction = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;
    const instruction = await OtInstruction.findByPk(id);
    if (!instruction) {
      throw new AppError("Инструкция не найдена", 404);
    }

    const hasTextField = hasOwn(req.body, "text");
    const removeFile = toBoolean(req.body?.removeFile);
    const hasNewFile = !!req.file;

    if (!hasTextField && !removeFile && !hasNewFile) {
      throw new AppError("Нет данных для обновления", 400);
    }

    const nextText = hasTextField
      ? normalizeInstructionText(req.body?.text)
      : instruction.text;

    let nextFileId = instruction.fileId;
    let fileToCleanupId = null;

    if (removeFile && instruction.fileId) {
      fileToCleanupId = instruction.fileId;
      nextFileId = null;
    }

    if (hasNewFile) {
      const uploadedFile = await uploadOtFile({
        file: req.file,
        folderParts: ["instructions"],
        uploadedBy: req.user.id,
        entityType: "other",
      });

      if (
        !fileToCleanupId &&
        instruction.fileId &&
        instruction.fileId !== uploadedFile.id
      ) {
        fileToCleanupId = instruction.fileId;
      }

      nextFileId = uploadedFile.id;
    }

    if (!nextText && !nextFileId) {
      throw new AppError("Нужно указать текст или файл", 400);
    }

    await instruction.update({
      text: nextText,
      fileId: nextFileId,
    });

    if (fileToCleanupId) {
      await cleanupFile(fileToCleanupId);
    }

    const refreshedInstruction = await OtInstruction.findByPk(instruction.id, {
      include: [
        {
          model: File,
          as: "file",
          attributes: [
            "id",
            "fileName",
            "originalName",
            "mimeType",
            "fileSize",
            "isDeleted",
          ],
        },
      ],
    });

    res.json({
      success: true,
      message: "Инструкция обновлена",
      data: refreshedInstruction,
    });
  } catch (error) {
    console.error("Error updating OT instruction:", error);
    next(error);
  }
};

export const deleteOtInstruction = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { id } = req.params;
    const instruction = await OtInstruction.findByPk(id);
    if (!instruction) {
      throw new AppError("Инструкция не найдена", 404);
    }

    const fileId = instruction.fileId;
    await instruction.destroy();
    await cleanupFile(fileId);

    res.json({
      success: true,
      message: "Инструкция удалена",
    });
  } catch (error) {
    console.error("Error deleting OT instruction:", error);
    next(error);
  }
};

export const downloadOtInstructionFile = async (req, res, next) => {
  try {
    await assertOtAccess(req.user);

    const { id } = req.params;

    const instruction = await OtInstruction.findByPk(id);
    if (!instruction) {
      throw new AppError("Инструкция не найдена", 404);
    }

    if (!instruction.fileId) {
      throw new AppError("Файл не найден", 404);
    }

    const file = await File.findByPk(instruction.fileId);
    if (!file || file.isDeleted) {
      throw new AppError("Файл не найден", 404);
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
    console.error("Error downloading OT instruction file:", error);
    next(error);
  }
};
