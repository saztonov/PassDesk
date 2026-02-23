import storageProvider from "../config/storage.js";
import { File } from "../models/index.js";
import { sanitizeFileName, transliterate } from "../utils/transliterate.js";

const buildOtFolderPath = (parts = []) => {
  const safeParts = parts
    .filter(Boolean)
    .map((part) => transliterate(String(part)))
    .map((part) => part.replace(/_+/g, "_"))
    .map((part) => part.replace(/^_+|_+$/g, ""))
    .filter(Boolean);

  const relativePath = ["OT", ...safeParts].join("/");
  return relativePath;
};

export const uploadOtFile = async ({
  file,
  folderParts = [],
  uploadedBy,
  entityType = "other",
  entityId = null,
}) => {
  if (!file) {
    throw new Error("File is required");
  }

  const relativeDirectory = buildOtFolderPath(folderParts);
  const safeFileName = sanitizeFileName(file.originalname);
  const timestamp = Date.now();
  const fileName = `${timestamp}_${safeFileName}`;
  const targetPath = storageProvider.resolvePath(
    `${relativeDirectory}/${fileName}`,
  );

  await storageProvider.uploadFile({
    fileBuffer: file.buffer,
    fileLocalPath: file.path,
    mimeType: file.mimetype,
    originalName: file.originalname,
    filePath: targetPath,
  });

  const fileRecord = await File.create({
    fileKey: fileName,
    fileName: safeFileName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    filePath: targetPath,
    publicUrl: null,
    resourceId: null,
    entityType,
    entityId,
    uploadedBy,
  });

  return fileRecord;
};
