import IORedis from "ioredis";

const getRedisOptions = () => ({
  host: String(process.env.REDIS_HOST || "redis").trim(),
  port: Number.parseInt(String(process.env.REDIS_PORT || "6379"), 10),
  password: String(process.env.REDIS_PASSWORD || "").trim() || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

/**
 * Creates a new IORedis connection with standard config.
 * BullMQ requires a dedicated connection per Worker — call this once per worker/queue.
 */
export const createRedisConnection = () => new IORedis(getRedisOptions());
