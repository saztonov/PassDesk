import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import axios from "axios";
import { File } from "../../models/index.js";
import storageProvider from "../../config/storage.js";
import {
  isOcrSupportedDocumentType,
  normalizeDocumentType,
  recognizeDocument,
} from "../../services/ocr/ocrService.js";

export const OCR_QUEUE_NAME = "employee.files.ocr";

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const ocrQueueConfig = {
  enabled: toBool(process.env.OCR_QUEUE_ENABLED, true),
  redisHost: String(process.env.REDIS_HOST || "redis").trim(),
  redisPort: Number.parseInt(String(process.env.REDIS_PORT || "6379"), 10),
  redisPassword: String(process.env.REDIS_PASSWORD || "").trim(),
  concurrency: Math.max(1, Number.parseInt(String(process.env.OCR_QUEUE_CONCURRENCY || "2"), 10)),
  retryLimit: Math.max(1, Number.parseInt(String(process.env.OCR_QUEUE_RETRY_LIMIT || "3"), 10)),
};

const OCR_SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_IMAGE_SIZE_BYTES = Number(
  process.env.OCR_MAX_FILE_SIZE || 12 * 1024 * 1024,
);

let redisConnection = null;
let ocrQueue = null;
let workersStarted = false;

const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = new IORedis({
      host: ocrQueueConfig.redisHost,
      port: ocrQueueConfig.redisPort,
      password: ocrQueueConfig.redisPassword || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
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

const ensureSupportedImageMimeType = (mimeType = "") => {
  if (!OCR_SUPPORTED_MIME_TYPES.has(String(mimeType).toLowerCase())) {
    throw new Error("OCR поддерживает только фото (jpg, jpeg, png, webp)");
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
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 2000,
      removeOnFail: 3000,
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
    results.push({
      id: String(job.id),
      fileId: job.data?.fileId || null,
      fileName: job.data?.fileName || null,
      documentType: job.data?.documentType || "other",
      status: state,
      attempts: job.attemptsMade,
      error: job.failedReason || null,
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

  const normalizedDocumentType = normalizeDocumentType(
    documentType || fileRecord.documentType,
  );

  if (!isOcrSupportedDocumentType(normalizedDocumentType)) {
    return { skipped: true, reason: "unsupported_document_type" };
  }

  ensureSupportedImageMimeType(fileRecord.mimeType || "");
  ensureFileSize(fileRecord.fileSize || 0);

  const storedBuffer = await fetchStoredFileBuffer(fileRecord.filePath);
  const decryptedBuffer = await tryDecryptFileBuffer(storedBuffer, fileRecord);
  const result = await recognizeDocument({
    documentType: normalizedDocumentType,
    imageDataUrl: buildImageDataUrl(decryptedBuffer, fileRecord.mimeType),
  });

  const normalizedResult =
    result && typeof result === "object" && !Array.isArray(result)
      ? JSON.stringify(result)
      : null;

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
      await connection.srem(getQueueKey(employeeId), String(job.id));
    }
  });

  worker.on("error", (error) => {
    console.error("OCR queue worker error:", error?.message || error);
  });

  workersStarted = true;
};
