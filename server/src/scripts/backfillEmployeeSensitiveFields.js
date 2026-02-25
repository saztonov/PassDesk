/**
 * Backfill enc/hash/keyVersion for sensitive employee fields.
 *
 * Usage:
 *   node src/scripts/backfillEmployeeSensitiveFields.js --dry-run
 *   node src/scripts/backfillEmployeeSensitiveFields.js --batch-size=200 --sleep-ms=50
 *   node src/scripts/backfillEmployeeSensitiveFields.js --limit=1000
 */

import { Employee } from "../models/index.js";
import { sequelize } from "../config/database.js";
import { buildEmployeeSensitiveFieldsPatch } from "../services/employeeSensitiveFieldService.js";
import {
  isFieldEncryptionEnabled,
  validateFieldEncryptionConfig,
} from "../services/encryptionService.js";

const HELP_TEXT = `
Backfill sensitive employee fields (enc/hash/keyVersion)

Options:
  --dry-run            Scan and calculate updates without writing to DB
  --batch-size=<n>     Batch size (default: 200)
  --sleep-ms=<n>       Sleep between batches in ms (default: 0)
  --limit=<n>          Max rows to process (default: unlimited)
  --help               Show this help
`;

const parsePositiveInt = (rawValue, flagName, defaultValue) => {
  if (rawValue === undefined) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const args = {
    dryRun: false,
    batchSize: 200,
    sleepMs: 0,
    limit: Number.POSITIVE_INFINITY,
    help: false,
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (item === "--help") {
      args.help = true;
      continue;
    }
    if (item.startsWith("--batch-size=")) {
      args.batchSize = parsePositiveInt(
        item.split("=")[1],
        "--batch-size",
        args.batchSize,
      );
      continue;
    }
    if (item.startsWith("--sleep-ms=")) {
      const value = item.split("=")[1];
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--sleep-ms must be zero or a positive integer");
      }
      args.sleepMs = parsed;
      continue;
    }
    if (item.startsWith("--limit=")) {
      args.limit = parsePositiveInt(item.split("=")[1], "--limit", args.limit);
      continue;
    }

    throw new Error(`Unknown argument: ${item}`);
  }

  return args;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasEmptyValue = (value) =>
  value === null || value === undefined || value === "";

const fieldNeedsBackfill = (plain, enc, hash, keyVersion) => {
  if (hasEmptyValue(plain)) {
    return false;
  }
  return hasEmptyValue(enc) || hasEmptyValue(hash) || hasEmptyValue(keyVersion);
};

const employeeNeedsBackfill = (employee) =>
  fieldNeedsBackfill(
    employee.lastName,
    employee.lastNameEnc,
    employee.lastNameHash,
    employee.lastNameKeyVersion,
  ) ||
  fieldNeedsBackfill(
    employee.passportNumber,
    employee.passportNumberEnc,
    employee.passportNumberHash,
    employee.passportNumberKeyVersion,
  ) ||
  fieldNeedsBackfill(
    employee.kig,
    employee.kigEnc,
    employee.kigHash,
    employee.kigKeyVersion,
  ) ||
  fieldNeedsBackfill(
    employee.patentNumber,
    employee.patentNumberEnc,
    employee.patentNumberHash,
    employee.patentNumberKeyVersion,
  );

const buildChangedPatch = (employee, patch) => {
  const changedPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (employee[key] !== value) {
      changedPatch[key] = value;
    }
  }
  return changedPatch;
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

