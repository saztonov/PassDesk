import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { resolveDbSslConfig } from './dbSslConfig.js';

dotenv.config();

// TLS-конфиг: единый helper, который (1) требует DB_SSL=true в production,
// (2) поддерживает explicit bypass через DB_SSL_ALLOW_INSECURE=true с warning,
// (3) требует CA-сертификат когда SSL включён.
// Падение здесь = отказ стартовать сервер, что намеренно для production.
const sslConfig = resolveDbSslConfig({ scope: "runtime" });

const parsePoolInt = (value, fallback, { min = 0 } = {}) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
};

const dbPoolMax = parsePoolInt(process.env.DB_POOL_MAX, 20, { min: 1 });
const dbPoolMin = parsePoolInt(process.env.DB_POOL_MIN, 2, { min: 0 });
const dbPoolAcquireMs = parsePoolInt(process.env.DB_POOL_ACQUIRE_MS, 60000, {
  min: 1000,
});
const dbPoolIdleMs = parsePoolInt(process.env.DB_POOL_IDLE_MS, 20000, {
  min: 1000,
});
const dbPoolEvictMs = parsePoolInt(process.env.DB_POOL_EVICT_MS, 5000, {
  min: 1000,
});

const dbPoolRole = String(process.env.DB_POOL_ROLE || "api")
  .trim()
  .toLowerCase();
const dbPoolRoleKey = dbPoolRole === "worker" ? "WORKER" : "API";
const dbPoolMaxByRole = parsePoolInt(
  process.env[`DB_POOL_MAX_${dbPoolRoleKey}`],
  dbPoolMax,
  { min: 1 },
);
const dbPoolMinByRole = parsePoolInt(
  process.env[`DB_POOL_MIN_${dbPoolRoleKey}`],
  dbPoolMin,
  { min: 0 },
);
const dbPoolAcquireByRole = parsePoolInt(
  process.env[`DB_POOL_ACQUIRE_MS_${dbPoolRoleKey}`],
  dbPoolAcquireMs,
  { min: 1000 },
);
const dbPoolIdleByRole = parsePoolInt(
  process.env[`DB_POOL_IDLE_MS_${dbPoolRoleKey}`],
  dbPoolIdleMs,
  { min: 1000 },
);
const dbPoolEvictByRole = parsePoolInt(
  process.env[`DB_POOL_EVICT_MS_${dbPoolRoleKey}`],
  dbPoolEvictMs,
  { min: 1000 },
);

if (dbPoolMaxByRole < 10) {
  console.warn(
    `[db] DB_POOL_MAX_${dbPoolRoleKey}=${dbPoolMaxByRole} может быть узким местом под нагрузкой`,
  );
}

const config = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: 'postgres',
  dialectOptions: {
    ssl: sslConfig,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: Math.max(dbPoolMaxByRole, dbPoolMinByRole),
    min: Math.min(dbPoolMinByRole, dbPoolMaxByRole),
    acquire: dbPoolAcquireByRole,
    idle: dbPoolIdleByRole,
    evict: dbPoolEvictByRole,
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
};

export const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

export default sequelize;
