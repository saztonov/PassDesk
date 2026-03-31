import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, "..");
const ROUTES_DIR = path.join(SRC_DIR, "routes");

const parseImports = (source) => {
  const starImports = new Map();
  const namedImports = new Map();

  for (const match of source.matchAll(
    /import\s+\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+["']([^"']+)["']/g,
  )) {
    starImports.set(match[1], match[2]);
  }

  for (const match of source.matchAll(
    /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g,
  )) {
    const importPath = match[2];
    const importedItems = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    for (const importedItem of importedItems) {
      const [originalName, aliasName] = importedItem
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      namedImports.set(aliasName || originalName, {
        importPath,
        importName: originalName,
      });
    }
  }

  return { starImports, namedImports };
};

const getManagerRouteCalls = (source) => {
  const calls = [];
  const callRegex = /router\.(get|post|put|patch|delete)\(([\s\S]*?)\);/g;
  let match;

  while ((match = callRegex.exec(source))) {
    const rawCall = match[0];

    if (!/authorize\([\s\S]*?manager[\s\S]*?\)/.test(rawCall)) {
      continue;
    }

    const method = match[1].toUpperCase();
    const pathMatch = rawCall.match(
      /router\.(?:get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\1/,
    );
    const routePath = pathMatch?.[2] || "?";
    const handlerMatch = rawCall.match(
      /,\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*,?\s*\);\s*$/m,
    );

    calls.push({
      method,
      routePath,
      handlerToken: handlerMatch?.[1] || null,
      rawCall,
    });
  }

  return calls;
};

const resolveControllerTarget = (handlerToken, imports) => {
  if (!handlerToken) {
    return null;
  }

  if (handlerToken.includes(".")) {
    const [namespace, functionName] = handlerToken.split(".");
    const importPath = imports.starImports.get(namespace);
    if (importPath) {
      return { importPath, functionName };
    }

    const namedImport = imports.namedImports.get(namespace);
    if (namedImport) {
      return {
        importPath: namedImport.importPath,
        functionName,
      };
    }

    return null;
  }

  const namedImport = imports.namedImports.get(handlerToken);
  if (!namedImport) {
    return null;
  }

  return {
    importPath: namedImport.importPath,
    functionName: namedImport.importName,
  };
};

const extractBracedBlock = (source, openBraceIndex) => {
  let depth = 0;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }

  return null;
};

const getControllerFunctionBody = (source, functionName) => {
  const patterns = [
    new RegExp(
      `export\\s+const\\s+${functionName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
      "m",
    ),
    new RegExp(
      `export\\s+const\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
      "m",
    ),
    new RegExp(
      `export\\s+async\\s+function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
      "m",
    ),
    new RegExp(
      `export\\s+function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
      "m",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) {
      continue;
    }

    const openBraceIndex = match.index + match[0].lastIndexOf("{");
    const body = extractBracedBlock(source, openBraceIndex);
    if (body !== null) {
      return body;
    }
  }

  // Handle object-literal methods, e.g.:
  // export const skudController = { async providerEmployees(req, res) { ... } }
  // export const foo = { bar(req, res) { ... } }
  const objectMethodPattern = new RegExp(
    `(?:async\\s+)?${functionName}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const objectMethodMatch = objectMethodPattern.exec(source);
  if (objectMethodMatch) {
    const openBraceIndex =
      objectMethodMatch.index + objectMethodMatch[0].lastIndexOf("{");
    const body = extractBracedBlock(source, openBraceIndex);
    if (body !== null) {
      return body;
    }
  }

  return null;
};

const hasStrictAdminOnlyGuard = (body) => {
  const adminOnlyRegex = /req\.user\.role\s*!==\s*["']admin["']/g;
  let match;

  while ((match = adminOnlyRegex.exec(body))) {
    const snippet = body.slice(match.index, match.index + 220);
    if (!/manager/.test(snippet)) {
      return true;
    }
  }

  return false;
};

test("manager permissions are consistent between routes and controllers", () => {
  const routeFiles = fs
    .readdirSync(ROUTES_DIR)
    .filter((fileName) => fileName.endsWith(".js"));

  const managerRoutes = [];
  const unresolvedHandlers = [];
  const violations = [];

  for (const routeFile of routeFiles) {
    const routeFilePath = path.join(ROUTES_DIR, routeFile);
    const routeSource = fs.readFileSync(routeFilePath, "utf8");
    const imports = parseImports(routeSource);
    const routeCalls = getManagerRouteCalls(routeSource);

    for (const routeCall of routeCalls) {
      managerRoutes.push({
        routeFile,
        method: routeCall.method,
        routePath: routeCall.routePath,
      });

      const target = resolveControllerTarget(routeCall.handlerToken, imports);
      if (!target) {
        unresolvedHandlers.push({
          routeFile,
          method: routeCall.method,
          routePath: routeCall.routePath,
          handlerToken: routeCall.handlerToken,
          reason: "handler_not_resolved",
        });
        continue;
      }

      const controllerFilePath = path.resolve(
        path.dirname(routeFilePath),
        target.importPath,
      );

      if (!controllerFilePath.includes("/controllers/")) {
        continue;
      }

      if (!fs.existsSync(controllerFilePath)) {
        unresolvedHandlers.push({
          routeFile,
          method: routeCall.method,
          routePath: routeCall.routePath,
          handlerToken: routeCall.handlerToken,
          reason: `controller_not_found:${controllerFilePath}`,
        });
        continue;
      }

      const controllerSource = fs.readFileSync(controllerFilePath, "utf8");
      const functionBody = getControllerFunctionBody(
        controllerSource,
        target.functionName,
      );

      if (!functionBody) {
        unresolvedHandlers.push({
          routeFile,
          method: routeCall.method,
          routePath: routeCall.routePath,
          handlerToken: routeCall.handlerToken,
          reason: `handler_not_found:${target.functionName}`,
        });
        continue;
      }

      if (hasStrictAdminOnlyGuard(functionBody)) {
        violations.push({
          routeFile,
          method: routeCall.method,
          routePath: routeCall.routePath,
          handler: target.functionName,
          controller: path.relative(SRC_DIR, controllerFilePath),
        });
      }
    }
  }

  assert.ok(
    managerRoutes.length > 0,
    "No manager routes found in route files; consistency check is ineffective.",
  );

  assert.deepEqual(
    unresolvedHandlers,
    [],
    `Failed to resolve manager route handlers:\n${JSON.stringify(unresolvedHandlers, null, 2)}`,
  );

  assert.deepEqual(
    violations,
    [],
    `Found manager route/controller permission mismatches:\n${JSON.stringify(violations, null, 2)}`,
  );
});
