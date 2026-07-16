import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "../../config/redis.js";
import axios from "axios";
import { Employee, File } from "../../models/index.js";
import storageProvider from "../../config/storage.js";
import {
  isOcrSupportedDocumentType,
  normalizeDocumentType,
  recognizeDocument,
} from "../../services/ocr/ocrService.js";
import { assertRequiredOcrFields } from "./resultValidation.js";
import {
  OCR_BACKOFF_BASE_MS,
  OCR_BACKOFF_TYPE,
  ocrBackoffStrategy,
} from "./backoff.js";
import { convertPdfFirstPageToImageDataUrl } from "../../services/pdf/pdfToImageService.js";

export const OCR_QUEUE_NAME = "employee.files.ocr";

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const ocrQueueConfig = {
  enabled: toBool(process.env.OCR_QUEUE_ENABLED, true),
  concurrency: Math.max(1, Number.parseInt(String(process.env.OCR_QUEUE_CONCURRENCY || "2"), 10)),
  retryLimit: Math.max(1, Number.parseInt(String(process.env.OCR_QUEUE_RETRY_LIMIT || "3"), 10)),
};


const OCR_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const OCR_SUPPORTED_SOURCE_MIME_TYPES = new Set([
  ...OCR_SUPPORTED_IMAGE_MIME_TYPES,
  "application/pdf",
]);

const MAX_IMAGE_SIZE_BYTES = Number(
  process.env.OCR_MAX_FILE_SIZE || 12 * 1024 * 1024,
);

let redisConnection = null;
let ocrQueue = null;
let workersStarted = false;
let ocrWorker = null;

const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
};

