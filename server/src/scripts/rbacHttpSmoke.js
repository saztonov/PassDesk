import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MATRIX_FILE = path.resolve(__dirname, "../tests/rbac/rbac-matrix.json");
const DEFAULT_BASE_URL = process.env.RBAC_SMOKE_BASE_URL || "http://localhost:5000/api/v1";
const DEFAULT_TIMEOUT_MS = Number(process.env.RBAC_SMOKE_TIMEOUT_MS || 15000);
const DEFAULT_CONCURRENCY = Number(process.env.RBAC_SMOKE_CONCURRENCY || 8);

const ROLE_KEYS = [
  "admin",
  "manager",
  "user",
  "laborer",
  "ot_admin",
  "ot_engineer",
];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_PARAM_VALUE = "00000000-0000-0000-0000-000000000000";

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    includeMutations: args.has("--include-mutations"),
    includeUnauthenticatedChecks: !args.has("--skip-unauth"),
    verbose: args.has("--verbose"),
  };
};

const loadMatrix = () => {
  const raw = fs.readFileSync(MATRIX_FILE, "utf8");
  return JSON.parse(raw);
};

const resolvePathParams = (routePath) =>
  routePath.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
    if (/employee/i.test(name)) {
      return SAFE_PARAM_VALUE;
    }
    if (/user/i.test(name)) {
      return SAFE_PARAM_VALUE;
    }
    if (/counterparty/i.test(name)) {
      return SAFE_PARAM_VALUE;
    }
    if (/fileKey/i.test(name)) {
      return "rbac-smoke-nonexistent-file";
    }
    return SAFE_PARAM_VALUE;
  });

const endpointUrl = (baseUrl, endpointPath) =>
  `${baseUrl.replace(/\/$/, "")}${resolvePathParams(endpointPath)}`;

const shouldSkipEndpoint = (endpoint, includeMutations) => {
  if (endpoint.access === "mobile_session") {
    return true;
  }
  if (!includeMutations && MUTATION_METHODS.has(endpoint.method)) {
    return true;
  }
  return false;
};

const getRoleCredentials = (role) => {
  const prefix = `RBAC_SMOKE_${role.toUpperCase()}`;
  return {
    email: process.env[`${prefix}_EMAIL`],
    password: process.env[`${prefix}_PASSWORD`],
  };
};

const createAbortSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
};

const requestJson = async ({ url, method, headers, body, timeoutMs }) => {
  const { signal, clear } = createAbortSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal,
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      body: text,
    };
  } finally {
    clear();
  }
};

const loginRole = async ({ baseUrl, role, timeoutMs }) => {
  const creds = getRoleCredentials(role);
  if (!creds.email || !creds.password) {
    return { role, skipped: true, reason: "credentials_missing" };
  }

  const response = await requestJson({
    url: `${baseUrl.replace(/\/$/, "")}/auth/login`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
    }),
    timeoutMs,
  });

  if (response.status !== 200) {
    return {
      role,
      skipped: true,
      reason: `login_failed_${response.status}`,
      details: response.body?.slice(0, 500),
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(response.body || "{}");
  } catch (_error) {
    return { role, skipped: true, reason: "login_response_invalid_json" };
  }

  const token = parsed?.data?.token || parsed?.token;
  if (!token) {
    return { role, skipped: true, reason: "token_missing_in_login_response" };
  }

  return { role, token, skipped: false };
};

const buildAuthHeaders = ({ role, token, useBypass }) => {
  if (useBypass) {
    return {
      "x-test-auth-key": process.env.AUTH_TEST_BYPASS_KEY,
      "x-test-role": role,
      "x-test-user-id": `rbac-${role}`,
      "x-test-user-language": "ru",
    };
  }

  return {
    authorization: `Bearer ${token}`,
  };
};

const roleShouldAccess = (endpoint, role) => {
  if (endpoint.access === "public" || endpoint.access === "authenticated") {
    return true;
  }
  if (endpoint.access === "mobile_session") {
    return false;
  }
  return endpoint?.allowedByRole?.[role] === true;
};

const runWithConcurrency = async ({ items, concurrency, worker }) => {
  const queue = [...items];
  const results = [];

  const workers = Array.from({ length: Math.max(1, concurrency) }).map(
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) {
          continue;
        }
        results.push(await worker(next));
      }
    },
  );

  await Promise.all(workers);
  return results;
};

