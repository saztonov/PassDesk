import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMatrixDocument } from "../tests/rbac/routePermissionExtractor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MATRIX_FILE_PATH = path.resolve(__dirname, "../tests/rbac/rbac-matrix.json");
const CHECK_MODE = process.argv.includes("--check");

const stringifyMatrix = (matrix) => `${JSON.stringify(matrix, null, 2)}\n`;

const readExistingMatrix = () => {
  if (!fs.existsSync(MATRIX_FILE_PATH)) {
    return null;
  }
  return fs.readFileSync(MATRIX_FILE_PATH, "utf8");
};

const nextMatrix = stringifyMatrix(buildMatrixDocument());

if (CHECK_MODE) {
  const currentMatrix = readExistingMatrix();

  if (currentMatrix !== nextMatrix) {
    console.error("RBAC matrix is outdated. Run: npm run rbac:generate");
    process.exit(1);
  }

  console.log("RBAC matrix is up to date.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(MATRIX_FILE_PATH), { recursive: true });
fs.writeFileSync(MATRIX_FILE_PATH, nextMatrix, "utf8");
console.log(`RBAC matrix generated: ${MATRIX_FILE_PATH}`);