const getQueue = async () => {
  if (!ocrQueue) {
    ocrQueue = new Queue(OCR_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return ocrQueue;
};

const getQueueKey = (employeeId) => `employee_ocr_queue:${employeeId}`;

const ensureSupportedOcrMimeType = (mimeType = "") => {
  const normalizedMimeType = String(mimeType).toLowerCase();
  if (!OCR_SUPPORTED_SOURCE_MIME_TYPES.has(normalizedMimeType)) {
    throw new Error("OCR поддерживает только фото/PDF (jpg, jpeg, png, webp, pdf)");
  }
};

const ensureFileSize = (size) => {
  if (!size || size <= 0) {
    throw new Error("Пустой файл не поддерживается");
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Файл превышает лимит OCR (${Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB)`,
    );
  }
};

const buildImageDataUrl = (buffer, mimeType) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

const fetchStoredFileBuffer = async (filePath) => {
  if (typeof storageProvider.getFileBuffer === "function") {
    return storageProvider.getFileBuffer(filePath);
  }

  if (typeof storageProvider.getDownloadUrl !== "function") {
    throw new Error("Текущий storage-провайдер не поддерживает чтение файла");
  }

  const download = await storageProvider.getDownloadUrl(filePath);
  if (!download?.url) {
    throw new Error("Не удалось получить ссылку на файл");
  }

  const response = await axios.get(download.url, {
    responseType: "arraybuffer",
  });

  return Buffer.from(response.data);
};

const tryDecryptFileBuffer = async (buffer, fileRecord) => {
  if (fileRecord.isEncrypted !== true) {
    return buffer;
  }

  const module = await import("../../services/fileEncryptionService.js");
  if (typeof module.decryptFileBuffer !== "function") {
    throw new Error("decryptFileBuffer export not found");
  }

  return module.decryptFileBuffer(buffer, {
    encryptionAlgorithm: fileRecord.encryptionAlgorithm,
    encryptionKeyVersion: fileRecord.encryptionKeyVersion,
    encryptionIv: fileRecord.encryptionIv,
    encryptionTag: fileRecord.encryptionTag,
    documentType: fileRecord.documentType,
  });
};

export const enqueueEmployeeOcrJob = async ({
  employeeId,
  fileId,
  documentType,
  fileName = null,
  force = false,
}) => {
  if (!ocrQueueConfig.enabled) {
    return null;
  }

  const queue = await getQueue();
  const job = await queue.add(
    "employee_file_ocr",
    {
      employeeId,
      fileId,
      documentType,
      fileName,
      force,
    },
    {
      attempts: ocrQueueConfig.retryLimit,
      backoff: { type: OCR_BACKOFF_TYPE, delay: OCR_BACKOFF_BASE_MS },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  );

  const redis = getRedisConnection();
  if (employeeId) {
    await redis.sadd(getQueueKey(employeeId), String(job.id));
  }
  return job;
};

export const listEmployeeOcrQueue = async (employeeId) => {
  if (!ocrQueueConfig.enabled) {
    return [];
  }

  const redis = getRedisConnection();
  const queue = await getQueue();
  const jobIds = await redis.smembers(getQueueKey(employeeId));

  const results = [];

  for (const jobId of jobIds) {
    const job = await queue.getJob(jobId);
    if (!job) {
      await redis.srem(getQueueKey(employeeId), jobId);
      continue;
    }
    const state = await job.getState();
    const attempts = Number(job.attemptsMade || 0);
    const maxAttempts = Number(job.opts?.attempts || ocrQueueConfig.retryLimit);
    const createdAt = Number.isFinite(job.timestamp)
      ? new Date(job.timestamp).toISOString()
      : null;
    const processedAt = Number.isFinite(job.processedOn)
      ? new Date(job.processedOn).toISOString()
      : null;
    const finishedAt = Number.isFinite(job.finishedOn)
      ? new Date(job.finishedOn).toISOString()
      : null;
    const ageMs = Number.isFinite(job.timestamp)
      ? Math.max(0, Date.now() - job.timestamp)
      : null;
    const skipReason =
      job.returnvalue &&
      typeof job.returnvalue === "object" &&
      job.returnvalue.skipped
        ? String(job.returnvalue.reason || "skipped")
        : null;
    results.push({
      id: String(job.id),
      fileId: job.data?.fileId || null,
      fileName: job.data?.fileName || null,
      documentType: job.data?.documentType || "other",
      status: state,
      attempts,
      maxAttempts,
      error: job.failedReason || null,
      createdAt,
      processedAt,
      finishedAt,
      ageMs,
      skipReason,
    });
  }

  return results;
};

const processOcrJob = async (job) => {
  const { fileId, employeeId, documentType, force } = job.data || {};

  if (!fileId) {
    throw new Error("Invalid OCR job payload");
  }

  const fileRecord = await File.findOne({
    where: {
      id: fileId,
      isDeleted: false,
    },
  });

  if (!fileRecord) {
    throw new Error("File not found");
  }

  if (fileRecord.entityType !== "employee") {
    return { skipped: true, reason: "unsupported_entity" };
  }

  if (!force && fileRecord.ocrVerified && fileRecord.ocrResultJson) {
    return { skipped: true, reason: "already_verified" };
  }

  let normalizedDocumentType = normalizeDocumentType(
    documentType || fileRecord.documentType,
  );

  // Канал 3.2: для file.documentType === "passport" нормализация даёт
  // "passport_rf" по умолчанию. Но если сотрудник иностранец, OCR должен
  // идти как foreign_passport (без ФИО, см. фикс 3.1). Выбираем по
  // employee.passportType.
  if (normalizedDocumentType === "passport_rf") {
    const employeeIdForType =
      employeeId || fileRecord.employeeId || fileRecord.entityId;
    if (employeeIdForType) {
      try {
        const employee = await Employee.findOne({
          where: { id: employeeIdForType, isDeleted: false },
          attributes: ["id", "passportType"],
        });
        if (employee?.passportType === "foreign") {
          normalizedDocumentType = "foreign_passport";
        }
      } catch (error) {
        console.warn("[ocr] failed to resolve passportType for OCR routing", {
          employeeId: employeeIdForType,
          message: error?.message || "unknown error",
        });
      }
    }
  }

  if (!isOcrSupportedDocumentType(normalizedDocumentType)) {
    return { skipped: true, reason: "unsupported_document_type" };
  }

  const normalizedMimeType = String(fileRecord.mimeType || "").toLowerCase();
  ensureSupportedOcrMimeType(normalizedMimeType);
  ensureFileSize(fileRecord.fileSize || 0);

  const storedBuffer = await fetchStoredFileBuffer(fileRecord.filePath);
  const decryptedBuffer = await tryDecryptFileBuffer(storedBuffer, fileRecord);
  const imageDataUrl =
    normalizedMimeType === "application/pdf"
      ? await (async () => {
          try {
            return await convertPdfFirstPageToImageDataUrl({
              pdfBuffer: decryptedBuffer,
            });
          } catch (error) {
            throw new Error(
              `PDF OCR preprocessing failed: ${error?.message || "unknown error"}`,
            );
          }
        })()
      : buildImageDataUrl(decryptedBuffer, fileRecord.mimeType);
  const result = await recognizeDocument({
    documentType: normalizedDocumentType,
    imageDataUrl,
    fileId,
  });

  // Канал 3.3: если quality gate провален (сейчас актуально только для
  // passport_translation), записываем JSON для диагностики, но НЕ помечаем
  // ocr_verified=TRUE. Клиент при следующем polling не подтянет это как
  // готовый OCR и не применит подозрительные ФИО в форму.
  const gateFailed = result?.qualityGate === "failed";

  if (!gateFailed) {
    assertRequiredOcrFields({
      documentType: normalizedDocumentType,
      normalized: result?.normalized || {},
    });
  }

  const normalizedResult =
    result && typeof result === "object" && !Array.isArray(result)
      ? JSON.stringify(result)
      : null;

  if (gateFailed) {
    await File.sequelize.query(
      `UPDATE files
       SET ocr_verified = FALSE,
           ocr_provider = :provider,
           ocr_result_json = CASE
             WHEN :resultJson IS NULL THEN NULL
             ELSE CAST(:resultJson AS jsonb)
           END
       WHERE id = :fileId`,
      {
        replacements: {
          fileId: fileRecord.id,
          provider: result?.provider || null,
          resultJson: normalizedResult,
        },
      },
    );
    return {
      fileId: fileRecord.id,
      employeeId: employeeId || fileRecord.employeeId,
      documentType: normalizedDocumentType,
      skipped: true,
      reason: "quality_gate_failed",
    };
  }

  await File.sequelize.query(
    `UPDATE files
     SET ocr_verified = TRUE,
         ocr_verified_at = NOW(),
         ocr_provider = :provider,
         ocr_result_json = CASE
           WHEN :resultJson IS NULL THEN NULL
           ELSE CAST(:resultJson AS jsonb)
         END
     WHERE id = :fileId`,
    {
      replacements: {
        fileId: fileRecord.id,
        provider: result?.provider || null,
        resultJson: normalizedResult,
      },
    },
  );

  return {
    fileId: fileRecord.id,
    employeeId: employeeId || fileRecord.employeeId,
    documentType: normalizedDocumentType,
  };
};

export const startOcrWorkers = async () => {
  if (!ocrQueueConfig.enabled || workersStarted) {
    return;
  }

  const connection = getRedisConnection();
  await connection.connect();

  const worker = new Worker(OCR_QUEUE_NAME, async (job) => processOcrJob(job), {
    connection,
    concurrency: ocrQueueConfig.concurrency,
    settings: { backoffStrategy: ocrBackoffStrategy },
  });

  worker.on("completed", async (job) => {
    const employeeId = job?.data?.employeeId;
    if (!employeeId) return;
    // Keep completed job in employee queue set for a short time so UI can show
    // "completed" status before BullMQ cleanup removes the job hash.
    const timer = setTimeout(async () => {
      try {
        await connection.srem(getQueueKey(employeeId), String(job.id));
      } catch {
        // ignore transient cleanup errors
      }
    }, 6000);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });

  worker.on("failed", async (job) => {
    if (!job) return;
    const employeeId = job?.data?.employeeId;
    const attempts = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || ocrQueueConfig.retryLimit;
    if (attempts >= maxAttempts && employeeId) {
      // Keep failed job visible a bit longer so UI can show final error state.
      const timer = setTimeout(async () => {
        try {
          await connection.srem(getQueueKey(employeeId), String(job.id));
        } catch {
          // ignore transient cleanup errors
        }
      }, 12000);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    }
  });

  worker.on("error", (error) => {
    console.error("OCR queue worker error:", error?.message || error);
  });

  ocrWorker = worker;
  workersStarted = true;
};

export const stopOcrWorkers = async () => {
  if (!workersStarted && !ocrWorker) {
    return;
  }

  if (ocrWorker) {
    await ocrWorker.close().catch(() => null);
    ocrWorker = null;
  }

  if (ocrQueue) {
    await ocrQueue.close().catch(() => null);
    ocrQueue = null;
  }

  if (redisConnection) {
    try {
      await redisConnection.quit();
    } catch {
      redisConnection.disconnect();
    }
    redisConnection = null;
  }

  workersStarted = false;
};
