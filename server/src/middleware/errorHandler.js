import { UnauthorizedAccessLog } from "../models/index.js";
import multer from "multer";

const buildRequestDetails = (req) => {
  const body = req.body && typeof req.body === "object" ? req.body : null;
  const bodyKeys = body ? Object.keys(body) : null;

  return {
    params: req.params || null,
    query: req.query || null,
    bodyKeys,
  };
};

const logUnauthorizedAccess = async (err, req, statusCode) => {
  try {
    await UnauthorizedAccessLog.create({
      userId: req.user?.id || null,
      statusCode,
      method: req.method || "UNKNOWN",
      path: req.originalUrl || req.url || "",
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.headers?.["user-agent"] || null,
      errorMessage: err?.message || null,
      details: buildRequestDetails(req),
    });
  } catch (logError) {
    console.error("Failed to log unauthorized access:", logError.message);
  }
};

export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    const errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors,
    });
  }

  // Sequelize unique constraint error
  if (err.name === "SequelizeUniqueConstraintError") {
    const response = {
      success: false,
      message: "Resource already exists",
    };

    if (process.env.NODE_ENV === "development") {
      response.errors = (err.errors || []).map((item) => ({
        field: item.path,
        message: item.message,
      }));
    }

    return res.status(409).json({
      ...response,
    });
  }

  // PostgreSQL invalid input syntax (e.g. malformed UUID)
  if (err.name === "SequelizeDatabaseError" && err.parent?.code === "22P02") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: [
        {
          field: "id",
          message: "Некорректный формат идентификатора",
        },
      ],
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    logUnauthorizedAccess(err, req, 401);
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    logUnauthorizedAccess(err, req, 401);
    return res.status(401).json({
      success: false,
      message: "Token expired",
    });
  }

  // Custom error
  if (err.statusCode) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      logUnauthorizedAccess(err, req, err.statusCode);
    }
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  if (err instanceof multer.MulterError || err?.name === "MulterError") {
    let message = "Ошибка загрузки файла";
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "Файл слишком большой";
    } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Слишком много файлов в одном запросе";
    }

    return res.status(400).json({
      success: false,
      message,
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
};

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