const formatOutcome = (result) =>
  `${result.pass ? "PASS" : "FAIL"} ${result.role} ${result.method} ${result.path} -> ${result.status} (${result.reason})`;

const main = async () => {
  const args = parseArgs();
  const matrix = loadMatrix();
  const baseUrl = DEFAULT_BASE_URL;
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const concurrency = DEFAULT_CONCURRENCY;

  const useBypass =
    process.env.AUTH_TEST_BYPASS === "true" &&
    Boolean(process.env.AUTH_TEST_BYPASS_KEY);

  const endpoints = (matrix?.endpoints || []).filter(
    (endpoint) => !shouldSkipEndpoint(endpoint, args.includeMutations),
  );

  if (endpoints.length === 0) {
    console.error("No endpoints selected for smoke run.");
    process.exit(1);
  }

  const roleSessions = new Map();
  if (!useBypass) {
    for (const role of ROLE_KEYS) {
      const session = await loginRole({ baseUrl, role, timeoutMs });
      roleSessions.set(role, session);
    }
  }

  const skippedRoles = [];
  for (const role of ROLE_KEYS) {
    const session = roleSessions.get(role);
    if (!useBypass && session?.skipped) {
      skippedRoles.push({ role, reason: session.reason, details: session.details });
    }
  }

  const checks = [];

  for (const endpoint of endpoints) {
    for (const role of ROLE_KEYS) {
      const session = roleSessions.get(role);
      if (!useBypass && session?.skipped) {
        continue;
      }
      checks.push({ endpoint, role });
    }

    if (args.includeUnauthenticatedChecks) {
      checks.push({ endpoint, role: "__unauthenticated__" });
    }
  }

  const results = await runWithConcurrency({
    items: checks,
    concurrency,
    worker: async ({ endpoint, role }) => {
      const url = endpointUrl(baseUrl, endpoint.path);
      const headers = {
        accept: "application/json",
      };

      if (MUTATION_METHODS.has(endpoint.method)) {
        headers["content-type"] = "application/json";
      }

      let expectedAllowed = false;

      if (role === "__unauthenticated__") {
        expectedAllowed = endpoint.access === "public";
      } else {
        expectedAllowed = roleShouldAccess(endpoint, role);
        const session = roleSessions.get(role);
        const authHeaders = buildAuthHeaders({
          role,
          token: session?.token,
          useBypass,
        });
        Object.assign(headers, authHeaders);
      }

      const response = await requestJson({
        url,
        method: endpoint.method,
        headers,
        body:
          MUTATION_METHODS.has(endpoint.method) && endpoint.method !== "DELETE"
            ? "{}"
            : undefined,
        timeoutMs,
      }).catch((error) => ({
        status: 0,
        body: String(error?.message || error),
        ok: false,
      }));

      let pass = false;
      let reason = "";

      if (expectedAllowed) {
        pass = response.status !== 401 && response.status !== 403;
        reason = pass ? "allowed_ok" : "allowed_got_auth_error";
      } else {
        pass = response.status === 401 || response.status === 403;
        reason = pass ? "denied_ok" : "denied_not_blocked";
      }

      return {
        pass,
        reason,
        role,
        method: endpoint.method,
        path: endpoint.path,
        status: response.status,
        details: response.body?.slice(0, 300),
      };
    },
  });

  const failed = results.filter((result) => !result.pass);
  const passed = results.length - failed.length;

  console.log("=== RBAC HTTP smoke summary ===");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Endpoints checked: ${endpoints.length}`);
  console.log(`Checks total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Mode: ${args.includeMutations ? "all_methods" : "read_only(GET)"}`);
  console.log(`Auth mode: ${useBypass ? "test_bypass" : "real_login"}`);

  if (skippedRoles.length > 0) {
    console.log("Skipped roles (missing credentials or login failed):");
    for (const skipped of skippedRoles) {
      console.log(`- ${skipped.role}: ${skipped.reason}`);
    }
  }

  if (args.verbose || failed.length > 0) {
    const sample = args.verbose ? results : failed;
    for (const result of sample) {
      console.log(formatOutcome(result));
      if (!result.pass && result.details) {
        console.log(`  details: ${result.details}`);
      }
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("RBAC HTTP smoke failed:", error);
  process.exit(1);
});

