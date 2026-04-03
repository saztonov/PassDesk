import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWN_ROLES } from "./routePermissionExtractor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MATRIX_FILE = path.resolve(__dirname, "rbac-matrix.json");

const readMatrix = () => {
  const raw = fs.readFileSync(MATRIX_FILE, "utf8");
  return JSON.parse(raw);
};

test("each role has explicit allow/deny coverage in RBAC matrix", () => {
  const matrix = readMatrix();
  const endpoints = Array.isArray(matrix?.endpoints) ? matrix.endpoints : [];

  assert.ok(endpoints.length > 0, "RBAC matrix contains no endpoints");

  for (const role of KNOWN_ROLES) {
    const allowedCount = endpoints.filter(
      (endpoint) => endpoint?.allowedByRole?.[role] === true,
    ).length;
    const deniedCount = endpoints.filter(
      (endpoint) => endpoint?.allowedByRole?.[role] === false,
    ).length;

    assert.ok(allowedCount > 0, `Role "${role}" has zero allowed endpoints`);
    assert.ok(deniedCount > 0, `Role "${role}" has zero denied endpoints`);
  }
});

