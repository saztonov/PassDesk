import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "../../config/redis.js";
import { skudConfig } from "../../services/skud/skudConfig.js";
import { processSyncEmployeeJob } from "./processors/syncEmployeeProcessor.js";
import { processBlockUnblockJob } from "./processors/blockUnblockProcessor.js";
import { processCardsJob } from "./processors/cardsProcessor.js";
import { processEventsIngestJob } from "./processors/eventsIngestProcessor.js";

export const SKUD_QUEUE_NAMES = {
  sync: "skud.sync",
  blockUnblock: "skud.block-unblock",
  cards: "skud.cards",
  eventsIngest: "skud.events.ingest",
  qrAudit: "skud.qr.audit",
};

let redisConnection = null;
const queues = new Map();
let workersStarted = false;

const isQueueEnabled = () => skudConfig.enabled;

const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }

  return redisConnection;
};

const getQueue = async (name) => {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
    });
    queues.set(name, queue);
  }

  return queues.get(name);
};

const enqueueJob = async (queueName, name, data, attempts = skudConfig.queue.retryLimit, priority = 5) => {
  if (!isQueueEnabled()) {
    return null;
  }

  const queue = await getQueue(queueName);
  return queue.add(name, data, {
    attempts,
    backoff: {
      type: "exponential",
      delay: 1500,
    },
    removeOnComplete: 1000,
    removeOnFail: 2000,
    priority,
  });
};

export const enqueueSkudSyncJob = async (syncJobId, attempts = skudConfig.queue.retryLimit) => {
  return enqueueJob(
    SKUD_QUEUE_NAMES.sync,
    "sync_employee",
    { syncJobId },
    attempts,
    5,
  );
};

export const enqueueSkudBlockUnblockJob = async (
  syncJobId,
  priority = 1,
  attempts = skudConfig.queue.retryLimit,
) => {
  return enqueueJob(
    SKUD_QUEUE_NAMES.blockUnblock,
    "block_unblock",
    { syncJobId },
    attempts,
    priority,
  );
};

export const enqueueSkudCardsJob = async (syncJobId, attempts = skudConfig.queue.retryLimit) => {
  return enqueueJob(SKUD_QUEUE_NAMES.cards, "cards", { syncJobId }, attempts, 5);
};

export const enqueueSkudEventsIngestJob = async (payload, attempts = 3) => {
  return enqueueJob(SKUD_QUEUE_NAMES.eventsIngest, "ingest_event", { payload }, attempts, 5);
};

export const enqueueSkudQRAuditJob = async (payload, attempts = 3) => {
  return enqueueJob(SKUD_QUEUE_NAMES.qrAudit, "qr_audit", { payload }, attempts, 5);
};

export const enqueueSkudSyncJobFallback = async (syncJobId) => {
  return processSyncEmployeeJob({ data: { syncJobId } });
};

export const startSkudWorkers = async () => {
  if (!isQueueEnabled() || workersStarted) {
    return;
  }

  const connection = getRedisConnection();
  await connection.connect();

  const workerOptions = {
    connection,
    concurrency: skudConfig.queue.concurrency,
  };

  const syncWorker = new Worker(
    SKUD_QUEUE_NAMES.sync,
    async (job) => processSyncEmployeeJob(job),
    workerOptions,
  );

  const blockUnblockWorker = new Worker(
    SKUD_QUEUE_NAMES.blockUnblock,
    async (job) => processBlockUnblockJob(job),
    {
      ...workerOptions,
      concurrency: Math.max(1, skudConfig.queue.concurrency),
    },
  );

  const cardsWorker = new Worker(
    SKUD_QUEUE_NAMES.cards,
    async (job) => processCardsJob(job),
    workerOptions,
  );

  const eventsWorker = new Worker(
    SKUD_QUEUE_NAMES.eventsIngest,
    async (job) => processEventsIngestJob(job),
    workerOptions,
  );

  const qrAuditWorker = new Worker(
    SKUD_QUEUE_NAMES.qrAudit,
    async (job) => processEventsIngestJob(job),
    workerOptions,
  );

  const logWorkerError = (name) => (error) => {
    console.error(`SKUD queue worker error [${name}]:`, error?.message || error);
  };

  syncWorker.on("error", logWorkerError("sync"));
  blockUnblockWorker.on("error", logWorkerError("block-unblock"));
  cardsWorker.on("error", logWorkerError("cards"));
  eventsWorker.on("error", logWorkerError("events"));
  qrAuditWorker.on("error", logWorkerError("qr-audit"));

  workersStarted = true;
};
