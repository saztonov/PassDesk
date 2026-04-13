import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE = {
  host: "c-c9qkm6i7gepcd244jc8c.rw.mdb.yandexcloud.net",
  port: 6432,
  database: "dbsu10",
  user: "denis",
  password: process.env.SOURCE_DB_PASSWORD || process.env.DB_PASSWORD || "",
};

const DEFAULT_TARGET = {
  host: process.env.DB_HOST || "c-c9qmbgvs6rit4qfe0dni.rw.mdb.yandexcloud.net",
  port: Number(process.env.DB_PORT || 6432),
  database: process.env.DB_NAME || "passdesk2",
  user: process.env.DB_USER || "denis",
  password: process.env.TARGET_DB_PASSWORD || process.env.DB_PASSWORD || "",
};

const DEFAULT_CERT_PATH = process.env.DB_SSL_CA_PATH
  ? path.resolve(process.env.DB_SSL_CA_PATH)
  : path.resolve(__dirname, "../../cert/root.crt");

const TEST_NAME_MARKERS = ["тест", "test", "demo", "debug", "sample"];
const TEST_PHONE_MARKERS = new Set([
  "+79999999999",
  "+71222223333",
  "79999999999",
  "71222223333",
]);

const HELP_TEXT = `
Preview merge plan for legacy dbsu10 -> target database.

Environment:
  SOURCE_DB_HOST
  SOURCE_DB_PORT
  SOURCE_DB_NAME
  SOURCE_DB_USER
  SOURCE_DB_PASSWORD
  TARGET_DB_HOST
  TARGET_DB_PORT
  TARGET_DB_NAME
  TARGET_DB_USER
  TARGET_DB_PASSWORD
  DB_SSL=[true|false]
  DB_SSL_CA_PATH=/absolute/path/to/root.crt

Examples:
  node src/scripts/previewLegacyDbMerge.js
  SOURCE_DB_PASSWORD=... TARGET_DB_PASSWORD=... node src/scripts/previewLegacyDbMerge.js --json

Options:
  --json     Print machine-readable JSON in addition to summary
  --help     Show this help
`;

const parseArgs = (argv) => ({
  json: argv.includes("--json"),
  help: argv.includes("--help"),
});

const shouldUseSsl = () =>
  String(process.env.DB_SSL || "true").toLowerCase() !== "false";

const buildSslConfig = () => {
  if (!shouldUseSsl()) {
    return false;
  }

  if (!fs.existsSync(DEFAULT_CERT_PATH)) {
    throw new Error(`SSL certificate not found: ${DEFAULT_CERT_PATH}`);
  }

  return {
    rejectUnauthorized: true,
    ca: fs.readFileSync(DEFAULT_CERT_PATH, "utf8"),
  };
};

const buildDbConfig = (prefix, fallback) => ({
  host: process.env[`${prefix}_HOST`] || fallback.host,
  port: Number(process.env[`${prefix}_PORT`] || fallback.port),
  database: process.env[`${prefix}_NAME`] || fallback.database,
  user: process.env[`${prefix}_USER`] || fallback.user,
  password: process.env[`${prefix}_PASSWORD`] || fallback.password,
});

const iso = (value) => {
  if (!value) return null;
  return new Date(value).toISOString();
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const isTestEmployee = (employee) => {
  const combinedName = [
    employee.last_name,
    employee.first_name,
    employee.middle_name,
  ]
    .map(normalizeText)
    .join(" ");

  const hasTestName = TEST_NAME_MARKERS.some((marker) =>
    combinedName.includes(marker),
  );

  return hasTestName || TEST_PHONE_MARKERS.has(String(employee.phone || "").trim());
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const mapBy = (items, key) => new Map(items.map((item) => [item[key], item]));

const formatDbTarget = (config) =>
  `${config.database}@${config.host}:${config.port} (${config.user})`;

const findDuplicateCandidates = (targetEmployees, sourceEmployee) =>
  targetEmployees
    .filter((targetEmployee) => {
      if (targetEmployee.id === sourceEmployee.id) {
        return false;
      }

      const sameBirthDate =
        String(targetEmployee.birth_date || "") ===
        String(sourceEmployee.birth_date || "");

      return (
        normalizeText(targetEmployee.first_name) ===
          normalizeText(sourceEmployee.first_name) &&
        normalizeText(targetEmployee.middle_name) ===
          normalizeText(sourceEmployee.middle_name) &&
        sameBirthDate
      );
    })
    .sort((left, right) => {
      const leftTs = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTs = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTs - leftTs;
    });

const summarizeStatuses = (statusRows) =>
  unique(statusRows.map((row) => String(row.status_id))).sort(
    (left, right) => Number(left) - Number(right),
  );

const getMissingStatuses = (sourceStatuses, targetStatuses) =>
  sourceStatuses.filter((statusId) => !targetStatuses.includes(statusId));

const getTargetConfig = () => buildDbConfig("TARGET_DB", DEFAULT_TARGET);
const getSourceConfig = () => buildDbConfig("SOURCE_DB", DEFAULT_SOURCE);

const connect = async (dbConfig, ssl) => {
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl,
  });

  await client.connect();
  return client;
};

