import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Shared DB SSL config resolver used by both runtime (database.js) and
 * migration runner (runMigrations.js).
 *
 * Security policy:
 *   - In production (NODE_ENV=production), DB_SSL MUST be set to "true".
 *     If DB_SSL is missing/false, startup fails with a loud error.
 *   - Emergency bypass is possible only via explicit DB_SSL_ALLOW_INSECURE=true.
 *     When bypass is active, a large warning is printed.
 *   - Outside production, DB_SSL=false is allowed (for local dev) and produces
 *     no SSL options.
 *   - When SSL is enabled, a CA certificate MUST be supplied either inline
 *     via DB_SSL_CA or as a file path via DB_SSL_CA_PATH. rejectUnauthorized
 *     is always true — we do not allow self-signed/unverified certs.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/config -> server/
const serverRoot = path.resolve(__dirname, "..", "..");

const isTrue = (value) => String(value ?? "").trim().toLowerCase() === "true";

const INSECURE_BYPASS_BANNER =
  "################################################################\n" +
  "#  ⚠️  DB_SSL_ALLOW_INSECURE=true IS SET IN PRODUCTION         #\n" +
  "#  Database traffic will run UNENCRYPTED.                      #\n" +
  "#  This is a temporary emergency bypass — remove it ASAP.     #\n" +
  "################################################################";

/**
 * Resolve SSL config for a Sequelize/pg Client connection.
 *
 * @param {object} [opts]
 * @param {string} [opts.scope="runtime"] — used in error messages ("runtime" | "migration").
 * @returns {object|false} Sequelize-style ssl config object, or false when SSL is off.
 * @throws {Error} If SSL is required by policy but is disabled, or if SSL is
 *   enabled but no CA certificate is available.
 */
export const resolveDbSslConfig = ({ scope = "runtime" } = {}) => {
  const sslEnabled = isTrue(process.env.DB_SSL);
  const isProduction = process.env.NODE_ENV === "production";
  const allowInsecure = isTrue(process.env.DB_SSL_ALLOW_INSECURE);
  const tag = scope === "migration" ? "[db:migrate]" : "[db]";

  if (!sslEnabled) {
    if (isProduction) {
      if (!allowInsecure) {
        throw new Error(
          `${tag} DB_SSL must be enabled in production. ` +
            `Set DB_SSL=true and provide DB_SSL_CA or DB_SSL_CA_PATH. ` +
            `If you absolutely need to run without TLS (emergency only), ` +
            `set DB_SSL_ALLOW_INSECURE=true explicitly.`,
        );
      }
      console.warn(INSECURE_BYPASS_BANNER);
    }
    return false;
  }

  const caFromEnv = process.env.DB_SSL_CA
    ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
    : null;

  const defaultCertPath = path.resolve(serverRoot, "cert", "root.crt");
  const certPath = process.env.DB_SSL_CA_PATH
    ? path.resolve(process.env.DB_SSL_CA_PATH)
    : defaultCertPath;

  if (!caFromEnv && !fs.existsSync(certPath)) {
    throw new Error(
      `${tag} DB_SSL=true but no CA certificate configured. ` +
        `Provide DB_SSL_CA (inline PEM) or DB_SSL_CA_PATH (path). ` +
        `Default path checked: ${certPath}`,
    );
  }

  return {
    require: true,
    rejectUnauthorized: true,
    ca: caFromEnv || fs.readFileSync(certPath, "utf8"),
  };
};

export default resolveDbSslConfig;
