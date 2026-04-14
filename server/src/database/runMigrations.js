import { Client } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const serverRoot = path.resolve(__dirname, "..", "..");

// Приоритет: корневой .env проекта, затем server/.env
dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, ".env"), override: false });

const migrationsDir = path.resolve(__dirname, "..", "..", "migrations");

const isTrue = (value) => String(value || "false").toLowerCase() === "true";

const resolveMigrationSslConfig = () => {
  const sslEnabled = isTrue(process.env.DB_SSL);
  const isProduction = process.env.NODE_ENV === "production";

  if (!sslEnabled) {
    if (isProduction) {
      throw new Error(
        "DB_SSL must be enabled for migration runner in production environment",
      );
    }
    return false;
  }

  const caFromEnv = process.env.DB_SSL_CA
    ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
    : null;
  const certPath = process.env.DB_SSL_CA_PATH
    ? path.resolve(process.env.DB_SSL_CA_PATH)
    : path.resolve(serverRoot, "cert", "root.crt");

  if (!caFromEnv && !fs.existsSync(certPath)) {
    throw new Error(
      `DB_SSL=true but no CA certificate configured for migration runner. Provide DB_SSL_CA or DB_SSL_CA_PATH (checked path: ${certPath})`,
    );
  }

  return {
    require: true,
    rejectUnauthorized: true,
    ca: caFromEnv || fs.readFileSync(certPath, "utf8"),
  };
};

const getDbConfig = () => {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "passdesk",
    user: process.env.DB_USER || "admin",
    password: process.env.DB_PASSWORD || "",
    ssl: resolveMigrationSslConfig(),
  };
};

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const getAppliedMigrations = async (client) => {
  const result = await client.query("SELECT filename FROM schema_migrations");
  return new Set(result.rows.map((row) => row.filename));
};

const getMigrationFiles = () => {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
};

const applyMigration = async (client, filename) => {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, "utf8");
  if (!sql.trim()) {
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
    console.log(`✅ Applied migration: ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Migration failed: ${filename}`);
    throw error;
  }
};

const runMigrations = async () => {
  const client = new Client(getDbConfig());
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();

    for (const filename of files) {
      if (applied.has(filename)) {
        continue;
      }
      await applyMigration(client, filename);
    }
  } finally {
    await client.end();
  }
};

runMigrations().catch((error) => {
  console.error("❌ Migration runner error:", error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