const loadEmployees = async (client) =>
  (
    await client.query(`
      select
        id::text as id,
        first_name,
        middle_name,
        birth_date,
        phone,
        email,
        created_at,
        updated_at
      from public.employees
    `)
  ).rows;

const loadSourceEmployees = async (client) =>
  (
    await client.query(`
      select
        id::text as id,
        first_name,
        middle_name,
        last_name,
        birth_date,
        phone,
        email,
        passport_number,
        patent_number,
        kig,
        citizenship_id::text as citizenship_id,
        position_id::text as position_id,
        created_at,
        updated_at
      from public.employees
      order by created_at desc nulls last
    `)
  ).rows;

const getTableColumns = async (client, tableName) =>
  new Set(
    (
      await client.query(
        `
          select column_name
          from information_schema.columns
          where table_schema = 'public' and table_name = $1
        `,
        [tableName],
      )
    ).rows.map((row) => row.column_name),
  );

const loadMappings = async (client, tableName, fieldSpecs = []) => {
  const columns = await getTableColumns(client, tableName);
  const selectParts = ["id::text as id"];

  for (const fieldSpec of fieldSpecs) {
    if (columns.has(fieldSpec.column)) {
      selectParts.push(fieldSpec.select);
    }
  }

  if (columns.has("created_at")) {
    selectParts.push("created_at");
  }
  if (columns.has("updated_at")) {
    selectParts.push("updated_at");
  }

  const orderBy = columns.has("updated_at") && columns.has("created_at")
    ? "coalesce(updated_at, created_at) desc nulls last"
    : columns.has("updated_at")
      ? "updated_at desc nulls last"
      : columns.has("created_at")
        ? "created_at desc nulls last"
        : "id desc";

  return (
    await client.query(`
      select
        ${selectParts.join(",\n        ")}
      from public."${tableName}"
      order by ${orderBy}
    `)
  ).rows;
};

const _loadTargetEmployeeCounterpartyRows = async (client, employeeIds) => {
  if (!employeeIds.length) return [];

  return (
    await client.query(
      `
        select
          id::text as id,
          employee_id::text as employee_id,
          counterparty_id::text as counterparty_id,
          department_id::text as department_id,
          construction_site_id::text as construction_site_id,
          dismissed_at,
          created_at,
          updated_at
        from public.employee_counterparty_mapping
        where employee_id = any($1::uuid[])
        order by created_at asc
      `,
      [employeeIds],
    )
  ).rows;
};

const _loadTargetEmployeeStatusRows = async (client, employeeIds) => {
  if (!employeeIds.length) return [];

  return (
    await client.query(
      `
        select
          id::text as id,
          employee_id::text as employee_id,
          status_id,
          status_group,
          is_active,
          is_upload,
          created_at,
          updated_at
        from public.employees_statuses_mapping
        where employee_id = any($1::uuid[])
        order by created_at asc
      `,
      [employeeIds],
    )
  ).rows;
};

const loadReferencePresence = async (client, tableName, ids) => {
  const filteredIds = unique(ids);
  if (!filteredIds.length) return [];

  return (
    await client.query(
      `select id::text as id from public."${tableName}" where id = any($1::uuid[])`,
      [filteredIds],
    )
  ).rows.map((row) => row.id);
};

