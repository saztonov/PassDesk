/**
 * Clears legacy plaintext values for sensitive employee fields
 * when enc/hash/keyVersion are already present.
 *
 * Usage:
 *   node src/scripts/clearEmployeeSensitiveLegacyPlaintext.js --dry-run
 *   node src/scripts/clearEmployeeSensitiveLegacyPlaintext.js --write
 *   node src/scripts/clearEmployeeSensitiveLegacyPlaintext.js --write --force
 */

import { sequelize } from "../config/database.js";
import {
  isFieldEncryptionEnabled,
  validateFieldEncryptionConfig,
} from "../services/encryptionService.js";
import { shouldKeepEmployeeSensitiveLegacyPlaintext } from "../services/employeeSensitiveFieldService.js";

const HELP_TEXT = `
Clear legacy plaintext for encrypted employee fields.

Options:
  --dry-run   Show counters only, no DB changes (default)
  --write     Apply updates
  --force     Allow write even if FIELD_ENCRYPTION_KEEP_LEGACY_* says keep plaintext
  --help      Show this help
`;

const TARGET_COLUMNS = [
  {
    label: "last_name",
    plain: "last_name",
    enc: "last_name_enc",
    hash: "last_name_hash",
    keyVersion: "last_name_key_version",
  },
  {
    label: "passport_number",
    plain: "passport_number",
    enc: "passport_number_enc",
    hash: "passport_number_hash",
    keyVersion: "passport_number_key_version",
  },
  {
    label: "kig",
    plain: "kig",
    enc: "kig_enc",
    hash: "kig_hash",
    keyVersion: "kig_key_version",
  },
  {
    label: "patent_number",
    plain: "patent_number",
    enc: "patent_number_enc",
    hash: "patent_number_hash",
    keyVersion: "patent_number_key_version",
  },
];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const parseArgs = (argv) => {
  const args = {
    dryRun: true,
    write: false,
    force: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      args.write = false;
      continue;
    }
    if (arg === "--write") {
      args.write = true;
      args.dryRun = false;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--help") {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
};

const getEmployeesColumns = async () => {
  const [rows] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
  `);
  return new Set(rows.map((row) => row.column_name));
};

const buildHasTextCondition = (column) =>
  `${column} IS NOT NULL AND ${column} <> ''`;

const buildReadyCondition = ({ plain, enc, hash, keyVersion }) =>
  `${buildHasTextCondition(plain)}
   AND ${buildHasTextCondition(enc)}
   AND ${buildHasTextCondition(hash)}
   AND ${buildHasTextCondition(keyVersion)}`;

const countByWhere = async (whereSql) => {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*)::int AS count
    FROM public.employees
    WHERE is_deleted = FALSE
      AND (${whereSql})
  `);
  return rows[0]?.count ?? 0;
};

const updateToNull = async (column, whereSql) => {
  const [, metadata] = await sequelize.query(`
    UPDATE public.employees
    SET ${column} = NULL,
        updated_at = NOW()
    WHERE is_deleted = FALSE
      AND (${whereSql})
  `);

  return metadata?.rowCount ?? 0;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (!isFieldEncryptionEnabled()) {
    throw new Error(
      "Field encryption is disabled. Set FIELD_ENCRYPTION_ENABLED=true.",
    );
  }
  validateFieldEncryptionConfig();

  if (
    args.write &&
    !args.force &&
    shouldKeepEmployeeSensitiveLegacyPlaintext()
  ) {
    throw new Error(
      "Legacy plaintext retention is enabled by env. Set FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT=false (or FIELD_ENCRYPTION_KEEP_LEGACY_DOC_PLAINTEXT=false) or use --force.",
    );
  }

  await sequelize.authenticate();
  const columns = await getEmployeesColumns();

  console.log("🔐 Employee legacy plaintext cleanup");
  console.log(`⚙️ Mode: ${args.dryRun ? "DRY-RUN" : "WRITE"}`);

  const results = [];

  for (const target of TARGET_COLUMNS) {
    const missingRequiredColumn = [
      target.plain,
      target.enc,
      target.hash,
      target.keyVersion,
    ].find((column) => !columns.has(column));

    if (missingRequiredColumn) {
      results.push({
        field: target.label,
        available: false,
        missingColumn: missingRequiredColumn,
        plainCount: 0,
        readyCount: 0,
        blockedCount: 0,
        updated: 0,
      });
      continue;
    }

    const plainWhere = buildHasTextCondition(target.plain);
    const readyWhere = buildReadyCondition(target);

    const plainCount = await countByWhere(plainWhere);
    const readyCount = await countByWhere(readyWhere);
    const blockedCount = Math.max(plainCount - readyCount, 0);

    let updated = 0;
    if (args.write && readyCount > 0) {
      updated = await updateToNull(target.plain, readyWhere);
    }

    results.push({
      field: target.label,
      available: true,
      plainCount,
      readyCount,
      blockedCount,
      updated,
    });
  }

  console.log("\nResults (employees, is_deleted=false):");
  for (const row of results) {
    if (!row.available) {
      console.log(
        `  ${row.field}: skipped (missing column: ${row.missingColumn})`,
      );
      continue;
    }
    console.log(
      `  ${row.field}: plaintext=${row.plainCount}, ready=${row.readyCount}, blocked=${row.blockedCount}, ${args.write ? `updated=${row.updated}` : "updated=0"}`,
    );
  }

  const totalUpdated = results.reduce((sum, row) => sum + row.updated, 0);
  const totalBlocked = results.reduce((sum, row) => sum + row.blockedCount, 0);
  console.log(`\nSummary: updated=${totalUpdated}, blocked=${totalBlocked}`);

  await sequelize.close();
};

run().catch(async (error) => {
  console.error("❌ Legacy plaintext cleanup failed:", error.message);
  if (hasOwn(sequelize, "close")) {
    try {
      await sequelize.close();
    } catch {
      // noop
    }
  }
  process.exit(1);
});
