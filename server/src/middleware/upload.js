import multer from "multer";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { AppError } from "./errorHandler.js";

// Функция для исправления кодировки filename (UTF-8 декодированный как ISO-8859-1)
const decodeFilename = (filename) => {
  try {
    // Проверяем, не содержит ли уже кириллицу (значит уже правильный UTF-8)
    if (/[\u0400-\u04FF]/.test(filename)) {
      return filename;
    }

    // Пытаемся декодировать как UTF-8 bytes, которые были неправильно интерпретированы как ISO-8859-1
    const bytes = Buffer.from(filename, "latin1");
    const corrected = bytes.toString("utf8");

    // Проверяем, содержит ли исправленная версия кириллицу
    if (/[\u0400-\u04FF]/.test(corrected)) {
      return corrected;
    }

    // Если исправление не помогло, возвращаем исходное имя
    return filename;
  } catch (error) {
    console.warn("⚠️ Error decoding filename:", filename, error.message);
    return filename;
  }
};

const TMP_UPLOAD_DIR = process.env.UPLOAD_TMP_DIR
  ? path.resolve(process.env.UPLOAD_TMP_DIR)
  : path.join(os.tmpdir(), "passdesk-uploads");

const ensureTmpDir = () => {
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
};

const getUploadedFiles = (req) => {
  if (req.file) {
    return [req.file];
  }

  if (Array.isArray(req.files)) {
    return req.files;
  }

  if (req.files && typeof req.files === "object") {
    return Object.values(req.files).flat().filter(Boolean);
  }

  return [];
};

const readFileHeader = async (filePath, maxBytes = 32) => {
  const fd = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
};

const detectFileKind = (header) => {
  if (!header || header.length < 4) {
    return null;
  }

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "jpeg";
  }

  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return "png";
  }

  if (
    header.length >= 12 &&
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  if (
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  ) {
    return "pdf";
  }

  if (
    header.length >= 8 &&
    header[0] === 0xd0 &&
    header[1] === 0xcf &&
    header[2] === 0x11 &&
    header[3] === 0xe0 &&
    header[4] === 0xa1 &&
    header[5] === 0xb1 &&
    header[6] === 0x1a &&
    header[7] === 0xe1
  ) {
    return "ole";
  }

  if (
    (header[0] === 0x50 &&
      header[1] === 0x4b &&
      header[2] === 0x03 &&
      header[3] === 0x04) ||
    (header[0] === 0x50 &&
      header[1] === 0x4b &&
      header[2] === 0x05 &&
      header[3] === 0x06) ||
    (header[0] === 0x50 &&
      header[1] === 0x4b &&
      header[2] === 0x07 &&
      header[3] === 0x08)
  ) {
    return "zip";
  }

  return null;
};

const FILE_KIND_RULES = {
  jpeg: {
    mimeTypes: new Set(["image/jpeg", "image/jpg"]),
    extensions: new Set([".jpg", ".jpeg"]),
  },
  png: {
    mimeTypes: new Set(["image/png"]),
    extensions: new Set([".png"]),
  },
  webp: {
    mimeTypes: new Set(["image/webp"]),
    extensions: new Set([".webp"]),
  },
  pdf: {
    mimeTypes: new Set(["application/pdf"]),
    extensions: new Set([".pdf"]),
  },
  ole: {
    mimeTypes: new Set(["application/msword", "application/vnd.ms-excel"]),
    extensions: new Set([".doc", ".xls"]),
  },
  zip: {
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
    extensions: new Set([".docx", ".xlsx"]),
  },
};

// Настройка временного хранилища для загрузки файлов
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureTmpDir();
      cb(null, TMP_UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    const originalName = path.basename(file.originalname || "upload");
    const ext = path.extname(originalName).toLowerCase().slice(0, 16);
    cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
  },
});

// Фильтр файлов
const fileFilter = (req, file, cb) => {
  // Разрешенные типы файлов
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/vnd.ms-excel", // XLS
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
    "application/msword", // DOC
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`File type ${file.mimetype} is not allowed`, 400), false);
  }
};

export const MAX_FILES_PER_REQUEST =
  parseInt(process.env.MAX_FILES_PER_REQUEST) || 50;

// Конфигурация multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024, // 20MB default
    files: MAX_FILES_PER_REQUEST,
  },
});

export const readUploadedFileBuffer = async (file) => {
  if (!file) {
    throw new AppError("Файл не передан", 400);
  }

  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }

  if (file.path) {
    return fsp.readFile(file.path);
  }

  throw new AppError("Не удалось прочитать загруженный файл", 400);
};

export const validateUploadedFiles = async (req, _res, next) => {
  try {
    const files = getUploadedFiles(req);
    if (files.length === 0) {
      return next();
    }

    for (const file of files) {
      if (!file.path) {
        throw new AppError("Загруженный файл не содержит временный путь", 400);
      }

      const header = await readFileHeader(file.path, 32);
      const kind = detectFileKind(header);
      if (!kind || !FILE_KIND_RULES[kind]) {
        throw new AppError(
          `Неподдерживаемый или поврежденный файл: ${file.originalname}`,
          400,
        );
      }

      const rule = FILE_KIND_RULES[kind];
      const extension = path
        .extname(path.basename(file.originalname || ""))
        .toLowerCase();

      if (!rule.extensions.has(extension)) {
        throw new AppError(
          `Неверное расширение файла: ${file.originalname}`,
          400,
        );
      }

      if (file.mimetype && !rule.mimeTypes.has(file.mimetype)) {
        throw new AppError(
          `MIME-тип файла не соответствует содержимому: ${file.originalname}`,
          400,
        );
      }
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

export const cleanupUploadedTempFiles = (req, res, next) => {
  if (req.skipUploadCleanup) {
    return next();
  }
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    return next();
  }

  let cleanupStarted = false;
  const cleanup = async () => {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;

    await Promise.all(
      files.map((file) => {
        if (!file?.path) {
          return Promise.resolve();
        }
        return fsp.unlink(file.path).catch(() => Promise.resolve());
      }),
    );
  };

  res.once("finish", () => {
    void cleanup();
  });
  res.once("close", () => {
    void cleanup();
  });

  return next();
};

// Middleware для исправления кодировки filename
export const fixFilenameEncoding = (req, res, next) => {
  try {
    // Исправляем одиночный файл
    if (req.file) {
      req.file.originalname = decodeFilename(req.file.originalname);
      console.log(`📝 Fixed filename encoding: ${req.file.originalname}`);
    }

    // Исправляем несколько файлов
    if (req.files && Array.isArray(req.files)) {
      req.files = req.files.map((file) => ({
        ...file,
        originalname: decodeFilename(file.originalname),
      }));
      console.log(`📝 Fixed ${req.files.length} filename encodings`);
    }

    next();
  } catch (error) {
    console.error("❌ Error in fixFilenameEncoding middleware:", error);
    next(error);
  }
};

export default upload;
