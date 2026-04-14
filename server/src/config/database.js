import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isSslEnabled = process.env.DB_SSL === 'true';
const caFromEnv = process.env.DB_SSL_CA
  ? process.env.DB_SSL_CA.replace(/\\n/g, '\n')
  : null;
const certPath = process.env.DB_SSL_CA_PATH
  ? path.resolve(process.env.DB_SSL_CA_PATH)
  : path.join(__dirname, '../../cert/root.crt');
const hasCertificate = fs.existsSync(certPath);

if (isSslEnabled && !caFromEnv && !hasCertificate) {
  throw new Error(
    `DB_SSL=true, but no CA certificate configured. Provide DB_SSL_CA or DB_SSL_CA_PATH (checked path: ${certPath})`
  );
}

const sslConfig = isSslEnabled
  ? {
      require: true,
      rejectUnauthorized: true,
      ca: caFromEnv || fs.readFileSync(certPath).toString(),
    }
  : false;

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

if (dbPoolMax < 10) {
  console.warn(
    `[db] DB_POOL_MAX=${dbPoolMax} может быть узким местом под нагрузкой API + workers`,
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
    max: Math.max(dbPoolMax, dbPoolMin),
    min: Math.min(dbPoolMin, dbPoolMax),
    acquire: dbPoolAcquireMs,
    idle: dbPoolIdleMs,
    evict: dbPoolEvictMs,
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
