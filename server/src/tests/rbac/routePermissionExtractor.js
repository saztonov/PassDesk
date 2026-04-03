import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const KNOWN_ROLES = [
  "admin",
  "manager",
  "user",
  "laborer",
  "ot_admin",
  "ot_engineer",
];

const ROUTE_METHOD_REGEX =
  /router\.(use|get|post|put|patch|delete)\([\s\S]*?\);\s*/g;

const normalizeRoutePath = (mountPath, routePath) => {
  const combined = `${mountPath || ""}/${routePath || ""}`.replace(/\/+/g, "/");
  if (combined === "/") {
    return "/";
  }
  return combined.endsWith("/") ? combined.slice(0, -1) : combined;
};

const parseRolesFromText = (source) => {
  const roles = [];
  for (const match of source.matchAll(/["']([a-z_]+)["']/g)) {
    const value = match[1];
    if (KNOWN_ROLES.includes(value) && !roles.includes(value)) {
      roles.push(value);
    }
  }
  return roles;
};

const parseImportMapFromIndex = (indexSource) => {
  const importMap = new Map();

  for (const match of indexSource.matchAll(
    /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/g,
  )) {
    const clause = match[1].trim();
    const importPath = match[2];

    const namedSectionMatch = clause.match(/\{([\s\S]+)\}/);
    if (namedSectionMatch) {
      const namedItems = namedSectionMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      for (const item of namedItems) {
        const parts = item.split(/\s+as\s+/).map((part) => part.trim());
        const alias = parts[1] || parts[0];
        if (alias) {
          importMap.set(alias, importPath);
        }
      }
    }

    const defaultPart = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim();
    if (defaultPart) {
      importMap.set(defaultPart, importPath);
    }
  }

  return importMap;
};

const parseMountsFromIndex = (indexSource) => {
  const mounts = [];
  const importMap = parseImportMapFromIndex(indexSource);

  for (const match of indexSource.matchAll(
    /router\.use\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\);/g,
  )) {
    const mountPath = match[1];
    const alias = match[2];
    const importPath = importMap.get(alias);
    if (!importPath) {
      continue;
    }

    mounts.push({
      mountPath,
      routeFilePath: path.normalize(
        path.resolve(path.join(path.dirname(ROUTES_INDEX_FILE), importPath)),
      ),
    });
  }

  return mounts;
};

const extractEndpointsFromRouteFile = ({ routeFilePath, mountPath }) => {
  const source = fs.readFileSync(routeFilePath, "utf8");
  const relativeRouteFile = path
    .relative(path.resolve(__dirname, "../../"), routeFilePath)
    .replace(/\\/g, "/");

  let activeAuthenticate = false;
  let activeMobileSessionAuthenticate = false;
  let activeRoles = null;
  const endpoints = [];

  for (const match of source.matchAll(ROUTE_METHOD_REGEX)) {
    const statement = match[0];
    const methodMatch = statement.match(
      /router\.(use|get|post|put|patch|delete)\(/,
    );
    if (!methodMatch) {
      continue;
    }

    const method = methodMatch[1];
    const hasPathArgument = /^\s*router\.use\(\s*["'`]/.test(statement);
    const statementRoles = parseRolesFromText(
      [...statement.matchAll(/authorize\(([\s\S]*?)\)/g)]
        .map((roleMatch) => roleMatch[1])
        .join(","),
    );
    const hasAuthenticate = /(?:^|[^A-Za-z0-9_])authenticate(?:[^A-Za-z0-9_]|$)/.test(
      statement,
    );
    const hasAuthenticateWithoutActivation =
      /authenticateWithoutActivationCheck/.test(statement);
    const hasAuthenticateForLogout = /authenticateForLogout/.test(statement);
    const hasAuthenticateMobileSession = /authenticateMobileEmployeeSession/.test(
      statement,
    );

    if (method === "use") {
      if (!hasPathArgument) {
        if (hasAuthenticate || hasAuthenticateWithoutActivation) {
          activeAuthenticate = true;
        }
        if (hasAuthenticateMobileSession) {
          activeMobileSessionAuthenticate = true;
        }
        if (statementRoles.length > 0) {
          if (activeRoles === null) {
            activeRoles = [...statementRoles];
          } else {
            activeRoles = activeRoles.filter((role) =>
              statementRoles.includes(role),
            );
          }
        }
      }
      continue;
    }

    const pathMatch = statement.match(
      /router\.(?:get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\1/,
    );
    if (!pathMatch) {
      continue;
    }

    const routePath = pathMatch[2];
    const fullPath = normalizeRoutePath(mountPath, routePath);
    const allowedRoles =
      statementRoles.length > 0
        ? statementRoles
        : Array.isArray(activeRoles)
          ? [...activeRoles]
          : null;

    let access = "public";
    if (allowedRoles && allowedRoles.length > 0) {
      access = "roles";
    } else if (hasAuthenticateMobileSession || activeMobileSessionAuthenticate) {
      access = "mobile_session";
    } else if (hasAuthenticateForLogout) {
      access = "public";
    } else if (
      hasAuthenticate ||
      hasAuthenticateWithoutActivation ||
      activeAuthenticate
    ) {
      access = "authenticated";
    }

    endpoints.push({
      key: `${method.toUpperCase()} ${fullPath}`,
      method: method.toUpperCase(),
      path: fullPath,
      routeFile: relativeRouteFile,
      access,
      roles: access === "roles" ? allowedRoles.sort() : [],
    });
  }

  return endpoints;
};

const buildAllowedByRole = (endpoint) => {
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

const ROUTES_INDEX_FILE = path.resolve(__dirname, "../../routes/index.js");

export const extractRoutePermissionMatrix = () => {
  const indexSource = fs.readFileSync(ROUTES_INDEX_FILE, "utf8");
  const mounts = parseMountsFromIndex(indexSource);
  const endpointMap = new Map();

  for (const mount of mounts) {
    const endpoints = extractEndpointsFromRouteFile(mount);
    for (const endpoint of endpoints) {
      endpointMap.set(endpoint.key, {
        ...endpoint,
        allowedByRole: buildAllowedByRole(endpoint),
      });
    }
  }

  return Array.from(endpointMap.values()).sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path, "en");
    }
    return left.method.localeCompare(right.method, "en");
  });
};

export const buildMatrixDocument = () => ({
  schemaVersion: 1,
  roles: KNOWN_ROLES,
  endpoints: extractRoutePermissionMatrix(),
});
