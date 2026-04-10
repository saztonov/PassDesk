import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import fs from "fs/promises";
import {
  File,
  Employee,
  Counterparty,
  EmployeeCounterpartyMapping,
} from "../../models/index.js";
import storageProvider from "../../config/storage.js";
import {
  buildEmployeeFilePath,
  sanitizeFileName,
  formatEmployeeFileName,
  getSafeFileExtension,
} from "../../utils/transliterate.js";
import EmployeeStatusService from "../../services/employeeStatusService.js";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
} from "../../services/auditEventService.js";
import { enqueueEmployeeOcrJob } from "../employeeOcr/queue.js";
import { isOcrSupportedDocumentType } from "../../services/ocr/ocrService.js";

export const UPLOAD_QUEUE_NAME = "employee.files.upload";

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const uploadQueueConfig = {
  enabled: toBool(process.env.UPLOAD_QUEUE_ENABLED, true),
  redisHost: String(process.env.REDIS_HOST || "redis").trim(),
  redisPort: Number.parseInt(String(process.env.REDIS_PORT || "6379"), 10),
  redisPassword: String(process.env.REDIS_PASSWORD || "").trim(),
  concurrency: Math.max(1, Number.parseInt(String(process.env.UPLOAD_QUEUE_CONCURRENCY || "2"), 10)),
  retryLimit: Math.max(1, Number.parseInt(String(process.env.UPLOAD_QUEUE_RETRY_LIMIT || "3"), 10)),
};

let redisConnection = null;
let uploadQueue = null;
let workersStarted = false;

const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = new IORedis({
      host: uploadQueueConfig.redisHost,
      port: uploadQueueConfig.redisPort,
      password: uploadQueueConfig.redisPassword || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return redisConnection;
};

const getQueue = async () => {
  if (!uploadQueue) {
    uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return uploadQueue;
};

const getQueueKey = (employeeId) => `employee_upload_queue:${employeeId}`;

const fetchEmployeeWithMappings = async (employeeId) => {
  return Employee.findByPk(employeeId, {
    include: [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
  });
};

export const enqueueEmployeeFileUpload = async ({
  employeeId,
  documentType,
  userId,
  userRole,
  tempPath,
  originalName,
  mimeType,
  fileSize,
}) => {
  if (!uploadQueueConfig.enabled) {
    return null;
  }

  const queue = await getQueue();
  const job = await queue.add(
    "upload_employee_file",
    {
      employeeId,
      documentType,
      userId,
      userRole,
      tempPath,
      originalName,
      mimeType,
      fileSize,
    },
    {
      attempts: uploadQueueConfig.retryLimit,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 2000,
    },
  );

  const redis = getRedisConnection();
  await redis.sadd(getQueueKey(employeeId), String(job.id));
  return job;
};

export const listEmployeeUploadQueue = async (employeeId) => {
  if (!uploadQueueConfig.enabled) {
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
      fileName: job.data?.originalName || "Файл",
      documentType: job.data?.documentType || "other",
      status: state,
      attempts: job.attemptsMade,
      error: job.failedReason || null,
    });
  }

  return results;
};

const processUploadJob = async (job) => {
  const {
    employeeId,
    documentType,
    userId,
    tempPath,
    originalName,
    mimeType,
    fileSize,
  } = job.data || {};

  if (!employeeId || !tempPath) {
    throw new Error("Invalid job payload");
  }

  const employee = await fetchEmployeeWithMappings(employeeId);
  if (!employee) {
    throw new Error("Employee not found");
  }

  const mapping = employee.employeeCounterpartyMappings?.[0];
  if (!mapping || !mapping.counterparty) {
    throw new Error("Employee counterparty mapping missing");
  }

  const counterparty = mapping.counterparty;
  const relativeDirectory = buildEmployeeFilePath(
    counterparty.name,
    employee.id,
  ).replace(/^\/+/, "");

  const extension = getSafeFileExtension(originalName || "");
  let formattedFileName;
  if (documentType && documentType !== "other") {
    formattedFileName = formatEmployeeFileName(
      documentType,
      employee.lastName,
      employee.firstName,
      employee.middleName,
      extension,
    );
  } else {
    formattedFileName = sanitizeFileName(originalName || "file");
  }

  const timestamp = Date.now();
  const fileName = `${timestamp}_${formattedFileName}`;
  const targetPath = storageProvider.resolvePath(
    `${relativeDirectory}/${fileName}`,
  );

  const buffer = await fs.readFile(tempPath);

  await storageProvider.uploadFile({
    fileBuffer: buffer,
    fileLocalPath: tempPath,
    mimeType: mimeType || "application/octet-stream",
    originalName,
    filePath: targetPath,
  });

  const fileRecord = await File.create({
    fileKey: fileName,
    fileName: formattedFileName,
    originalName,
    mimeType: mimeType || "application/octet-stream",
    fileSize: fileSize || buffer.length,
    filePath: targetPath,
    publicUrl: null,
    resourceId: null,
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    uploadedBy: userId,
    documentType: documentType || null,
  });

  await EmployeeStatusService.resetActiveUploadFlags(employeeId, userId, {
    auditContext: {
      reason: "file_uploaded",
      metadata: {
        documentType: documentType || null,
        filesCount: 1,
      },
    },
  });

  await logAuditEvent({
    userId,
    eventType: AUDIT_EVENT_TYPES.FILE_UPLOADED,
    entityType: "employee",
    entityId: employeeId,
    details: {
      counterpartyId: mapping?.counterpartyId || null,
      counterpartyName: counterparty?.name || null,
      documentType: documentType || null,
      files: [
        {
          id: fileRecord.id,
          fileName: fileRecord.fileName,
          originalName: fileRecord.originalName,
          documentType: fileRecord.documentType || null,
        },
      ],
    },
  });

  await fs.unlink(tempPath).catch(() => null);

  if (isOcrSupportedDocumentType(fileRecord.documentType)) {
    try {
      await enqueueEmployeeOcrJob({
        employeeId,
        fileId: fileRecord.id,
        documentType: fileRecord.documentType,
      });
    } catch (error) {
      console.error("Failed to enqueue OCR job:", error?.message || error);
    }
  }

  return fileRecord;
};

export const startUploadWorkers = async () => {
  if (!uploadQueueConfig.enabled || workersStarted) {
    return;
  }

  const connection = getRedisConnection();
  await connection.connect();

  const worker = new Worker(
    UPLOAD_QUEUE_NAME,
    async (job) => processUploadJob(job),
    {
      connection,
      concurrency: uploadQueueConfig.concurrency,
    },
  );

  worker.on("completed", async (job) => {
    const employeeId = job?.data?.employeeId;
    if (!employeeId) return;
    await connection.srem(getQueueKey(employeeId), String(job.id));
  });

  worker.on("failed", async (job) => {
    if (!job) return;
    const employeeId = job?.data?.employeeId;
    const attempts = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || uploadQueueConfig.retryLimit;
    if (attempts >= maxAttempts && employeeId) {
      await connection.srem(getQueueKey(employeeId), String(job.id));
      if (job.data?.tempPath) {
        await fs.unlink(job.data.tempPath).catch(() => null);
      }
    }
  });

  worker.on("error", (error) => {
    console.error("Upload queue worker error:", error?.message || error);
  });

  workersStarted = true;
};