const loadLegacyDocPlaintextByIds = async (ids, legacyColumns) => {
  if (!ids.length) {
    return new Map();
  }

  const selectParts = ["id"];
  if (legacyColumns.passportNumber) {
    selectParts.push('passport_number AS "passportNumber"');
  }
  if (legacyColumns.kig) {
    selectParts.push('kig AS "kig"');
  }
  if (legacyColumns.patentNumber) {
    selectParts.push('patent_number AS "patentNumber"');
  }

  if (selectParts.length === 1) {
    return new Map(ids.map((id) => [id, {}]));
  }

  const replacements = {};
  const idPlaceholders = ids.map((id, index) => {
    const key = `id_${index}`;
    replacements[key] = id;
    return `:${key}`;
  });

  const [rows] = await sequelize.query(
    `
      SELECT ${selectParts.join(", ")}
      FROM public.employees
      WHERE id IN (${idPlaceholders.join(", ")})
    `,
    { replacements },
  );

  return new Map(rows.map((row) => [row.id, row]));
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (!isFieldEncryptionEnabled()) {
    throw new Error(
      "Field encryption is disabled. Set FIELD_ENCRYPTION_ENABLED=true before backfill.",
    );
  }
  validateFieldEncryptionConfig();

  await sequelize.authenticate();
  const dbColumns = await getEmployeesColumns();
  const legacyColumns = {
    passportNumber: dbColumns.has("passport_number"),
    kig: dbColumns.has("kig"),
    patentNumber: dbColumns.has("patent_number"),
  };

  if (
    !legacyColumns.passportNumber ||
    !legacyColumns.kig ||
    !legacyColumns.patentNumber
  ) {
    console.log(
      "ℹ️ Legacy plaintext doc columns partially or fully removed; doc backfill runs only for columns still present.",
    );
  }

  const stats = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    processed: 0,
  };
  const errorRows = [];

  let offset = 0;
  let batchNumber = 0;

  console.log("🔄 Starting employee sensitive fields backfill");
  console.log(
    `⚙️ Mode: ${args.dryRun ? "DRY-RUN" : "WRITE"}, batchSize=${args.batchSize}, sleepMs=${args.sleepMs}, limit=${Number.isFinite(args.limit) ? args.limit : "unlimited"}`,
  );

  while (stats.processed < args.limit) {
    const remaining = Number.isFinite(args.limit)
      ? Math.max(args.limit - stats.processed, 0)
      : args.batchSize;
    const currentBatchSize = Number.isFinite(args.limit)
      ? Math.min(args.batchSize, remaining)
      : args.batchSize;
    if (currentBatchSize <= 0) {
      break;
    }

    const rows = await Employee.findAll({
      where: { isDeleted: false },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: currentBatchSize,
      offset,
      attributes: [
        "id",
        "lastName",
        "lastNameEnc",
        "lastNameHash",
        "lastNameKeyVersion",
        "passportNumberEnc",
        "passportNumberHash",
        "passportNumberKeyVersion",
        "kigEnc",
        "kigHash",
        "kigKeyVersion",
        "patentNumberEnc",
        "patentNumberHash",
        "patentNumberKeyVersion",
      ],
    });

    if (rows.length === 0) {
      break;
    }

    batchNumber += 1;
    stats.scanned += rows.length;
    console.log(`📦 Batch #${batchNumber}: loaded ${rows.length} employees`);
    const legacyDocById = await loadLegacyDocPlaintextByIds(
      rows.map((row) => row.id),
      legacyColumns,
    );

    for (const employee of rows) {
      stats.processed += 1;
      const legacyDocPlaintext = legacyDocById.get(employee.id) || {};
      const backfillSource = { ...employee.toJSON(), ...legacyDocPlaintext };
      if (!employeeNeedsBackfill(backfillSource)) {
        continue;
      }

      stats.eligible += 1;
      try {
        const sourcePayload = { lastName: employee.lastName };
        if (legacyColumns.passportNumber) {
          sourcePayload.passportNumber = legacyDocPlaintext.passportNumber;
        }
        if (legacyColumns.kig) {
          sourcePayload.kig = legacyDocPlaintext.kig;
        }
        if (legacyColumns.patentNumber) {
          sourcePayload.patentNumber = legacyDocPlaintext.patentNumber;
        }
        const patch = buildEmployeeSensitiveFieldsPatch(sourcePayload);
        const changedPatch = buildChangedPatch(employee, patch);

        if (Object.keys(changedPatch).length === 0) {
          stats.unchanged += 1;
          continue;
        }

        if (!args.dryRun) {
          await employee.update(changedPatch, {
            fields: Object.keys(changedPatch),
          });
        }
        stats.updated += 1;
      } catch (error) {
        stats.errors += 1;
        errorRows.push({
          employeeId: employee.id,
          message: error.message,
        });
      }
    }

    offset += rows.length;
    if (args.sleepMs > 0) {
      await delay(args.sleepMs);
    }
  }

  console.log("\n✅ Backfill completed");
  console.log(`   scanned: ${stats.scanned}`);
  console.log(`   eligible: ${stats.eligible}`);
  console.log(`   updated: ${stats.updated}`);
  console.log(`   unchanged: ${stats.unchanged}`);
  console.log(`   errors: ${stats.errors}`);

  if (errorRows.length > 0) {
    console.log("\n⚠️ Errors:");
    for (const item of errorRows.slice(0, 50)) {
      console.log(`   employeeId=${item.employeeId} message="${item.message}"`);
    }
    if (errorRows.length > 50) {
      console.log(`   ... and ${errorRows.length - 50} more`);
    }
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Backfill failed:", error.message);
    process.exit(1);
  });