const buildPlan = async ({ sourceClient, targetClient, sourceConfig, targetConfig }) => {
  const [
    sourceEmployees,
    targetEmployees,
    sourceEmployeeCounterpartyRows,
    targetEmployeeCounterpartyRows,
    sourceStatusRows,
    targetStatusRows,
    sourceFiles,
    targetFiles,
    sourceUserEmployeeRows,
    targetUserEmployeeRows,
  ] = await Promise.all([
    loadSourceEmployees(sourceClient),
    loadEmployees(targetClient),
    loadMappings(sourceClient, "employee_counterparty_mapping", [
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "counterparty_id", select: "counterparty_id::text as counterparty_id" },
      { column: "department_id", select: "department_id::text as department_id" },
      {
        column: "construction_site_id",
        select: "construction_site_id::text as construction_site_id",
      },
      { column: "dismissed_at", select: "dismissed_at" },
    ]),
    loadMappings(targetClient, "employee_counterparty_mapping", [
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "counterparty_id", select: "counterparty_id::text as counterparty_id" },
      { column: "department_id", select: "department_id::text as department_id" },
      {
        column: "construction_site_id",
        select: "construction_site_id::text as construction_site_id",
      },
      { column: "dismissed_at", select: "dismissed_at" },
    ]),
    loadMappings(sourceClient, "employees_statuses_mapping", [
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "status_id", select: "status_id" },
      { column: "status_group", select: "status_group" },
      { column: "created_by", select: "created_by::text as created_by" },
      { column: "updated_by", select: "updated_by::text as updated_by" },
      { column: "is_active", select: "is_active" },
      { column: "is_upload", select: "is_upload" },
    ]),
    loadMappings(targetClient, "employees_statuses_mapping", [
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "status_id", select: "status_id" },
      { column: "status_group", select: "status_group" },
      { column: "created_by", select: "created_by::text as created_by" },
      { column: "updated_by", select: "updated_by::text as updated_by" },
      { column: "is_active", select: "is_active" },
      { column: "is_upload", select: "is_upload" },
    ]),
    loadMappings(sourceClient, "files", [
      { column: "entity_type", select: "entity_type" },
      { column: "entity_id", select: "entity_id::text as entity_id" },
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "document_type", select: "document_type" },
      { column: "file_name", select: "file_name" },
      { column: "original_name", select: "original_name" },
      { column: "file_key", select: "file_key" },
    ]),
    loadMappings(targetClient, "files", [
      { column: "entity_type", select: "entity_type" },
      { column: "entity_id", select: "entity_id::text as entity_id" },
      { column: "employee_id", select: "employee_id::text as employee_id" },
      { column: "document_type", select: "document_type" },
      { column: "file_name", select: "file_name" },
      { column: "original_name", select: "original_name" },
      { column: "file_key", select: "file_key" },
    ]),
    loadMappings(sourceClient, "user_employee_mapping", [
      { column: "user_id", select: "user_id::text as user_id" },
      { column: "employee_id", select: "employee_id::text as employee_id" },
    ]),
    loadMappings(targetClient, "user_employee_mapping", [
      { column: "user_id", select: "user_id::text as user_id" },
      { column: "employee_id", select: "employee_id::text as employee_id" },
    ]),
  ]);

  const sourceEmployeeById = mapBy(sourceEmployees, "id");
  const _targetEmployeeById = mapBy(targetEmployees, "id");
  const targetEmployeeIds = new Set(targetEmployees.map((employee) => employee.id));
  const targetFileIds = new Set(targetFiles.map((row) => row.id));
  const targetMappingIds = new Set(targetEmployeeCounterpartyRows.map((row) => row.id));
  const targetStatusIds = new Set(targetStatusRows.map((row) => row.id));
  const targetUserEmployeeIds = new Set(targetUserEmployeeRows.map((row) => row.id));

  const sourceOnlyEmployees = sourceEmployees.filter(
    (employee) => !targetEmployeeIds.has(employee.id),
  );

  const skipTest = [];
  const mergeExisting = [];
  const insertMissing = [];
  const manualReview = [];

  for (const employee of sourceOnlyEmployees) {
    const sourceMappings = sourceEmployeeCounterpartyRows.filter(
      (row) => row.employee_id === employee.id,
    );
    const sourceStatuses = sourceStatusRows.filter(
      (row) => row.employee_id === employee.id,
    );
    const sourceFilesForEmployee = sourceFiles.filter(
      (row) => row.employee_id === employee.id || row.entity_id === employee.id,
    );
    const sourceUserEmployeeForEmployee = sourceUserEmployeeRows.filter(
      (row) => row.employee_id === employee.id,
    );

    if (isTestEmployee(employee)) {
      skipTest.push({
        source_employee_id: employee.id,
        reason: "test_employee",
        profile: {
          full_name: [employee.last_name, employee.first_name, employee.middle_name]
            .filter(Boolean)
            .join(" "),
          birth_date: iso(employee.birth_date),
          phone: employee.phone,
        },
        related_counts: {
          counterparty_mappings: sourceMappings.length,
          statuses: sourceStatuses.length,
          files: sourceFilesForEmployee.length,
          user_employee_mappings: sourceUserEmployeeForEmployee.length,
        },
      });
      continue;
    }

    const duplicateCandidates = findDuplicateCandidates(targetEmployees, employee);
    if (duplicateCandidates.length) {
      const selectedTarget = duplicateCandidates[0];
      const targetMappings = targetEmployeeCounterpartyRows.filter(
        (row) => row.employee_id === selectedTarget.id,
      );
      const targetStatuses = targetStatusRows.filter(
        (row) => row.employee_id === selectedTarget.id,
      );

      const sourceStatusList = summarizeStatuses(sourceStatuses);
      const targetStatusList = summarizeStatuses(targetStatuses);
      const missingStatuses = getMissingStatuses(sourceStatusList, targetStatusList);
      const sourceCounterpartyIds = unique(
        sourceMappings.map((row) => row.counterparty_id),
      );
      const targetCounterpartyIds = unique(
        targetMappings.map((row) => row.counterparty_id),
      );
      const missingCounterpartyIds = sourceCounterpartyIds.filter(
        (counterpartyId) => !targetCounterpartyIds.includes(counterpartyId),
      );

      const mergeItem = {
        source_employee_id: employee.id,
        target_employee_id: selectedTarget.id,
        match_reason: "same_first_name_middle_name_birth_date",
        source_profile: {
          full_name: [employee.last_name, employee.first_name, employee.middle_name]
            .filter(Boolean)
            .join(" "),
          birth_date: iso(employee.birth_date),
          phone: employee.phone,
          passport_number: employee.passport_number,
          patent_number: employee.patent_number,
          kig: employee.kig,
        },
        target_profile: {
          full_name: [selectedTarget.first_name, selectedTarget.middle_name]
            .filter(Boolean)
            .join(" "),
          birth_date: iso(selectedTarget.birth_date),
          phone: selectedTarget.phone,
        },
        source_counterparty_ids: sourceCounterpartyIds,
        target_counterparty_ids: targetCounterpartyIds,
        missing_counterparty_ids: missingCounterpartyIds,
        source_status_ids: sourceStatusList,
        target_status_ids: targetStatusList,
        missing_status_ids: missingStatuses,
        source_file_ids: sourceFilesForEmployee.map((row) => row.id),
      };

      mergeExisting.push(mergeItem);

      if (missingStatuses.length > 0) {
        manualReview.push({
          type: "status_conflict",
          source_employee_id: employee.id,
          target_employee_id: selectedTarget.id,
          missing_status_ids: missingStatuses,
          source_status_ids: sourceStatusList,
          target_status_ids: targetStatusList,
        });
      }

      continue;
    }

    insertMissing.push({
      source_employee_id: employee.id,
      profile: {
        full_name: [employee.last_name, employee.first_name, employee.middle_name]
          .filter(Boolean)
          .join(" "),
        birth_date: iso(employee.birth_date),
        phone: employee.phone,
      },
      related_counts: {
        counterparty_mappings: sourceMappings.length,
        statuses: sourceStatuses.length,
        files: sourceFilesForEmployee.length,
        user_employee_mappings: sourceUserEmployeeForEmployee.length,
      },
    });
  }

  const sourceOnlyMappings = sourceEmployeeCounterpartyRows.filter(
    (row) => !targetMappingIds.has(row.id),
  );
  const sourceOnlyStatuses = sourceStatusRows.filter(
    (row) => !targetStatusIds.has(row.id),
  );
  const sourceOnlyFiles = sourceFiles.filter((row) => !targetFileIds.has(row.id));
  const sourceOnlyUserEmployeeRows = sourceUserEmployeeRows.filter(
    (row) => !targetUserEmployeeIds.has(row.id),
  );

  const sourceOnlyEmployeeIds = sourceOnlyEmployees.map((employee) => employee.id);
  const _refEmployeeIds = sourceOnlyEmployeeIds.concat(
    mergeExisting.map((item) => item.target_employee_id),
  );
  const refCitizenshipIds = sourceOnlyEmployees.map(
    (employee) => sourceEmployeeById.get(employee.id)?.citizenship_id,
  );
  const refPositionIds = sourceOnlyEmployees.map(
    (employee) => sourceEmployeeById.get(employee.id)?.position_id,
  );
  const refCounterpartyIds = sourceOnlyMappings.map((row) => row.counterparty_id);

  const [existingCitizenshipIds, existingPositionIds, existingCounterpartyIds] =
    await Promise.all([
      loadReferencePresence(targetClient, "citizenships", refCitizenshipIds),
      loadReferencePresence(targetClient, "positions", refPositionIds),
      loadReferencePresence(targetClient, "counterparties", refCounterpartyIds),
    ]);

  return {
    source: formatDbTarget(sourceConfig),
    target: formatDbTarget(targetConfig),
    totals: {
      source_only_employees: sourceOnlyEmployees.length,
      source_only_employee_counterparty_mappings: sourceOnlyMappings.length,
      source_only_employee_statuses: sourceOnlyStatuses.length,
      source_only_files: sourceOnlyFiles.length,
      source_only_user_employee_mappings: sourceOnlyUserEmployeeRows.length,
    },
    plan: {
      skip_test: skipTest,
      merge_existing: mergeExisting,
      insert_missing: insertMissing,
      manual_review: manualReview,
    },
    references: {
      existing_citizenship_ids: existingCitizenshipIds,
      existing_position_ids: existingPositionIds,
      existing_counterparty_ids: existingCounterpartyIds,
    },
  };
};

