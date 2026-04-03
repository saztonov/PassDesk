import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWN_ROLES,
  extractRoutePermissionMatrix,
} from "./routePermissionExtractor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MATRIX_FILE = path.resolve(__dirname, "rbac-matrix.json");

const readMatrixFromFile = () => {
  if (!fs.existsSync(MATRIX_FILE)) {
    assert.fail(`RBAC matrix file does not exist: ${MATRIX_FILE}`);
  }

  const raw = fs.readFileSync(MATRIX_FILE, "utf8");
  return JSON.parse(raw);
};

const sortRoles = (roles = []) => [...roles].sort();

const expectedAllowedByRole = (endpoint) => {
  if (endpoint.access === "public" || endpoint.access === "authenticated") {
    return Object.fromEntries(KNOWN_ROLES.map((role) => [role, true]));
  }

  if (endpoint.access === "mobile_session") {
    return Object.fromEntries(KNOWN_ROLES.map((role) => [role, false]));
  }

  const roleSet = new Set(endpoint.roles || []);
  return Object.fromEntries(
    KNOWN_ROLES.map((role) => [role, roleSet.has(role)]),
  );
};

test("RBAC matrix matches current routes", () => {
  const matrix = readMatrixFromFile();
  const extractedEndpoints = extractRoutePermissionMatrix();
  const matrixEndpoints = Array.isArray(matrix?.endpoints) ? matrix.endpoints : [];

  assert.deepEqual(
    sortRoles(matrix?.roles || []),
    sortRoles(KNOWN_ROLES),
    "Matrix roles differ from KNOWN_ROLES",
  );

  const extractedByKey = new Map(
    extractedEndpoints.map((endpoint) => [endpoint.key, endpoint]),
  );
  const matrixByKey = new Map(matrixEndpoints.map((endpoint) => [endpoint.key, endpoint]));

  assert.deepEqual(
    [...matrixByKey.keys()].sort(),
    [...extractedByKey.keys()].sort(),
    "Matrix endpoints list is out of sync with route definitions",
  );

  for (const [key, extracted] of extractedByKey.entries()) {
    const fromMatrix = matrixByKey.get(key);
    assert.ok(fromMatrix, `Missing endpoint in matrix: ${key}`);

    assert.equal(fromMatrix.method, extracted.method, `Method mismatch for ${key}`);
    assert.equal(fromMatrix.path, extracted.path, `Path mismatch for ${key}`);
    assert.equal(
      fromMatrix.routeFile,
      extracted.routeFile,
      `Route file mismatch for ${key}`,
    );
    assert.equal(fromMatrix.access, extracted.access, `Access mismatch for ${key}`);
    assert.deepEqual(
      sortRoles(fromMatrix.roles),
      sortRoles(extracted.roles),
      `Roles mismatch for ${key}`,
    );
    assert.deepEqual(
      fromMatrix.allowedByRole,
      expectedAllowedByRole(extracted),
      `allowedByRole mismatch for ${key}`,
    );
  }
});

