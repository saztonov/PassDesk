const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureNoSlash = (value) => String(value || "").replace(/\/+$/, "");

export const skudConfig = {
  enabled: toBool(process.env.SKUD_ENABLED, false),
  provider: String(process.env.SKUD_PROVIDER || "sigur").trim().toLowerCase(),
  sigur: {
    baseUrl: ensureNoSlash(process.env.SKUD_SIGUR_BASE_URL || ""),
    username: String(process.env.SKUD_SIGUR_USERNAME || "").trim(),
    password: String(process.env.SKUD_SIGUR_PASSWORD || "").trim(),
    timeoutMs: toInt(process.env.SKUD_SIGUR_TIMEOUT_MS, 15000),
  },
  queue: {
    redisHost: String(process.env.REDIS_HOST || "redis").trim(),
    redisPort: toInt(process.env.REDIS_PORT, 6379),
    redisPassword: String(process.env.REDIS_PASSWORD || "").trim(),
    concurrency: Math.max(1, toInt(process.env.SKUD_SYNC_CONCURRENCY, 2)),
    retryLimit: Math.max(1, toInt(process.env.SKUD_SYNC_RETRY_LIMIT, 5)),
  },
  qr: {
    hmacSecret: String(process.env.SKUD_QR_HMAC_SECRET || "").trim(),
    persistentTtlSeconds: Math.max(
      60,
      toInt(process.env.SKUD_QR_PERSISTENT_TTL_SECONDS, 3600),
    ),
    oneTimeTtlSeconds: Math.max(
      30,
      toInt(process.env.SKUD_QR_ONE_TIME_TTL_SECONDS, 300),
    ),
  },
  webhook: {
    basicUser: String(process.env.SKUD_WEBHOOK_BASIC_USER || "").trim(),
    basicPass: String(process.env.SKUD_WEBHOOK_BASIC_PASS || "").trim(),
    allowedIps: String(process.env.SKUD_WEBHOOK_ALLOWED_IPS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  },
};

export const isSkudEnabled = () => skudConfig.enabled;

export const ensureSkudEnabled = () => {
  if (!skudConfig.enabled) {
    throw new Error("SKUD module is disabled");
  }
};