const printSummary = (report) => {
  console.log("Legacy Merge Preview");
  console.log(`Source: ${report.source}`);
  console.log(`Target: ${report.target}`);
  console.log("");
  console.log("Delta:");
  console.log(`  source_only_employees: ${report.totals.source_only_employees}`);
  console.log(
    `  source_only_employee_counterparty_mappings: ${report.totals.source_only_employee_counterparty_mappings}`,
  );
  console.log(
    `  source_only_employee_statuses: ${report.totals.source_only_employee_statuses}`,
  );
  console.log(`  source_only_files: ${report.totals.source_only_files}`);
  console.log(
    `  source_only_user_employee_mappings: ${report.totals.source_only_user_employee_mappings}`,
  );
  console.log("");
  console.log("Plan:");
  console.log(`  skip_test: ${report.plan.skip_test.length}`);
  console.log(`  merge_existing: ${report.plan.merge_existing.length}`);
  console.log(`  insert_missing: ${report.plan.insert_missing.length}`);
  console.log(`  manual_review: ${report.plan.manual_review.length}`);
  console.log("");

  if (report.plan.skip_test.length) {
    console.log("Skip test employees:");
    for (const item of report.plan.skip_test) {
      console.log(
        `  - ${item.source_employee_id} | ${item.profile.full_name} | phone=${item.profile.phone || "n/a"} | files=${item.related_counts.files}`,
      );
    }
    console.log("");
  }

  if (report.plan.merge_existing.length) {
    console.log("Merge candidates:");
    for (const item of report.plan.merge_existing) {
      console.log(
        `  - source=${item.source_employee_id} -> target=${item.target_employee_id} | missing_counterparties=${item.missing_counterparty_ids.join(",") || "none"} | missing_statuses=${item.missing_status_ids.join(",") || "none"}`,
      );
    }
    console.log("");
  }

  if (report.plan.insert_missing.length) {
    console.log("Insert missing employees:");
    for (const item of report.plan.insert_missing) {
      console.log(`  - ${item.source_employee_id} | ${item.profile.full_name}`);
    }
    console.log("");
  }

  if (report.plan.manual_review.length) {
    console.log("Manual review:");
    for (const item of report.plan.manual_review) {
      console.log(
        `  - ${item.type} | source=${item.source_employee_id} -> target=${item.target_employee_id} | missing_statuses=${item.missing_status_ids.join(",") || "none"}`,
      );
    }
  }
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const ssl = buildSslConfig();
  const sourceConfig = getSourceConfig();
  const targetConfig = getTargetConfig();

  const sourceClient = await connect(sourceConfig, ssl);
  const targetClient = await connect(targetConfig, ssl);

  try {
    const report = await buildPlan({
      sourceClient,
      targetClient,
      sourceConfig,
      targetConfig,
    });

    printSummary(report);

    if (args.json) {
      console.log("");
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
};

run().catch((error) => {
  console.error("Legacy merge preview failed:", error.message);
  process.exit(1);
});
