import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
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
Apply merge plan for legacy dbsu10 -> target database.

Default mode is preview-only. Use --write to apply writes.

Options:
  --write             Apply changes to target DB
  --apply-statuses    Also insert missing statuses for merge candidates
  --help              Show this help
`;

const parseArgs = (argv) => ({
  write: argv.includes("--write"),
  applyStatuses: argv.includes("--apply-statuses"),
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

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const iso = (value) => (value ? new Date(value).toISOString() : null);
const unique = (items) => [...new Set(items.filter(Boolean))];

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
        created_at,
        updated_at
      from public.employees
      order by created_at desc nulls last
    `)
  ).rows;

const loadTargetEmployees = async (client) =>
  (
    await client.query(`
      select
        id::text as id,
        first_name,
        middle_name,
        birth_date,
        phone,
        created_at,
        updated_at
      from public.employees
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

const loadMappings = async (client, tableName, fieldSpecs) => {
  const columns = await getTableColumns(client, tableName);
  const selectParts = ["id::text as id"];
  for (const field of fieldSpecs) {
    if (columns.has(field.column)) {
      selectParts.push(field.select);
    }
  }
  if (columns.has("created_at")) selectParts.push("created_at");
  if (columns.has("updated_at")) selectParts.push("updated_at");

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

const findDuplicateCandidates = (targetEmployees, sourceEmployee) =>
  targetEmployees
    .filter((targetEmployee) => {
      if (targetEmployee.id === sourceEmployee.id) {
        return false;
      }
      return (
        normalizeText(targetEmployee.first_name) ===
          normalizeText(sourceEmployee.first_name) &&
        normalizeText(targetEmployee.middle_name) ===
          normalizeText(sourceEmployee.middle_name) &&
        String(targetEmployee.birth_date || "") ===
          String(sourceEmployee.birth_date || "")
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

const buildPlan = async (sourceClient, targetClient) => {
  const [
    sourceEmployees,
    targetEmployees,
    sourceCounterpartyRows,
    targetCounterpartyRows,
    sourceStatusRows,
    targetStatusRows,
  ] = await Promise.all([
    loadSourceEmployees(sourceClient),
    loadTargetEmployees(targetClient),
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
  ]);

  const targetEmployeeIds = new Set(targetEmployees.map((row) => row.id));
  const sourceOnlyEmployees = sourceEmployees.filter(
    (employee) => !targetEmployeeIds.has(employee.id),
  );

  const actions = [];
  for (const sourceEmployee of sourceOnlyEmployees) {
    if (isTestEmployee(sourceEmployee)) {
      actions.push({
        type: "skip_test",
        source_employee_id: sourceEmployee.id,
        full_name: [sourceEmployee.last_name, sourceEmployee.first_name, sourceEmployee.middle_name]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }

    const candidates = findDuplicateCandidates(targetEmployees, sourceEmployee);
    if (!candidates.length) {
      actions.push({
        type: "manual_insert_review",
        source_employee_id: sourceEmployee.id,
        full_name: [sourceEmployee.last_name, sourceEmployee.first_name, sourceEmployee.middle_name]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }

    const targetEmployee = candidates[0];
    const sourceMappings = sourceCounterpartyRows.filter(
      (row) => row.employee_id === sourceEmployee.id,
    );
    const targetMappings = targetCounterpartyRows.filter(
      (row) => row.employee_id === targetEmployee.id,
    );
    const targetCounterpartyIds = new Set(
      targetMappings.map((row) => row.counterparty_id),
    );

    for (const mapping of sourceMappings) {
      if (targetCounterpartyIds.has(mapping.counterparty_id)) {
        continue;
      }

      actions.push({
        type: "insert_counterparty_mapping",
        source_employee_id: sourceEmployee.id,
        target_employee_id: targetEmployee.id,
        source_mapping_id: mapping.id,
        counterparty_id: mapping.counterparty_id,
        department_id: mapping.department_id || null,
        construction_site_id: mapping.construction_site_id || null,
        dismissed_at: mapping.dismissed_at || null,
      });
    }

    const sourceStatuses = summarizeStatuses(
      sourceStatusRows.filter((row) => row.employee_id === sourceEmployee.id),
    );
    const targetStatuses = summarizeStatuses(
      targetStatusRows.filter((row) => row.employee_id === targetEmployee.id),
    );
    const missingStatuses = sourceStatuses.filter(
      (statusId) => !targetStatuses.includes(statusId),
    );

    if (missingStatuses.length) {
      actions.push({
        type: "manual_status_review",
        source_employee_id: sourceEmployee.id,
        target_employee_id: targetEmployee.id,
        missing_status_ids: missingStatuses,
      });
    }
  }

  return {
    source_only_employees: sourceOnlyEmployees.length,
    actions,
    sourceStatusRows,
  };
};

const applyCounterpartyMapping = async (targetClient, action) => {
  const existing = await targetClient.query(
    `
      select id::text as id
      from public.employee_counterparty_mapping
      where employee_id = $1::uuid
        and counterparty_id = $2::uuid
        and coalesce(construction_site_id::text, '') = coalesce($3, '')
      limit 1
    `,
    [
      action.target_employee_id,
      action.counterparty_id,
      action.construction_site_id,
    ],
  );

  if (existing.rowCount) {
    return { skipped: true, reason: "mapping_already_exists" };
  }

  await targetClient.query(
    `
      insert into public.employee_counterparty_mapping
        (id, employee_id, counterparty_id, department_id, construction_site_id, dismissed_at, created_at, updated_at)
      values
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, now(), now())
    `,
    [
      action.source_mapping_id || randomUUID(),
      action.target_employee_id,
      action.counterparty_id,
      action.department_id,
      action.construction_site_id,
      action.dismissed_at,
    ],
  );

  return { skipped: false };
};

const applyMissingStatuses = async (targetClient, action, sourceStatusRows) => {
  const relevantRows = sourceStatusRows.filter(
    (row) =>
      row.employee_id === action.source_employee_id &&
      action.missing_status_ids.includes(String(row.status_id)),
  );

  for (const row of relevantRows) {
    const exists = await targetClient.query(
      `
        select id::text as id
        from public.employees_statuses_mapping
        where employee_id = $1::uuid and status_id = $2
        limit 1
      `,
      [action.target_employee_id, row.status_id],
    );

    if (exists.rowCount) {
      continue;
    }

    await targetClient.query(
      `
        insert into public.employees_statuses_mapping
          (id, employee_id, status_id, status_group, created_by, updated_by, is_active, is_upload, created_at, updated_at)
        values
          ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8, now(), now())
      `,
      [
        row.id || randomUUID(),
        action.target_employee_id,
        row.status_id,
        row.status_group,
        row.created_by,
        row.updated_by,
        row.is_active ?? false,
        row.is_upload ?? false,
      ],
    );
  }
};

const printReport = (report, args) => {
  console.log("Legacy Merge Apply");
  console.log(`Mode: ${args.write ? "WRITE" : "DRY-RUN"}`);
  console.log(`Apply statuses: ${args.applyStatuses ? "yes" : "no"}`);
  console.log(`Source-only employees: ${report.source_only_employees}`);
  console.log(`Planned actions: ${report.actions.length}`);
  console.log("");

  for (const action of report.actions) {
    if (action.type === "skip_test") {
      console.log(
        `SKIP test employee ${action.source_employee_id} | ${action.full_name}`,
      );
      continue;
    }
    if (action.type === "insert_counterparty_mapping") {
      console.log(
        `ADD counterparty mapping target=${action.target_employee_id} counterparty=${action.counterparty_id}`,
      );
      continue;
    }
    if (action.type === "manual_status_review") {
      console.log(
        `REVIEW statuses source=${action.source_employee_id} target=${action.target_employee_id} missing=${action.missing_status_ids.join(",")}`,
      );
      continue;
    }
    console.log(`${action.type} ${JSON.stringify(action)}`);
  }
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const ssl = buildSslConfig();
  const sourceConfig = buildDbConfig("SOURCE_DB", DEFAULT_SOURCE);
  const targetConfig = buildDbConfig("TARGET_DB", DEFAULT_TARGET);

  const sourceClient = await connect(sourceConfig, ssl);
  const targetClient = await connect(targetConfig, ssl);

  try {
    const report = await buildPlan(sourceClient, targetClient);
    printReport(report, args);

    if (!args.write) {
      return;
    }

    await targetClient.query("begin");
    try {
      for (const action of report.actions) {
        if (action.type === "insert_counterparty_mapping") {
          await applyCounterpartyMapping(targetClient, action);
          continue;
        }
        if (action.type === "manual_status_review" && args.applyStatuses) {
          await applyMissingStatuses(targetClient, action, report.sourceStatusRows);
        }
      }

      await targetClient.query("commit");
      console.log("");
      console.log("Apply completed.");
    } catch (error) {
      await targetClient.query("rollback");
      throw error;
    }
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
};

run().catch((error) => {
  console.error("Legacy merge apply failed:", error.message);
  process.exit(1);
});
