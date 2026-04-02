import { Op, QueryTypes } from "sequelize";
import {
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
  Department,
  ConstructionSite,
  Pass,
  SkudCard,
  SkudPersonBinding,
  SkudAccessState,
  SkudAccessEvent,
  SkudSiteAccessPoint,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { checkEmployeeAccess } from "../utils/permissionUtils.js";
import { isSkudEnabled, skudConfig } from "../services/skud/skudConfig.js";
import {
  getSkudHealth,
  getSkudStats,
  ingestSkudEvent,
  listSkudSyncJobs,
} from "../services/skud/SkudStatsService.js";
import {
  executeSkudBindingImport,
  previewSkudBindingImport,
} from "../services/skud/SkudBindingImportService.js";
import {
  getEmployeeBinding,
  upsertEmployeeBinding,
} from "../services/skud/SkudBindingsService.js";
import { enqueueSkudSyncForEmployee } from "../services/skud/SkudSyncService.js";
import {
  assignSkudCard,
  blockSkudCard,
  blockLiveSkudEmployee,
  listSkudCards,
  unblockLiveSkudEmployee,
  unbindSkudCard,
  unbindLiveSkudCard,
} from "../services/skud/SkudCardsService.js";
import {
  issueSkudQrToken,
  processSkudDecisionPayload,
  verifySkudQrToken,
} from "../services/skud/SkudQrService.js";
import { enqueueSkudEventsIngestJob } from "../queues/skud/queue.js";
import { getSkudProvider } from "../integrations/skud/SkudProviderRegistry.js";
import { sendSkudQrToEmployeeTelegram } from "../services/telegramService.js";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
} from "../services/auditEventService.js";

const ensureSkudModuleEnabled = () => {
  if (!isSkudEnabled()) {
    throw new AppError("Модуль СКУД отключен", 503);
  }
};

const fetchEmployeeForAccess = async (employeeId) => {
  return Employee.findByPk(employeeId, {
    include: [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
  });
};

const parsePagination = (query = {}) => {
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit || "50"), 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    Number.parseInt(String(query.offset || "0"), 10) || 0,
    0,
  );
  return { limit, offset };
};

const parseBooleanParam = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const buildEmployeeDisplayName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

const normalizePersonNameForCompare = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, "");

const PASSAGE_EVENT_TYPES = ["PASS_DETECTED", "PASS_GRANTED", "PASS_DENIED", "PASS_ATTEMPT"];
const RAW_PASSAGE_EVENT_TYPE = 6;

const SKUD_SITE_ACCESS_POINTS_TABLE = "skud_site_access_points";
const SKUD_PERSON_BINDINGS_TABLE = "skud_person_bindings";
const TABLE_EXISTS_CACHE_TTL_MS = 60 * 1000;
const tableExistsCache = new Map();

const isUndefinedTableError = (error, tableName) => {
  const code = error?.original?.code || error?.parent?.code || null;
  if (code === "42P01") {
    return true;
  }
  const normalizedMessage = String(error?.message || "").toLowerCase();
  return normalizedMessage.includes(
    `relation "${String(tableName || "").toLowerCase()}" does not exist`,
  );
};

const hasTable = async (tableName) => {
  const normalized = String(tableName || "").trim();
  if (!normalized) {
    return false;
  }

  const cacheKey = normalized.toLowerCase();
  const cached = tableExistsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const rows = await SkudAccessEvent.sequelize.query(
    "SELECT to_regclass(:tableName) AS table_name",
    {
      replacements: { tableName: `public.${cacheKey}` },
      type: QueryTypes.SELECT,
    },
  );
  const exists = Boolean(rows?.[0]?.table_name);
  tableExistsCache.set(cacheKey, {
    value: exists,
    expiresAt: Date.now() + TABLE_EXISTS_CACHE_TTL_MS,
  });
  return exists;
};

const parsePullParams = (body = {}, query = {}) => {
  const source = body && typeof body === "object" ? body : {};
  const merged = { ...query, ...source };
  const limit = Math.min(
    Math.max(Number.parseInt(String(merged.limit || "100"), 10) || 100, 1),
    500,
  );
  const offset = Math.max(
    Number.parseInt(String(merged.offset || "0"), 10) || 0,
    0,
  );
  return {
    limit,
    offset,
    from: merged.from,
    to: merged.to,
  };
};

const toProviderItems = (result) =>
  Array.isArray(result)
    ? result
    : Array.isArray(result?.items)
      ? result.items
      : [];

const ACCESS_POINT_CATALOG_TTL_MS = 60 * 1000;
let accessPointCatalogCache = {
  expiresAt: 0,
  value: null,
  promise: null,
};

const EVENTS_RESPONSE_CACHE_TTL_MS = 10 * 1000;
const eventsResponseCache = new Map();
const PROVIDER_EMPLOYEE_FALLBACK_TTL_MS = 5 * 60 * 1000;
const providerEmployeeFallbackCache = new Map();
const PROVIDER_EMPLOYEE_FALLBACK_SCHEMA_VERSION = 2;
const PROVIDER_EMPLOYEE_SEARCH_TTL_MS = 60 * 1000;
const providerEmployeeSearchCache = new Map();
const PROVIDER_DEPARTMENTS_CATALOG_TTL_MS = 5 * 60 * 1000;
const COUNTERPARTY_LOOKUP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CONTRACTORS_ROOT_NAME = "Подрядные организации";
let providerDepartmentsCatalogCache = {
  expiresAt: 0,
  value: null,
  promise: null,
};
let counterpartyLookupCache = {
  expiresAt: 0,
  value: null,
  promise: null,
};

const buildEventsCacheKey = (query = {}) =>
  JSON.stringify({
    from: query.from || null,
    to: query.to || null,
    employeeId: query.employeeId || null,
    employeeName: query.employeeName || null,
    externalEmpId: query.externalEmpId || null,
    counterpartyId: query.counterpartyId || null,
    counterpartyName: query.counterpartyName || null,
    constructionSiteId: query.constructionSiteId || null,
    constructionSiteName: query.constructionSiteName || null,
    accessPoint: query.accessPoint || null,
    direction: query.direction || null,
    eventType: query.eventType || null,
    allow: query.allow === undefined ? "__unset__" : query.allow,
    departmentId: query.departmentId || null,
    passageOnly: query.passageOnly || "false",
    enrich: query.enrich || "full",
    useRawLog: query.useRawLog || "false",
    sortBy: query.sortBy || "eventTime",
    sortOrder: query.sortOrder || "desc",
    limit: query.limit || null,
    offset: query.offset || null,
  });

const getCachedEventsResponse = (key) => {
  const cached = eventsResponseCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    eventsResponseCache.delete(key);
    return null;
  }
  return cached.data;
};

const setCachedEventsResponse = (key, data) => {
  eventsResponseCache.set(key, {
    data,
    expiresAt: Date.now() + EVENTS_RESPONSE_CACHE_TTL_MS,
  });
};

const getCachedProviderEmployeeFallback = (externalEmpId) => {
  const key = String(externalEmpId || "").trim();
  if (!key) {
    return { hit: false, value: null };
  }

  const cached = providerEmployeeFallbackCache.get(key);
  if (!cached) {
    return { hit: false, value: null };
  }
  if (cached.expiresAt <= Date.now()) {
    providerEmployeeFallbackCache.delete(key);
    return { hit: false, value: null };
  }
  if (
    cached.value &&
    typeof cached.value === "object" &&
    cached.value.__v !== PROVIDER_EMPLOYEE_FALLBACK_SCHEMA_VERSION
  ) {
    providerEmployeeFallbackCache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: cached.value };
};

const setCachedProviderEmployeeFallback = (externalEmpId, value) => {
  const key = String(externalEmpId || "").trim();
  if (!key) {
    return;
  }
  const normalizedValue =
    value && typeof value === "object"
      ? { ...value, __v: PROVIDER_EMPLOYEE_FALLBACK_SCHEMA_VERSION }
      : value || null;
  providerEmployeeFallbackCache.set(key, {
    value: normalizedValue,
    expiresAt: Date.now() + PROVIDER_EMPLOYEE_FALLBACK_TTL_MS,
  });
};

const normalizeEmployeeSearchToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getCachedProviderEmployeeSearch = (searchToken) => {
  const key = normalizeEmployeeSearchToken(searchToken);
  if (!key) {
    return { hit: false, value: null };
  }

  const cached = providerEmployeeSearchCache.get(key);
  if (!cached) {
    return { hit: false, value: null };
  }
  if (cached.expiresAt <= Date.now()) {
    providerEmployeeSearchCache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: cached.value ?? null };
};

const setCachedProviderEmployeeSearch = (searchToken, externalEmpId) => {
  const key = normalizeEmployeeSearchToken(searchToken);
  if (!key) {
    return;
  }

  providerEmployeeSearchCache.set(key, {
    value: externalEmpId ? String(externalEmpId) : null,
    expiresAt: Date.now() + PROVIDER_EMPLOYEE_SEARCH_TTL_MS,
  });
};

const extractExternalEmpIdFromSearchText = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  // "Sigur: ID 12345" / "ID 12345" / "12345"
  const explicitIdMatch = raw.match(/(?:^|[\s:])id\s*(\d{3,})/i);
  if (explicitIdMatch?.[1]) {
    return explicitIdMatch[1];
  }
  if (/^\d{3,}$/.test(raw)) {
    return raw;
  }
  return null;
};

const shouldUseEmployeeNameSearch = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return false;
  }

  if (extractExternalEmpIdFromSearchText(raw)) {
    return true;
  }

  const normalized = normalizeEmployeeSearchToken(raw);
  if (normalized.length >= 3) {
    return true;
  }

  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 3;
};

const resolveExternalEmpIdByEmployeeSearch = async ({ provider, employeeName }) => {
  const normalizedQuery = normalizeEmployeeSearchToken(employeeName);
  if (!normalizedQuery) {
    return null;
  }

  if (!shouldUseEmployeeNameSearch(employeeName)) {
    return null;
  }

  const directId = extractExternalEmpIdFromSearchText(employeeName);
  if (directId) {
    return String(directId);
  }

  const cached = getCachedProviderEmployeeSearch(normalizedQuery);
  if (cached.hit) {
    return cached.value;
  }

  try {
    const response = await provider.getEmployees({
      limit: 20,
      offset: 0,
      filters: { name: employeeName },
    });
    const rows = toProviderItems(response);
    const candidates = rows
      .map((item) => ({
        id: item?.id === undefined || item?.id === null ? null : String(item.id),
        name: normalizeEmployeeSearchToken(item?.name),
      }))
      .filter((item) => item.id);

    if (!candidates.length) {
      setCachedProviderEmployeeSearch(normalizedQuery, null);
      return null;
    }

    const exactCandidates = candidates.filter((item) => item.name === normalizedQuery);
    const resolvedExternalEmpId =
      exactCandidates.length === 1
        ? exactCandidates[0].id
        : candidates.length === 1
          ? candidates[0].id
          : null;

    setCachedProviderEmployeeSearch(normalizedQuery, resolvedExternalEmpId);
    return resolvedExternalEmpId;
  } catch (error) {
    console.warn(
      "Failed to resolve externalEmpId by provider employee search:",
      error?.message || error,
    );
    setCachedProviderEmployeeSearch(normalizedQuery, null);
    return null;
  }
};

const getAllProviderDepartments = async (provider) => {
  const limit = 500;
  const items = [];
  let offset = 0;

  while (true) {
    const response = await provider.getDepartments({ limit, offset });
    const page = toProviderItems(response);
    if (!page.length) {
      break;
    }

    items.push(...page);
    if (page.length < limit) {
      break;
    }

    offset += page.length;
  }

  return items;
};

const getProviderDepartmentsCatalog = async (provider) => {
  const now = Date.now();
  if (
    providerDepartmentsCatalogCache.value &&
    providerDepartmentsCatalogCache.expiresAt > now
  ) {
    return providerDepartmentsCatalogCache.value;
  }

  if (providerDepartmentsCatalogCache.promise) {
    return providerDepartmentsCatalogCache.promise;
  }

  providerDepartmentsCatalogCache.promise = (async () => {
    try {
      const departments = await getAllProviderDepartments(provider);
      const departmentsById = new Map(
        departments
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item]),
      );
      const value = { departments, departmentsById };
      providerDepartmentsCatalogCache = {
        expiresAt: Date.now() + PROVIDER_DEPARTMENTS_CATALOG_TTL_MS,
        value,
        promise: null,
      };
      return value;
    } catch (error) {
      providerDepartmentsCatalogCache = {
        expiresAt: 0,
        value: null,
        promise: null,
      };
      throw error;
    }
  })();

  return providerDepartmentsCatalogCache.promise;
};

const normalizeCounterpartyLookupToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ");

const stripCounterpartyLegalForms = (value) =>
  String(value || "")
    .replace(/\b(ооо|ао|зао|пао|ип)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildCounterpartyLookupTokens = (value) => {
  const base = normalizeCounterpartyLookupToken(value);
  if (!base) {
    return [];
  }

  const noLegalForms = normalizeCounterpartyLookupToken(
    stripCounterpartyLegalForms(base),
  );
  return Array.from(new Set([base, noLegalForms].filter(Boolean)));
};

const getCounterpartyLookupIndex = async () => {
  const now = Date.now();
  if (counterpartyLookupCache.value && counterpartyLookupCache.expiresAt > now) {
    return counterpartyLookupCache.value;
  }

  if (counterpartyLookupCache.promise) {
    return counterpartyLookupCache.promise;
  }

  counterpartyLookupCache.promise = (async () => {
    try {
      const counterparties = await Counterparty.findAll({
        attributes: ["id", "name"],
      });
      const byToken = new Map();

      counterparties.forEach((counterparty) => {
        buildCounterpartyLookupTokens(counterparty?.name).forEach((token) => {
          if (!token) {
            return;
          }
          if (!byToken.has(token)) {
            byToken.set(token, counterparty);
            return;
          }
          const existing = byToken.get(token);
          if (!existing || String(existing.id) !== String(counterparty.id)) {
            byToken.set(token, null);
          }
        });
      });

      const value = { byToken };
      counterpartyLookupCache = {
        expiresAt: Date.now() + COUNTERPARTY_LOOKUP_TTL_MS,
        value,
        promise: null,
      };
      return value;
    } catch (error) {
      counterpartyLookupCache = {
        expiresAt: 0,
        value: null,
        promise: null,
      };
      throw error;
    }
  })();

  return counterpartyLookupCache.promise;
};

const resolveCounterpartyByName = (value, lookupIndex) => {
  if (!lookupIndex?.byToken) {
    return null;
  }
  const tokens = buildCounterpartyLookupTokens(value);
  for (const token of tokens) {
    const matched = lookupIndex.byToken.get(token);
    if (matched) {
      return matched;
    }
  }
  return null;
};

const getAllProviderAccessPoints = async (provider) => {
  const limit = 500;
  const items = [];
  let offset = 0;

  while (true) {
    const response = await provider.getAccessPoints({ limit, offset });
    const page = toProviderItems(response);
    if (!page.length) {
      break;
    }

    items.push(...page);
    if (page.length < limit) {
      break;
    }

    offset += page.length;
  }

  return items;
};

const buildDepartmentPath = (item, departmentsById, seen = new Set()) => {
  const id =
    item?.id === undefined || item?.id === null ? null : String(item.id);
  if (!id || seen.has(id)) {
    return [];
  }

  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const parentIdRaw = item?.parentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null
      ? null
      : String(parentIdRaw);
  const parent =
    parentId && parentId !== "0" ? departmentsById.get(parentId) : null;
  const parentPath = parent
    ? buildDepartmentPath(parent, departmentsById, nextSeen)
    : [];
  const name = String(item?.name || "").trim();

  return name ? [...parentPath, name] : parentPath;
};

const buildAccessPointFolderPath = (item, foldersById, seen = new Set()) => {
  const id = item?.id === undefined || item?.id === null ? null : String(item.id);
  if (!id || seen.has(id)) {
    return [];
  }

  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const parentIdRaw = item?.parentId;
  const parentId =
    parentIdRaw === undefined || parentIdRaw === null ? null : String(parentIdRaw);
  const parent = parentId && parentId !== "0" ? foldersById.get(parentId) : null;
  const parentPath = parent ? buildAccessPointFolderPath(parent, foldersById, nextSeen) : [];
  const name = String(item?.name || "").trim();

  return name ? [...parentPath, name] : parentPath;
};

const mapAccessPointLabel = ({ accessPoint, hierarchyById }) => {
  if (!accessPoint || accessPoint.id === undefined || accessPoint.id === null) {
    return null;
  }

  const pointName = String(accessPoint?.name || "").trim();
  const folderIdRaw =
    accessPoint?.folderId ?? accessPoint?.folder?.id ?? accessPoint?.folder_id ?? null;
  const folderId =
    folderIdRaw === undefined || folderIdRaw === null ? null : String(folderIdRaw);
  const folder = folderId && hierarchyById.has(folderId) ? hierarchyById.get(folderId) : null;
  const folderPath = folder ? buildAccessPointFolderPath(folder, hierarchyById) : [];

  if (folderPath.length && pointName) {
    return `${folderPath.join(" / ")} / ${pointName}`;
  }
  if (folderPath.length) {
    return folderPath.join(" / ");
  }
  return pointName || null;
};

const extractConstructionSiteNameFromAccessPointPath = (pathLabel) => {
  const segments = String(pathLabel || "")
    .split("/")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (!segments.length) {
    return null;
  }

  const ignorePatterns = [
    /^\d+\s*структур/i,
    /подрядн/i,
    /^отдел\b/i,
    /^офис$/i,
    /^охрана/i,
    /^автопарк/i,
    /^медперсонал/i,
    /^допуск/i,
    /^гостев/i,
  ];

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (!ignorePatterns.some((pattern) => pattern.test(candidate))) {
      return candidate;
    }
  }

  return segments[segments.length - 1] || null;
};

const getAccessPointCatalog = async (provider) => {
  const now = Date.now();
  if (accessPointCatalogCache.value && accessPointCatalogCache.expiresAt > now) {
    return accessPointCatalogCache.value;
  }

  if (accessPointCatalogCache.promise) {
    return accessPointCatalogCache.promise;
  }

  accessPointCatalogCache.promise = (async () => {
    try {
      const [points, hierarchyResponse] = await Promise.all([
        getAllProviderAccessPoints(provider),
        provider.getAccessPointHierarchy(),
      ]);
      const hierarchyItems = toProviderItems(hierarchyResponse);
      const hierarchyById = new Map(
        hierarchyItems
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item]),
      );
      const pointsById = new Map(
        points
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item]),
      );

      const value = {
        hierarchyById,
        pointsById,
      };
      accessPointCatalogCache = {
        expiresAt: Date.now() + ACCESS_POINT_CATALOG_TTL_MS,
        value,
        promise: null,
      };
      return value;
    } catch (error) {
      accessPointCatalogCache = {
        expiresAt: 0,
        value: null,
        promise: null,
      };
      throw error;
    }
  })();

  return accessPointCatalogCache.promise;
};

const mapProviderAccessPoint = ({ accessPoint, hierarchyById }) => {
  if (!accessPoint || accessPoint?.id === undefined || accessPoint?.id === null) {
    return null;
  }

  const id = String(accessPoint.id);
  const name = String(accessPoint?.name || "").trim() || "—";
  const folderIdRaw =
    accessPoint?.folderId ?? accessPoint?.folder?.id ?? accessPoint?.folder_id ?? null;
  const folderId =
    folderIdRaw === undefined || folderIdRaw === null ? null : String(folderIdRaw);
  const folder = folderId && hierarchyById.has(folderId) ? hierarchyById.get(folderId) : null;
  const folderPath = folder ? buildAccessPointFolderPath(folder, hierarchyById) : [];
  const pathLabel = folderPath.length ? folderPath.join(" / ") : null;
  const label = mapAccessPointLabel({ accessPoint, hierarchyById }) || name;

  return {
    id,
    name,
    folderId,
    pathLabel,
    label,
    raw: accessPoint,
  };
};

const buildEmployeeDepartmentName = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  return (
    mappings.find((item) => item?.department?.name)?.department?.name
    || null
  );
};

const buildEmployeeDepartmentId = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const value = mappings.find((item) => item?.departmentId)?.departmentId;
  return value || null;
};

const buildEmployeeCounterpartyId = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const value = mappings.find((item) => item?.counterpartyId)?.counterpartyId;
  return value || null;
};

const buildEmployeeCounterpartyName = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  return (
    mappings.find((item) => item?.counterparty?.name)?.counterparty?.name
    || null
  );
};

const buildEmployeeConstructionSiteId = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const value = mappings.find((item) => item?.constructionSiteId)?.constructionSiteId;
  return value || null;
};

const buildEmployeeConstructionSiteName = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const mappingWithSite = mappings.find(
    (item) =>
      item?.constructionSite?.shortName ||
      item?.constructionSite?.fullName,
  );
  return (
    mappingWithSite?.constructionSite?.shortName
    || mappingWithSite?.constructionSite?.fullName
    || null
  );
};

const normalizeCardToken = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const mapEmployeeMeta = (employee, fallbackEmployeeId = null) => ({
  ...(function buildMeta() {
    const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
      ? employee.employeeCounterpartyMappings
      : [];
    const activeMappings = mappings.filter((item) => !item?.dismissedAt);
    const effectiveMappings = activeMappings.length > 0 ? activeMappings : mappings;

    const departmentIds = Array.from(
      new Set(effectiveMappings.map((item) => item?.departmentId).filter(Boolean)),
    );
    const counterpartyIds = Array.from(
      new Set(effectiveMappings.map((item) => item?.counterpartyId).filter(Boolean)),
    );
    const constructionSiteIds = Array.from(
      new Set(effectiveMappings.map((item) => item?.constructionSiteId).filter(Boolean)),
    );

    const counterpartyNames = Array.from(
      new Set(
        effectiveMappings
          .map((item) => String(item?.counterparty?.name || "").trim())
          .filter(Boolean),
      ),
    );

    const constructionSiteNames = Array.from(
      new Set(
        effectiveMappings
          .map((item) =>
            String(
              item?.constructionSite?.shortName ||
                item?.constructionSite?.fullName ||
                "",
            ).trim(),
          )
          .filter(Boolean),
      ),
    );

    return {
      employeeId: employee?.id || fallbackEmployeeId || null,
      employeeName: buildEmployeeDisplayName(employee) || null,
      departmentId: buildEmployeeDepartmentId(employee),
      departmentName: buildEmployeeDepartmentName(employee),
      counterpartyId: buildEmployeeCounterpartyId(employee),
      counterpartyName: buildEmployeeCounterpartyName(employee),
      constructionSiteId: buildEmployeeConstructionSiteId(employee),
      constructionSiteName: buildEmployeeConstructionSiteName(employee),
      departmentIds,
      counterpartyIds,
      constructionSiteIds,
      counterpartyNames,
      constructionSiteNames,
      employee: employee || null,
    };
  })(),
});

const normalizeDepartmentNameToken = (value) =>
  String(value || "").trim().toLowerCase();

const normalizeCounterpartyFolderToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");

const matchesHierarchyRootSegment = (segment, rootToken) => {
  const normalizedSegment = String(segment || "").trim();
  const normalizedRootToken = String(rootToken || "").trim();
  if (!normalizedSegment || !normalizedRootToken) {
    return false;
  }
  return (
    normalizedSegment === normalizedRootToken ||
    normalizedSegment.startsWith(`${normalizedRootToken} `)
  );
};

const resolveCounterpartyFolderNameByDepartmentId = ({
  departmentId,
  departmentsById,
}) => {
  const normalizedDepartmentId = String(departmentId || "").trim();
  if (!normalizedDepartmentId || !departmentsById?.has(normalizedDepartmentId)) {
    return null;
  }

  const department = departmentsById.get(normalizedDepartmentId);
  const path = buildDepartmentPath(department, departmentsById);
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  const contractorsRoot = String(
    skudConfig?.sigur?.departmentRootContractors || "",
  ).trim();
  const normalizedContractorsRoot = normalizeCounterpartyFolderToken(contractorsRoot);
  const normalizedDefaultContractorsRoot = normalizeCounterpartyFolderToken(
    DEFAULT_CONTRACTORS_ROOT_NAME,
  );

  const normalizedPath = path.map((segment) =>
    normalizeCounterpartyFolderToken(segment),
  );
  const contractorsRootIdx = normalizedPath.findIndex(
    (segment) =>
      segment &&
      (
        (normalizedContractorsRoot &&
          matchesHierarchyRootSegment(segment, normalizedContractorsRoot))
        || matchesHierarchyRootSegment(segment, normalizedDefaultContractorsRoot)
      ),
  );
  if (contractorsRootIdx >= 0) {
    const contractorFolderName = String(path[contractorsRootIdx + 1] || "").trim();
    return contractorFolderName || null;
  }

  // Important: do not fallback to top-level structure folders.
  // Counterparty in SKUD should come only from contractor subtree.
  return null;
};

const extractProviderDepartmentIdFromEvent = (item) => {
  const candidates = [
    item?.departmentId,
    item?.rawItem?.departmentId,
    item?.rawItem?.data?.departmentId,
    item?.rawItem?.data?.department_id,
    item?.rawItem?.additionalData?.accessObject?.parentId,
    item?.rawItem?.additionalData?.accessObject?.parent_id,
    item?.rawItem?.additionalData?.accessObject?.data?.departmentId,
    item?.rawItem?.additionalData?.accessObject?.data?.department_id,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }
    const token = String(candidate).trim();
    if (token) {
      return token;
    }
  }

  return null;
};

const enrichProviderEvents = async ({
  items,
  provider,
  providerFallbackMode = "none",
  localOnly = false,
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) {
    return normalizedItems;
  }

  const externalEmpIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => String(item?.externalEmpId || "").trim())
        .filter(Boolean),
    ),
  );

  const employeeBindings = externalEmpIds.length
    ? await SkudPersonBinding.findAll({
        where: {
          externalSystem: "sigur",
          isActive: true,
          externalEmpId: {
            [Op.in]: externalEmpIds,
          },
        },
        attributes: ["externalEmpId", "employeeId"],
        include: [
          {
            model: Employee,
            as: "employee",
            required: false,
            attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
            include: [
              {
                model: EmployeeCounterpartyMapping,
                as: "employeeCounterpartyMappings",
                required: false,
                attributes: [
                  "id",
                  "departmentId",
                  "counterpartyId",
                  "constructionSiteId",
                  "dismissedAt",
                ],
                include: [
                  {
                    model: Department,
                    as: "department",
                    required: false,
                    attributes: ["id", "name"],
                  },
                  {
                    model: Counterparty,
                    as: "counterparty",
                    required: false,
                    attributes: ["id", "name"],
                  },
                  {
                    model: ConstructionSite,
                    as: "constructionSite",
                    required: false,
                    attributes: ["id", "shortName", "fullName"],
                  },
                ],
              },
            ],
          },
        ],
      })
    : [];

  const employeeByExternalId = new Map(
    employeeBindings.map((binding) => [
      String(binding.externalEmpId),
      mapEmployeeMeta(binding.employee, binding.employeeId),
    ]),
  );

  const unresolvedExternalEmpIds = externalEmpIds.filter(
    (externalEmpId) => !employeeByExternalId.has(String(externalEmpId)),
  );
  const providerFallbackByExternalId = new Map();

  if (!localOnly && providerFallbackMode !== "none" && unresolvedExternalEmpIds.length > 0) {
    const unresolvedLookupLimit = Math.min(
      Math.max(unresolvedExternalEmpIds.length, providerFallbackMode === "full" ? 60 : 100),
      120,
    );
    const unresolvedLookupIds = [];
    const providerMetaByExternalId = new Map();
    const unresolvedDepartmentNames = new Set();

    for (const unresolvedExternalEmpId of unresolvedExternalEmpIds) {
      const { hit, value } = getCachedProviderEmployeeFallback(unresolvedExternalEmpId);
      if (hit) {
        if (value) {
          providerMetaByExternalId.set(String(unresolvedExternalEmpId), value);
          if (value.providerExternalEmpId) {
            providerMetaByExternalId.set(String(value.providerExternalEmpId), value);
          }
          if (value.departmentName) {
            unresolvedDepartmentNames.add(value.departmentName);
          }
        }
        continue;
      }
      unresolvedLookupIds.push(String(unresolvedExternalEmpId));
    }

    const lookupIdsToRequest = unresolvedLookupIds.slice(0, unresolvedLookupLimit);
    const providerLookups = await Promise.allSettled(
      lookupIdsToRequest.map(async (externalEmpId) => {
        const providerEmployee = await provider.getEmployeeById(externalEmpId);
        const departmentName = String(
          providerEmployee?.departmentName || providerEmployee?.department_name || "",
        ).trim();
        const employeeName = String(providerEmployee?.name || "").trim();
        const providerExternalEmpId =
          providerEmployee?.id === undefined || providerEmployee?.id === null
            ? String(externalEmpId)
            : String(providerEmployee.id);

        return {
          externalEmpId: String(externalEmpId),
          providerExternalEmpId,
          employeeName: employeeName || null,
          departmentName: departmentName || null,
          departmentId:
            providerEmployee?.departmentId === undefined
            || providerEmployee?.departmentId === null
              ? null
              : String(providerEmployee.departmentId),
        };
      }),
    );

    for (const lookup of providerLookups) {
      if (lookup.status !== "fulfilled") {
        continue;
      }

      const resolved = lookup.value;
      setCachedProviderEmployeeFallback(resolved.externalEmpId, resolved);
      providerMetaByExternalId.set(String(resolved.externalEmpId), resolved);
      if (resolved.providerExternalEmpId) {
        setCachedProviderEmployeeFallback(resolved.providerExternalEmpId, resolved);
        providerMetaByExternalId.set(String(resolved.providerExternalEmpId), resolved);
      }
      if (resolved.departmentName) {
        unresolvedDepartmentNames.add(resolved.departmentName);
      }
    }

    const localDepartments = providerFallbackMode === "full" && unresolvedDepartmentNames.size > 0
      ? await Department.findAll({
          where: {
            name: {
              [Op.in]: Array.from(unresolvedDepartmentNames),
            },
          },
          attributes: ["id", "name", "counterpartyId", "constructionSiteId"],
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              required: false,
              attributes: ["id", "name"],
            },
            {
              model: ConstructionSite,
              as: "constructionSite",
              required: false,
              attributes: ["id", "shortName", "fullName"],
            },
          ],
        })
      : [];

    let folderCounterpartyNameByExternalEmpId = new Map();
    let localCounterpartyByFolderNameToken = new Map();
    if (providerFallbackMode !== "none") {
      try {
        const { departmentsById } = await getProviderDepartmentsCatalog(provider);
        folderCounterpartyNameByExternalEmpId = new Map();
        const folderCounterpartyNames = new Set();

        providerMetaByExternalId.forEach((providerMeta, externalEmpId) => {
          const folderCounterpartyName = resolveCounterpartyFolderNameByDepartmentId({
            departmentId: providerMeta?.departmentId,
            departmentsById,
          });
          if (!folderCounterpartyName) {
            return;
          }
          folderCounterpartyNameByExternalEmpId.set(
            String(externalEmpId),
            folderCounterpartyName,
          );
          folderCounterpartyNames.add(folderCounterpartyName);
        });

        const folderCounterpartyNameList = Array.from(folderCounterpartyNames);
        const counterpartyLookupIndex = folderCounterpartyNameList.length > 0
          ? await getCounterpartyLookupIndex()
          : null;

        localCounterpartyByFolderNameToken = new Map();
        folderCounterpartyNameList.forEach((folderName) => {
          const token = normalizeCounterpartyFolderToken(folderName);
          if (!token || localCounterpartyByFolderNameToken.has(token)) {
            return;
          }
          localCounterpartyByFolderNameToken.set(
            token,
            resolveCounterpartyByName(folderName, counterpartyLookupIndex),
          );
        });
      } catch (error) {
        console.warn(
          "Failed to resolve counterparty from Sigur department folder path:",
          error?.message || error,
        );
      }
    }

    const uniqueDepartmentMetaByNameToken = new Map();
    if (providerFallbackMode === "full") {
      const localDepartmentsByNameToken = new Map();
      localDepartments.forEach((department) => {
        const token = normalizeDepartmentNameToken(department?.name);
        if (!token) {
          return;
        }
        if (!localDepartmentsByNameToken.has(token)) {
          localDepartmentsByNameToken.set(token, []);
        }
        localDepartmentsByNameToken.get(token).push(department);
      });

      localDepartmentsByNameToken.forEach((departments, token) => {
        if (!Array.isArray(departments) || departments.length !== 1) {
          return;
        }

        const department = departments[0];
        const counterpartyName = String(department?.counterparty?.name || "").trim();
        const constructionSiteName = String(
          department?.constructionSite?.shortName
          || department?.constructionSite?.fullName
          || "",
        ).trim();

        uniqueDepartmentMetaByNameToken.set(token, {
          departmentId: department?.id || null,
          departmentName: String(department?.name || "").trim() || null,
          counterpartyId: department?.counterpartyId || null,
          counterpartyName: counterpartyName || null,
          constructionSiteId: department?.constructionSiteId || null,
          constructionSiteName: constructionSiteName || null,
        });
      });
    }

    providerMetaByExternalId.forEach((providerMeta, externalEmpId) => {
      const token = normalizeDepartmentNameToken(providerMeta?.departmentName);
      const localDepartmentMeta = token
        ? uniqueDepartmentMetaByNameToken.get(token) || null
        : null;
      const folderCounterpartyName = folderCounterpartyNameByExternalEmpId.get(
        String(externalEmpId),
      ) || null;
      const matchedLocalCounterparty = folderCounterpartyName
        ? localCounterpartyByFolderNameToken.get(
            normalizeCounterpartyFolderToken(folderCounterpartyName),
          ) || null
        : null;
      const resolvedCounterpartyName = String(
        matchedLocalCounterparty?.name || folderCounterpartyName || "",
      ).trim() || null;
      const resolvedCounterpartyId = matchedLocalCounterparty?.id || null;

      providerFallbackByExternalId.set(String(externalEmpId), {
        employeeId: null,
        employeeName: providerMeta?.employeeName || null,
        departmentId: localDepartmentMeta?.departmentId || null,
        departmentName: providerMeta?.departmentName || localDepartmentMeta?.departmentName || null,
        counterpartyId: resolvedCounterpartyId,
        counterpartyName: resolvedCounterpartyName,
        constructionSiteId: localDepartmentMeta?.constructionSiteId || null,
        constructionSiteName: localDepartmentMeta?.constructionSiteName || null,
        departmentIds: localDepartmentMeta?.departmentId ? [localDepartmentMeta.departmentId] : [],
        counterpartyIds: resolvedCounterpartyId ? [resolvedCounterpartyId] : [],
        constructionSiteIds: localDepartmentMeta?.constructionSiteId
          ? [localDepartmentMeta.constructionSiteId]
          : [],
        counterpartyNames: resolvedCounterpartyName
          ? [resolvedCounterpartyName]
          : [],
        constructionSiteNames: localDepartmentMeta?.constructionSiteName
          ? [localDepartmentMeta.constructionSiteName]
          : [],
        employee: null,
      });
    });
  }

  const keyTokens = Array.from(
    new Set(
      normalizedItems
        .map((item) => normalizeCardToken(item?.keyHex))
        .filter(Boolean),
    ),
  );

  const cardsByKeyToken = new Map();
  const passesByKeyToken = new Map();

  if (keyTokens.length > 0) {
    const cards = await SkudCard.findAll({
      where: {
        externalSystem: "sigur",
        cardNumberNormalized: {
          [Op.in]: keyTokens,
        },
      },
      attributes: ["cardNumberNormalized", "employeeId"],
      include: [
        {
          model: Employee,
          as: "employee",
          required: false,
          attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              required: false,
              attributes: [
                "id",
                "departmentId",
                "counterpartyId",
                "constructionSiteId",
                "dismissedAt",
              ],
              include: [
                {
                  model: Department,
                  as: "department",
                  required: false,
                  attributes: ["id", "name"],
                },
                {
                  model: Counterparty,
                  as: "counterparty",
                  required: false,
                  attributes: ["id", "name"],
                },
                {
                  model: ConstructionSite,
                  as: "constructionSite",
                  required: false,
                  attributes: ["id", "shortName", "fullName"],
                },
              ],
            },
          ],
        },
      ],
    });

    cards.forEach((card) => {
      const key = normalizeCardToken(card.cardNumberNormalized || card.cardNumber);
      if (!key || cardsByKeyToken.has(key)) {
        return;
      }
      cardsByKeyToken.set(key, mapEmployeeMeta(card.employee, card.employeeId));
    });

    const passLookupValues = Array.from(
      new Set(
        keyTokens.flatMap((token) => [token, String(token).trim()]).filter(Boolean),
      ),
    );

    const passes = await Pass.findAll({
      where: {
        passNumber: {
          [Op.in]: passLookupValues,
        },
      },
      attributes: ["passNumber", "employeeId"],
      include: [
        {
          model: Employee,
          as: "employee",
          required: false,
          attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              required: false,
              attributes: [
                "id",
                "departmentId",
                "counterpartyId",
                "constructionSiteId",
                "dismissedAt",
              ],
              include: [
                {
                  model: Department,
                  as: "department",
                  required: false,
                  attributes: ["id", "name"],
                },
                {
                  model: Counterparty,
                  as: "counterparty",
                  required: false,
                  attributes: ["id", "name"],
                },
                {
                  model: ConstructionSite,
                  as: "constructionSite",
                  required: false,
                  attributes: ["id", "shortName", "fullName"],
                },
              ],
            },
          ],
        },
      ],
    });

    passes.forEach((pass) => {
      const key = normalizeCardToken(pass.passNumber);
      if (!key || passesByKeyToken.has(key)) {
        return;
      }
      passesByKeyToken.set(key, mapEmployeeMeta(pass.employee, pass.employeeId));
    });
  }

  let accessPointCatalog = null;
  if (!localOnly) {
    try {
      accessPointCatalog = await getAccessPointCatalog(provider);
    } catch (error) {
      console.warn(
        "Failed to load Sigur access point catalog:",
        error?.message || error,
      );
    }
  }

  const accessPointIds = Array.from(
    new Set(
      normalizedItems
        .map((item) =>
          item?.accessPoint === undefined || item?.accessPoint === null
            ? null
            : Number.parseInt(String(item.accessPoint), 10),
        )
        .filter((item) => Number.isFinite(item)),
    ),
  );
  const canUseSkudSiteAccessPoints = await hasTable(SKUD_SITE_ACCESS_POINTS_TABLE);
  let siteAccessPointRows = [];
  if (canUseSkudSiteAccessPoints && accessPointIds.length > 0) {
    try {
      siteAccessPointRows = await SkudSiteAccessPoint.findAll({
        where: {
          sigurAccessPointId: {
            [Op.in]: accessPointIds,
          },
        },
        attributes: ["sigurAccessPointId", "constructionSiteId"],
        include: [
          {
            model: ConstructionSite,
            as: "constructionSite",
            required: false,
            attributes: ["id", "shortName", "fullName"],
          },
        ],
      });
    } catch (error) {
      if (isUndefinedTableError(error, SKUD_SITE_ACCESS_POINTS_TABLE)) {
        siteAccessPointRows = [];
        tableExistsCache.set(SKUD_SITE_ACCESS_POINTS_TABLE, {
          value: false,
          expiresAt: Date.now() + TABLE_EXISTS_CACHE_TTL_MS,
        });
      } else {
        throw error;
      }
    }
  }
  const siteInfoByAccessPointId = new Map();
  siteAccessPointRows.forEach((item) => {
    const accessPointId = Number.parseInt(String(item?.sigurAccessPointId), 10);
    if (!Number.isFinite(accessPointId)) {
      return;
    }
    if (!siteInfoByAccessPointId.has(accessPointId)) {
      siteInfoByAccessPointId.set(accessPointId, {
        siteIds: new Set(),
        siteNames: new Set(),
      });
    }

    const meta = siteInfoByAccessPointId.get(accessPointId);
    const siteId = item?.constructionSiteId || item?.constructionSite?.id || null;
    if (siteId) {
      meta.siteIds.add(String(siteId));
    }
    const siteName = String(
      item?.constructionSite?.shortName ||
      item?.constructionSite?.fullName ||
      "",
    ).trim();
    if (siteName) {
      meta.siteNames.add(siteName);
    }
  });
  let counterpartyLookupIndex = null;
  try {
    counterpartyLookupIndex = await getCounterpartyLookupIndex();
  } catch (error) {
    console.warn(
      "Failed to build counterparty lookup index:",
      error?.message || error,
    );
  }
  let departmentsByIdForCounterpartyFallback = null;
  let departmentsByIdFallbackLoadAttempted = false;
  const getDepartmentsByIdForCounterpartyFallback = async () => {
    if (departmentsByIdFallbackLoadAttempted) {
      return departmentsByIdForCounterpartyFallback;
    }
    departmentsByIdFallbackLoadAttempted = true;
    try {
      const catalog = await getProviderDepartmentsCatalog(provider);
      departmentsByIdForCounterpartyFallback = catalog?.departmentsById || null;
    } catch (error) {
      console.warn(
        "Failed to load provider departments catalog for counterparty fallback:",
        error?.message || error,
      );
      departmentsByIdForCounterpartyFallback = null;
    }
    return departmentsByIdForCounterpartyFallback;
  };

  return Promise.all(normalizedItems.map(async (item) => {
    const externalEmpId = String(item?.externalEmpId || "").trim();
    const accessPointId =
      item?.accessPoint === undefined || item?.accessPoint === null
        ? null
        : String(item.accessPoint);
    const employeeMeta = externalEmpId ? employeeByExternalId.get(externalEmpId) : null;
    const keyHexToken = normalizeCardToken(item?.keyHex);
    const employeeMetaByCard = keyHexToken ? cardsByKeyToken.get(keyHexToken) : null;
    const employeeMetaByPass = keyHexToken ? passesByKeyToken.get(keyHexToken) : null;
    const employeeMetaByProviderFallback = externalEmpId
      ? providerFallbackByExternalId.get(externalEmpId) || null
      : null;
    const resolvedEmployeeMeta =
      employeeMeta
      || employeeMetaByCard
      || employeeMetaByPass
      || employeeMetaByProviderFallback
      || null;
    const accessPointMeta =
      accessPointCatalog && accessPointId
        ? accessPointCatalog.pointsById.get(accessPointId) || null
        : null;
    const accessPointLabel = accessPointMeta
      ? mapAccessPointLabel({
          accessPoint: accessPointMeta,
          hierarchyById: accessPointCatalog.hierarchyById,
        })
      : null;
    const accessPointPathLabel = String(accessPointMeta?.pathLabel || "").trim() || null;
    const providerDepartmentId = localOnly ? null : extractProviderDepartmentIdFromEvent(item);
    let providerDepartmentCounterpartyFolderName = null;
    if (providerDepartmentId) {
      const departmentsById = await getDepartmentsByIdForCounterpartyFallback();
      if (departmentsById) {
        providerDepartmentCounterpartyFolderName = resolveCounterpartyFolderNameByDepartmentId({
          departmentId: providerDepartmentId,
          departmentsById,
        });
      }
    }
    const providerDepartmentCounterparty = providerDepartmentCounterpartyFolderName
      ? resolveCounterpartyByName(
          providerDepartmentCounterpartyFolderName,
          counterpartyLookupIndex,
        )
      : null;
    const resolvedCounterpartyId =
      item?.counterpartyId
      || resolvedEmployeeMeta?.counterpartyId
      || providerDepartmentCounterparty?.id
      || null;
    const resolvedCounterpartyName = String(
      item?.counterpartyName
      || resolvedEmployeeMeta?.counterpartyName
      || providerDepartmentCounterparty?.name
      || providerDepartmentCounterpartyFolderName
      || "",
    ).trim() || null;
    const resolvedCounterpartyIds = Array.isArray(resolvedEmployeeMeta?.counterpartyIds)
      ? [...resolvedEmployeeMeta.counterpartyIds]
      : [];
    if (
      resolvedCounterpartyId &&
      !resolvedCounterpartyIds.some((id) => String(id) === String(resolvedCounterpartyId))
    ) {
      resolvedCounterpartyIds.push(resolvedCounterpartyId);
    }
    const fallbackConstructionSiteName = extractConstructionSiteNameFromAccessPointPath(
      accessPointPathLabel,
    );
    const eventAccessPointId = item?.accessPoint;
    const eventSiteMeta = Number.isFinite(Number(eventAccessPointId))
      ? siteInfoByAccessPointId.get(Number(eventAccessPointId)) || null
      : null;
    const eventSiteIds = eventSiteMeta
      ? Array.from(eventSiteMeta.siteIds)
      : [];
    const eventSiteNames = eventSiteMeta
      ? Array.from(eventSiteMeta.siteNames)
      : [];
    if (!eventSiteNames.length && fallbackConstructionSiteName) {
      eventSiteNames.push(fallbackConstructionSiteName);
    }
    const resolvedConstructionSiteName =
      item?.constructionSiteName
      || resolvedEmployeeMeta?.constructionSiteName
      || eventSiteNames[0]
      || null;

    return {
      ...item,
      employeeId: item?.employeeId || resolvedEmployeeMeta?.employeeId || null,
      employeeName: item?.employeeName || resolvedEmployeeMeta?.employeeName || null,
      departmentId: item?.departmentId || resolvedEmployeeMeta?.departmentId || null,
      departmentName: item?.departmentName || resolvedEmployeeMeta?.departmentName || null,
      counterpartyId: resolvedCounterpartyId,
      counterpartyName: resolvedCounterpartyName,
      constructionSiteId: item?.constructionSiteId || resolvedEmployeeMeta?.constructionSiteId || null,
      constructionSiteName: resolvedConstructionSiteName,
      counterpartyIds: resolvedCounterpartyIds,
      providerCounterpartyFolderName: providerDepartmentCounterpartyFolderName || null,
      constructionSiteIds: resolvedEmployeeMeta?.constructionSiteIds || [],
      departmentIds: resolvedEmployeeMeta?.departmentIds || [],
      eventConstructionSiteIds: eventSiteIds,
      eventConstructionSiteNames: eventSiteNames,
      accessPointLabel: accessPointLabel || null,
      accessPointPathLabel,
      accessPointName:
        String(accessPointMeta?.name || "").trim() || item?.accessPointName || null,
      accessPointFolderId:
        accessPointMeta?.folderId === undefined || accessPointMeta?.folderId === null
          ? null
          : String(accessPointMeta.folderId),
    };
  }));
};

const getLatestSkudPullCursor = async () => {
  const latestByLogId = await SkudAccessEvent.findOne({
    where: {
      externalSystem: "sigur",
      source: "sigur_pull",
      logId: {
        [Op.ne]: null,
      },
    },
    attributes: ["logId", "eventTime"],
    order: [["logId", "DESC"]],
  });

  if (latestByLogId?.logId) {
    return {
      lastLogId: latestByLogId.logId,
      from: latestByLogId.eventTime
        ? new Date(latestByLogId.eventTime).toISOString()
        : null,
    };
  }

  const latestByTime = await SkudAccessEvent.findOne({
    where: {
      externalSystem: "sigur",
      source: "sigur_pull",
      eventTime: {
        [Op.ne]: null,
      },
    },
    attributes: ["eventTime"],
    order: [["eventTime", "DESC"]],
  });

  return {
    lastLogId: null,
    from: latestByTime?.eventTime
      ? new Date(latestByTime.eventTime).toISOString()
      : null,
  };
};

const getDefaultSkudPullFrom = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString();
};

const getLiveEventWindows = () => [
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

const getLiveEventRawLimit = ({
  limit,
  employeeId,
  employeeName,
  externalEmpId,
  direction,
  allow,
  departmentId,
  counterpartyId,
  counterpartyName,
  constructionSiteId,
  constructionSiteName,
  passageOnly,
}) => {
  if (
    employeeId ||
    employeeName ||
    externalEmpId ||
    direction !== undefined ||
    allow !== undefined ||
    departmentId ||
    counterpartyId ||
    counterpartyName ||
    constructionSiteId ||
    constructionSiteName ||
    passageOnly
  ) {
    return Math.max(limit * 5, 500);
  }
  return limit;
};

const normalizeProviderEvent = (item) => {
  const toNullableInt = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const mapDirection = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const raw = String(value).trim().toUpperCase();
    if (raw === "IN") return 1;
    if (raw === "OUT") return 2;
    return toNullableInt(value);
  };

  const data = item?.data || {};
  const additionalData = item?.additionalData || {};
  const accessPoint = additionalData?.accessPoint || {};
  const externalEmpIdRaw =
    data?.employeeId ??
    data?.personId ??
    data?.userId ??
    item?.employeeId ??
    item?.personId ??
    item?.userId ??
    null;

  const accessPointRaw =
    data?.accessPointId ?? accessPoint?.id ?? item?.accessPointId ?? null;
  const directionRaw = data?.direction ?? item?.direction ?? null;
  const allowRaw =
    data?.allow ?? data?.allowed ?? item?.allow ?? item?.allowed ?? null;
  const keyHexRaw =
    data?.keyHex ?? data?.key ?? item?.keyHex ?? item?.key ?? null;

  return {
    logId: item?.logId ?? item?.id ?? null,
    externalEmpId:
      externalEmpIdRaw === null || externalEmpIdRaw === undefined
        ? null
        : String(externalEmpIdRaw),
    accessPoint: toNullableInt(accessPointRaw),
    direction: mapDirection(directionRaw),
    allow:
      allowRaw === null || allowRaw === undefined ? null : Boolean(allowRaw),
    keyHex:
      keyHexRaw === null || keyHexRaw === undefined ? null : String(keyHexRaw),
    eventType: item?.eventType || item?.type || "sigur_event",
    eventTime:
      item?.timestamp || item?.receivedTime || new Date().toISOString(),
    source: "sigur_pull",
    rawItem: item,
  };
};

const mapRawProviderEventType = (value) => {
  const numericValue = Number.parseInt(String(value ?? ""), 10);
  if (numericValue === RAW_PASSAGE_EVENT_TYPE) {
    return "PASS_DETECTED";
  }
  return Number.isFinite(numericValue) ? `EVENT_${numericValue}` : "sigur_event";
};

const normalizeRawProviderEvent = (item) => ({
  logId: item?.id ?? null,
  externalEmpId: (() => {
    const parsed = Number.parseInt(String(item?.accessObjectId ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : null;
  })(),
  accessPoint: (() => {
    const parsed = Number.parseInt(String(item?.accessPointId ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  })(),
  direction:
    item?.direction === null || item?.direction === undefined
      ? null
      : String(item.direction).trim().toUpperCase() === "IN"
        ? 1
        : String(item.direction).trim().toUpperCase() === "OUT"
          ? 2
          : null,
  allow: null,
  keyHex: null,
  eventType: mapRawProviderEventType(item?.type),
  eventTime: item?.timestamp || new Date().toISOString(),
  source: "sigur_live",
  rawItem: item,
});

const getProviderEventTimestampMs = (item) => {
  const rawValue = item?.timestamp || item?.receivedTime || item?.time || null;
  if (!rawValue) {
    return 0;
  }
  const parsed = new Date(rawValue).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const pullSkudEventsInternal = async ({
  from = null,
  to = null,
  limit = 100,
  offset = 0,
} = {}) => {
  const provider = getSkudProvider();
  const latestCursor =
    from || to ? { lastLogId: null, from: from || null } : await getLatestSkudPullCursor();
  const pullWindowMinutes = Math.max(
    1,
    Number.parseInt(String(skudConfig?.events?.pullWindowMinutes || 10), 10) || 10,
  );
  const pullOverlapMinutes = Math.max(
    0,
    Number.parseInt(String(skudConfig?.events?.pullOverlapMinutes || 2), 10) || 2,
  );
  const maxPages = Math.max(
    1,
    Number.parseInt(String(skudConfig?.events?.pullMaxPages || 5), 10) || 5,
  );
  const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);

  const nowMs = Date.now();
  const effectiveTo = to || new Date(nowMs).toISOString();
  const explicitFromMs = from ? new Date(from).getTime() : NaN;
  const latestFromMs = latestCursor?.from ? new Date(latestCursor.from).getTime() : NaN;
  const fallbackFromMs = nowMs - pullWindowMinutes * 60 * 1000;
  const candidateFromMs = Number.isFinite(explicitFromMs)
    ? explicitFromMs
    : Number.isFinite(latestFromMs)
      ? latestFromMs - pullOverlapMinutes * 60 * 1000
      : fallbackFromMs;
  const windowStartFloorMs = from ? candidateFromMs : fallbackFromMs;
  const effectiveFromMs = Math.max(windowStartFloorMs, candidateFromMs);
  const effectiveFrom = new Date(effectiveFromMs).toISOString();

  let fetched = 0;
  let imported = 0;
  let currentOffset = Math.max(Number(offset) || 0, 0);
  let currentLastLogId = latestCursor.lastLogId || null;
  let page = 0;

  while (page < maxPages) {
    const result = await provider.getEvents({
      startTime: effectiveFrom,
      endTime: effectiveTo,
      lastLogId: currentLastLogId,
      limit: pageLimit,
      offset: currentOffset,
    });

    const items = toProviderItems(result);
    if (!items.length) {
      break;
    }

    fetched += items.length;

    for (const item of items) {
      const payload = normalizeProviderEvent(item);
      const created = await ingestSkudEvent({
        payload,
        source: "sigur_pull",
        externalSystem: "sigur",
      });
      if (created) {
        imported += 1;
      }
    }

    const lastItem = items[items.length - 1];
    const nextLastLogId = Number.parseInt(
      String(lastItem?.logId ?? lastItem?.id ?? ""),
      10,
    );

    if (Number.isFinite(nextLastLogId) && nextLastLogId > 0) {
      if (currentLastLogId && nextLastLogId <= currentLastLogId) {
        break;
      }
      currentLastLogId = nextLastLogId;
      currentOffset = 0;
    } else {
      currentOffset += items.length;
    }

    page += 1;

    if (items.length < pageLimit) {
      break;
    }
  }

  return {
    fetched,
    imported,
    from: effectiveFrom,
    to: effectiveTo,
    limit: pageLimit,
    offset,
    lastLogId: currentLastLogId,
    pages: page,
  };
};

export const runSkudEventsPull = async (params = {}) => {
  ensureSkudModuleEnabled();
  const merged = parsePullParams(params, {});
  return pullSkudEventsInternal(merged);
};

const buildProviderEventView = async ({
  from,
  to,
  employeeId,
  employeeName,
  externalEmpId,
  counterpartyId,
  counterpartyName,
  constructionSiteId,
  constructionSiteName,
  accessPoint,
  direction,
  eventType,
  allow,
  departmentId,
  passageOnly = false,
  enrich = "full",
  useRawLog = false,
  sortBy = "eventTime",
  sortOrder = "desc",
  limit = 200,
  offset = 0,
}) => {
  const provider = getSkudProvider();
  const enrichModeRaw = String(enrich || "full").trim().toLowerCase();
  const requestedBaseEnrichment = enrichModeRaw === "base";
  const canUseBaseEnrichment =
    !employeeId &&
    !counterpartyId &&
    !counterpartyName &&
    !constructionSiteId &&
    !constructionSiteName &&
    !departmentId;
  const effectiveEnrichMode =
    requestedBaseEnrichment && canUseBaseEnrichment ? "base" : "full";
  const requestedEmployeeName = String(employeeName || "").trim();
  const normalizedEmployeeName = shouldUseEmployeeNameSearch(requestedEmployeeName)
    ? requestedEmployeeName
    : "";
  const resolvedSearchExternalEmpId =
    !externalEmpId && !employeeId && normalizedEmployeeName
      ? await resolveExternalEmpIdByEmployeeSearch({
          provider,
          employeeName: normalizedEmployeeName,
        })
      : null;
  const effectiveExternalEmpId = String(
    externalEmpId || resolvedSearchExternalEmpId || "",
  ).trim() || null;
  const effectiveEmployeeName = resolvedSearchExternalEmpId ? "" : normalizedEmployeeName;
  const shouldForceRawEventLog =
    Boolean(from) &&
    allow === undefined &&
    !employeeId &&
    !effectiveEmployeeName &&
    !effectiveExternalEmpId &&
    !counterpartyId &&
    !counterpartyName &&
    !constructionSiteId &&
    !constructionSiteName &&
    !departmentId &&
    passageOnly &&
    (!eventType || eventType === "PASS_DETECTED") &&
    sortBy === "eventTime" &&
    String(sortOrder || "desc").toLowerCase() === "desc";
  const providerFallbackMode =
    employeeId || effectiveExternalEmpId || effectiveEmployeeName
      ? "full"
      : shouldForceRawEventLog
        ? "name"
        : "none";
  const endTime = to || new Date().toISOString();
  const requiredCount = offset + limit;
  const accessPointId =
    accessPoint === undefined || accessPoint === null || accessPoint === ""
      ? undefined
      : Number.parseInt(String(accessPoint), 10);
  const accessObjectId =
    effectiveExternalEmpId === undefined
      || effectiveExternalEmpId === null
      || effectiveExternalEmpId === ""
      ? undefined
      : Number.parseInt(String(effectiveExternalEmpId), 10) || String(effectiveExternalEmpId);
  const canUseRawEventLog =
    useRawLog &&
    allow === undefined &&
    !employeeId &&
    !effectiveEmployeeName &&
    !counterpartyId &&
    !counterpartyName &&
    !constructionSiteId &&
    !constructionSiteName &&
    !departmentId &&
    passageOnly &&
    (!eventType || eventType === "PASS_DETECTED");
  const windowStartTimes = from
    ? [from]
    : getLiveEventWindows().map((durationMs) => new Date(Date.now() - durationMs).toISOString());

  const fetchWindowPage = async (startTime, limitValue, offsetValue) => {
    const result = await provider.getEvents({
      startTime,
      endTime,
      eventType: eventType || undefined,
      accessPointId,
      accessObjectId,
      limit: limitValue,
      offset: offsetValue,
    });
    return toProviderItems(result);
  };

  const applyLiveFilters = (items) => {
    let filtered = items;

    if (direction !== undefined && direction !== null && direction !== "") {
      const expectedDirection = Number.parseInt(String(direction), 10);
      filtered = filtered.filter((item) => item.direction === expectedDirection);
    }

    if (allow !== undefined) {
      filtered = filtered.filter((item) => item.allow === Boolean(allow));
    }

    if (passageOnly) {
      filtered = filtered.filter(
        (item) =>
          [1, 2].includes(item.direction) ||
          PASSAGE_EVENT_TYPES.includes(String(item.eventType || "")),
      );
    }

    const normalizedSortOrder = String(sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";
    if (sortBy === "eventTime") {
      filtered.sort((left, right) => {
        const leftTime = new Date(left.eventTime).getTime();
        const rightTime = new Date(right.eventTime).getTime();
        return normalizedSortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
      });
    }

    return filtered;
  };

  const finalizeItems = async (items, { hasMore = false } = {}) => {
    const enrichedItems = effectiveEnrichMode === "base"
      ? items
      : await enrichProviderEvents({
          items,
          provider,
          providerFallbackMode,
        });
    const employeeNameSearchRaw = String(effectiveEmployeeName || "").trim();
    const employeeNameSearch = employeeNameSearchRaw.toLowerCase();
    const employeeIdDigitsSearch = employeeNameSearchRaw.replace(/\D+/g, "");
    const hasEmployeeIdDigitsSearch = employeeIdDigitsSearch.length >= 3;
    const employeeNameFiltered = employeeNameSearch
      ? enrichedItems.filter((item) => {
          const rawEmployeeName = String(
            item?.rawItem?.additionalData?.accessObject?.data?.name ||
            item?.rawItem?.data?.employeeName ||
            item?.rawItem?.data?.personName ||
            item?.rawItem?.data?.name ||
            "",
          )
            .trim()
            .toLowerCase();
          const externalId = String(item?.externalEmpId || "").trim().toLowerCase();
          const localEmployeeId = String(item?.employeeId || "").trim().toLowerCase();
          const rawAccessObjectId = String(
            item?.rawItem?.additionalData?.accessObject?.id ||
            item?.rawItem?.data?.employeeId ||
            item?.rawItem?.accessObjectId ||
            "",
          )
            .trim()
            .toLowerCase();
          const matchesDigitsId = hasEmployeeIdDigitsSearch
            ? [externalId, localEmployeeId, rawAccessObjectId].some((value) =>
                String(value || "")
                  .replace(/\D+/g, "")
                  .includes(employeeIdDigitsSearch),
              )
            : false;
          return (
            String(item?.employeeName || "").trim().toLowerCase().includes(employeeNameSearch) ||
            rawEmployeeName.includes(employeeNameSearch) ||
            externalId.includes(employeeNameSearch) ||
            localEmployeeId.includes(employeeNameSearch) ||
            rawAccessObjectId.includes(employeeNameSearch) ||
            matchesDigitsId
          );
        })
      : enrichedItems;
    const employeeFiltered = employeeId
      ? employeeNameFiltered.filter(
          (item) => String(item?.employeeId || "") === String(employeeId),
        )
      : employeeNameFiltered;
    const externalFiltered = effectiveExternalEmpId
      ? employeeFiltered.filter(
          (item) => String(item?.externalEmpId || "") === String(effectiveExternalEmpId),
        )
      : employeeFiltered;
    const counterpartyFiltered = counterpartyId
      ? externalFiltered.filter((item) => {
          const ids = Array.isArray(item?.counterpartyIds)
            ? item.counterpartyIds
            : [];
          return ids.some((id) => String(id) === String(counterpartyId));
        })
      : externalFiltered;
    const normalizedCounterpartyNameFilter = normalizeCounterpartyLookupToken(
      counterpartyName,
    );
    const counterpartyByNameFiltered = normalizedCounterpartyNameFilter
      ? counterpartyFiltered.filter((item) => {
          const itemTokens = new Set(
            [
              item?.counterpartyName,
              item?.providerCounterpartyFolderName,
              item?.departmentName,
            ].flatMap((value) => buildCounterpartyLookupTokens(value)),
          );
          const filterTokens = buildCounterpartyLookupTokens(counterpartyName);
          return filterTokens.some((token) => itemTokens.has(token));
        })
      : counterpartyFiltered;
    const constructionSiteIdFiltered = constructionSiteId
      ? counterpartyByNameFiltered.filter((item) => {
          const eventSiteIds = Array.isArray(item?.eventConstructionSiteIds)
            ? item.eventConstructionSiteIds
            : [];
          if (eventSiteIds.some((id) => String(id) === String(constructionSiteId))) {
            return true;
          }
          const employeeSiteIds = Array.isArray(item?.constructionSiteIds)
            ? item.constructionSiteIds
            : [];
          return employeeSiteIds.some((id) => String(id) === String(constructionSiteId));
        })
      : counterpartyByNameFiltered;
    const normalizedConstructionSiteNameFilter = normalizeCounterpartyFolderToken(
      constructionSiteName,
    );
    const constructionSiteFiltered = normalizedConstructionSiteNameFilter
      ? constructionSiteIdFiltered.filter((item) => {
          const siteNames = Array.isArray(item?.eventConstructionSiteNames)
            ? item.eventConstructionSiteNames
            : [];
          const employeeSiteName = item?.constructionSiteName;
          const candidates = [employeeSiteName, ...siteNames]
            .map((value) => normalizeCounterpartyFolderToken(value))
            .filter(Boolean);
          return candidates.some((value) => value === normalizedConstructionSiteNameFilter);
        })
      : constructionSiteIdFiltered;
    const departmentFiltered = departmentId
      ? constructionSiteFiltered.filter(
          (item) => String(item?.departmentId || "") === String(departmentId),
        )
      : constructionSiteFiltered;
    const visibleItems = departmentFiltered.slice(offset, offset + limit);

    return {
      items: visibleItems,
      total: hasMore
        ? Math.max(departmentFiltered.length, offset + visibleItems.length + 1)
        : departmentFiltered.length,
    };
  };

  if (canUseRawEventLog || shouldForceRawEventLog) {
    const rawLimit = Math.min(limit + 1, 201);
    const rawResult = await provider.getRawEvents({
      startTime: from || undefined,
      endTime,
      accessPointId,
      accessObjectId,
      limit: rawLimit,
      offset,
      sortBy: "timestamp",
      sortOrder: "DESC",
      includeFields: "id,timestamp,accessPointId,accessObjectId,direction,type",
    });
    const rawItems = toProviderItems(rawResult);
    const normalizedItems = rawItems.map((item) => normalizeRawProviderEvent(item));
    const items = applyLiveFilters(normalizedItems);
    const hasMore = rawItems.length > limit;
    const limitedItems = items.slice(0, limit);
    const enrichedItems = effectiveEnrichMode === "base"
      ? limitedItems
      : await enrichProviderEvents({
          items: limitedItems,
          provider,
          providerFallbackMode,
        });

    return {
      items: enrichedItems,
      pagination: {
        total: hasMore ? offset + enrichedItems.length + 1 : offset + enrichedItems.length,
        limit,
        offset,
      },
    };
  }

  if (from) {
    const hasEmployeeFilters = Boolean(
      employeeId || effectiveExternalEmpId || effectiveEmployeeName,
    );
    const hasSigurNameFilters = Boolean(counterpartyName || constructionSiteName);
    const hasPostFilters = Boolean(
      employeeId ||
      effectiveEmployeeName ||
      effectiveExternalEmpId ||
      counterpartyId ||
      counterpartyName ||
      constructionSiteId ||
      constructionSiteName ||
      departmentId,
    );
    const minimumRetainLimit = hasEmployeeFilters
      ? 12000
      : hasSigurNameFilters
        ? Math.max(requiredCount * 6, 400)
      : hasPostFilters
        ? 5000
        : Math.max(requiredCount * 2, 500);
    const retainLimit = Math.max(
      getLiveEventRawLimit({
        limit: requiredCount,
        employeeId,
        employeeName: effectiveEmployeeName,
        externalEmpId: effectiveExternalEmpId,
        direction,
        allow,
        departmentId,
        counterpartyId,
        counterpartyName,
        constructionSiteId,
        constructionSiteName,
        passageOnly,
      }),
      minimumRetainLimit,
    );
    const batchLimit = hasEmployeeFilters
      ? 2000
      : hasSigurNameFilters
        ? Math.min(Math.max(requiredCount * 3, 200), 600)
      : hasPostFilters
        ? 3000
        : Math.min(Math.max(requiredCount, 500), 1000);
    let rawOffset = 0;
    let rawItems = [];
    let hasMore = false;

    while (true) {
      const batch = await fetchWindowPage(from, batchLimit, rawOffset);
      if (!batch.length) {
        break;
      }

      rawItems = rawItems.concat(batch);
      if (rawItems.length > retainLimit) {
        rawItems = rawItems
          .slice()
          .sort(
            (left, right) =>
              getProviderEventTimestampMs(right) - getProviderEventTimestampMs(left),
          )
          .slice(0, retainLimit);
      }
      rawOffset += batch.length;

      if (batch.length < batchLimit) {
        break;
      }

      if (rawItems.length >= retainLimit && rawOffset >= retainLimit) {
        hasMore = true;
        break;
      }
    }

    const items = applyLiveFilters(rawItems.map((item) => normalizeProviderEvent(item)));
    const finalized = await finalizeItems(items, { hasMore });
    return {
      items: finalized.items,
      pagination: {
        total: finalized.total,
        limit,
        offset,
      },
    };
  }

  const probeLimit = Math.min(
    Math.max(
      getLiveEventRawLimit({
        limit: requiredCount,
        employeeId,
        employeeName: effectiveEmployeeName,
        externalEmpId: effectiveExternalEmpId,
        direction,
        allow,
        departmentId,
        counterpartyId,
        counterpartyName,
        constructionSiteId,
        constructionSiteName,
        passageOnly,
      }),
      requiredCount * 2,
      200,
    ),
    3000,
  );

  let selectedItems = [];
  let selectedHasMore = false;

  for (const startTime of windowStartTimes) {
    const rawItems = await fetchWindowPage(startTime, probeLimit, 0);
    const items = applyLiveFilters(rawItems.map((item) => normalizeProviderEvent(item)));

    selectedItems = items;
    selectedHasMore = rawItems.length >= probeLimit;

    // Если данных уже достаточно для требуемой страницы — не расширяем окно.
    if (items.length >= requiredCount) {
      break;
    }

    // Если даже в текущем окне данных меньше лимита запроса, расширяем окно;
    // если это последнее окно — выходим.
    if (rawItems.length < probeLimit) {
      continue;
    }
  }

  const finalized = await finalizeItems(selectedItems, { hasMore: selectedHasMore });
  return {
    items: finalized.items,
    pagination: {
      total: finalized.total,
      limit,
      offset,
    },
  };
};

const buildStoredEventView = async ({
  from,
  to,
  employeeId,
  employeeName,
  externalEmpId,
  counterpartyId,
  counterpartyName,
  constructionSiteId,
  constructionSiteName,
  accessPoint,
  direction,
  eventType,
  allow,
  departmentId,
  passageOnly = false,
  enrich = "full",
  sortBy = "eventTime",
  sortOrder = "desc",
  limit = 200,
  offset = 0,
}) => {
  const enrichModeRaw = String(enrich || "full").trim().toLowerCase();
  const requestedBaseEnrichment = enrichModeRaw === "base";
  const canUseBaseEnrichment =
    !employeeId &&
    !counterpartyId &&
    !counterpartyName &&
    !constructionSiteId &&
    !constructionSiteName &&
    !departmentId;
  const effectiveEnrichMode =
    requestedBaseEnrichment && canUseBaseEnrichment ? "base" : "full";

  const requestedEmployeeName = String(employeeName || "").trim();
  const normalizedEmployeeName = shouldUseEmployeeNameSearch(requestedEmployeeName)
    ? requestedEmployeeName
    : "";
  const inferredExternalEmpId = extractExternalEmpIdFromSearchText(normalizedEmployeeName);
  const effectiveExternalEmpId = String(
    externalEmpId || inferredExternalEmpId || "",
  ).trim() || null;
  const effectiveEmployeeName = inferredExternalEmpId ? "" : normalizedEmployeeName;

  const where = {
    externalSystem: "sigur",
    source: "sigur_pull",
  };
  if (from || to) {
    where.eventTime = {};
    if (from) {
      where.eventTime[Op.gte] = new Date(from);
    }
    if (to) {
      where.eventTime[Op.lte] = new Date(to);
    }
  }
  if (employeeId) {
    where.employeeId = employeeId;
  }
  if (effectiveExternalEmpId) {
    where.externalEmpId = String(effectiveExternalEmpId);
  }
  if (accessPoint !== undefined && accessPoint !== null && accessPoint !== "") {
    where.accessPoint = Number.parseInt(String(accessPoint), 10);
  }
  if (direction !== undefined && direction !== null && direction !== "") {
    where.direction = Number.parseInt(String(direction), 10);
  }
  if (eventType) {
    where.eventType = String(eventType).trim();
  }
  if (allow !== undefined) {
    where.allow = Boolean(allow);
  }
  if (passageOnly) {
    where[Op.or] = [
      { direction: { [Op.in]: [1, 2] } },
      { eventType: { [Op.in]: PASSAGE_EVENT_TYPES } },
    ];
  }

  const include = [
    {
      model: Employee,
      as: "employee",
      required: false,
      attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
    },
  ];
  const normalizedSortOrder = String(sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const order = sortBy === "eventTime"
    ? [["eventTime", normalizedSortOrder], ["id", normalizedSortOrder]]
    : [["eventTime", "DESC"], ["id", "DESC"]];

  const mapStoredRowToItem = (eventRow) => {
    const rawPayload = eventRow?.rawPayload && typeof eventRow.rawPayload === "object"
      ? eventRow.rawPayload
      : {};
    const rawItem = rawPayload?.rawItem && typeof rawPayload.rawItem === "object"
      ? rawPayload.rawItem
      : rawPayload;
    const eventTimeIso = eventRow?.eventTime
      ? new Date(eventRow.eventTime).toISOString()
      : new Date().toISOString();

    return {
      id: eventRow?.id || null,
      logId: eventRow?.logId || null,
      externalEmpId:
        eventRow?.externalEmpId === undefined || eventRow?.externalEmpId === null
          ? null
          : String(eventRow.externalEmpId),
      employeeId: eventRow?.employeeId || eventRow?.employee?.id || null,
      employeeName: buildEmployeeDisplayName(eventRow?.employee) || null,
      accessPoint:
        eventRow?.accessPoint === undefined || eventRow?.accessPoint === null
          ? null
          : Number.parseInt(String(eventRow.accessPoint), 10),
      direction:
        eventRow?.direction === undefined || eventRow?.direction === null
          ? null
          : Number.parseInt(String(eventRow.direction), 10),
      keyHex:
        eventRow?.keyHex === undefined || eventRow?.keyHex === null
          ? null
          : String(eventRow.keyHex),
      allow:
        eventRow?.allow === undefined || eventRow?.allow === null
          ? null
          : Boolean(eventRow.allow),
      decisionMessage: eventRow?.decisionMessage || null,
      eventType: String(eventRow?.eventType || rawPayload?.eventType || "sigur_event"),
      eventTime: eventTimeIso,
      source: String(eventRow?.source || "sigur_pull"),
      rawItem: rawItem || null,
    };
  };

  const hasPostFilters = Boolean(
    effectiveEmployeeName ||
    counterpartyId ||
    counterpartyName ||
    constructionSiteId ||
    constructionSiteName ||
    departmentId,
  );
  const providerFallbackMode =
    employeeId || effectiveExternalEmpId || effectiveEmployeeName
      ? "full"
      : "none";

  const enrichItems = async (items) => {
    if (effectiveEnrichMode === "base") {
      return items;
    }
    const provider = getSkudProvider();
    return enrichProviderEvents({
      items,
      provider,
      providerFallbackMode,
    });
  };

  const applyPostFilters = (items) => {
    const employeeNameSearchRaw = String(effectiveEmployeeName || "").trim();
    const employeeNameSearch = employeeNameSearchRaw.toLowerCase();
    const employeeIdDigitsSearch = employeeNameSearchRaw.replace(/\D+/g, "");
    const hasEmployeeIdDigitsSearch = employeeIdDigitsSearch.length >= 3;
    const employeeNameFiltered = employeeNameSearch
      ? items.filter((item) => {
          const rawEmployeeName = String(
            item?.rawItem?.additionalData?.accessObject?.data?.name ||
            item?.rawItem?.data?.employeeName ||
            item?.rawItem?.data?.personName ||
            item?.rawItem?.data?.name ||
            "",
          )
            .trim()
            .toLowerCase();
          const externalId = String(item?.externalEmpId || "").trim().toLowerCase();
          const localEmployeeId = String(item?.employeeId || "").trim().toLowerCase();
          const rawAccessObjectId = String(
            item?.rawItem?.additionalData?.accessObject?.id ||
            item?.rawItem?.data?.employeeId ||
            item?.rawItem?.accessObjectId ||
            "",
          )
            .trim()
            .toLowerCase();
          const matchesDigitsId = hasEmployeeIdDigitsSearch
            ? [externalId, localEmployeeId, rawAccessObjectId].some((value) =>
                String(value || "")
                  .replace(/\D+/g, "")
                  .includes(employeeIdDigitsSearch),
              )
            : false;
          return (
            String(item?.employeeName || "").trim().toLowerCase().includes(employeeNameSearch) ||
            rawEmployeeName.includes(employeeNameSearch) ||
            externalId.includes(employeeNameSearch) ||
            localEmployeeId.includes(employeeNameSearch) ||
            rawAccessObjectId.includes(employeeNameSearch) ||
            matchesDigitsId
          );
        })
      : items;
    const counterpartyIdFiltered = counterpartyId
      ? employeeNameFiltered.filter((item) => {
          const ids = Array.isArray(item?.counterpartyIds)
            ? item.counterpartyIds
            : [];
          return ids.some((id) => String(id) === String(counterpartyId));
        })
      : employeeNameFiltered;
    const normalizedCounterpartyNameFilter = normalizeCounterpartyLookupToken(counterpartyName);
    const counterpartyByNameFiltered = normalizedCounterpartyNameFilter
      ? counterpartyIdFiltered.filter((item) => {
          const itemTokens = new Set(
            [
              item?.counterpartyName,
              item?.providerCounterpartyFolderName,
              item?.departmentName,
            ].flatMap((value) => buildCounterpartyLookupTokens(value)),
          );
          const filterTokens = buildCounterpartyLookupTokens(counterpartyName);
          return filterTokens.some((token) => itemTokens.has(token));
        })
      : counterpartyIdFiltered;
    const constructionSiteIdFiltered = constructionSiteId
      ? counterpartyByNameFiltered.filter((item) => {
          const eventSiteIds = Array.isArray(item?.eventConstructionSiteIds)
            ? item.eventConstructionSiteIds
            : [];
          if (eventSiteIds.some((id) => String(id) === String(constructionSiteId))) {
            return true;
          }
          const employeeSiteIds = Array.isArray(item?.constructionSiteIds)
            ? item.constructionSiteIds
            : [];
          return employeeSiteIds.some((id) => String(id) === String(constructionSiteId));
        })
      : counterpartyByNameFiltered;
    const normalizedConstructionSiteNameFilter = normalizeCounterpartyFolderToken(
      constructionSiteName,
    );
    const constructionSiteFiltered = normalizedConstructionSiteNameFilter
      ? constructionSiteIdFiltered.filter((item) => {
          const siteNames = Array.isArray(item?.eventConstructionSiteNames)
            ? item.eventConstructionSiteNames
            : [];
          const employeeSiteName = item?.constructionSiteName;
          const candidates = [employeeSiteName, ...siteNames]
            .map((value) => normalizeCounterpartyFolderToken(value))
            .filter(Boolean);
          return candidates.some((value) => value === normalizedConstructionSiteNameFilter);
        })
      : constructionSiteIdFiltered;
    return departmentId
      ? constructionSiteFiltered.filter(
          (item) => String(item?.departmentId || "") === String(departmentId),
        )
      : constructionSiteFiltered;
  };

  if (!hasPostFilters) {
    const result = await SkudAccessEvent.findAndCountAll({
      where,
      include,
      order,
      distinct: true,
      limit,
      offset,
    });
    const mappedItems = (Array.isArray(result?.rows) ? result.rows : []).map(mapStoredRowToItem);
    const enrichedItems = await enrichItems(mappedItems);
    return {
      items: enrichedItems,
      pagination: {
        total: Number(result?.count || 0),
        limit,
        offset,
      },
    };
  }

  const requiredCount = offset + limit;
  const probeLimit = Math.min(
    Math.max(requiredCount * 8, 500),
    5000,
  );
  const probeRows = await SkudAccessEvent.findAll({
    where,
    include,
    order,
    limit: probeLimit,
    offset: 0,
  });
  const mappedProbeItems = probeRows.map(mapStoredRowToItem);
  const enrichedProbeItems = await enrichItems(mappedProbeItems);
  const filteredItems = applyPostFilters(enrichedProbeItems);
  const visibleItems = filteredItems.slice(offset, offset + limit);
  const hasMore = probeRows.length >= probeLimit;

  return {
    items: visibleItems,
    pagination: {
      total: hasMore
        ? Math.max(filteredItems.length, offset + visibleItems.length + 1)
        : filteredItems.length,
      limit,
      offset,
    },
  };
};

const parseBasicAuthHeader = (headerValue) => {
  const value = String(headerValue || "");
  if (!value.startsWith("Basic ")) {
    return null;
  }

  const encoded = value.slice("Basic ".length).trim();
  if (!encoded) {
    return null;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const delimiterIndex = decoded.indexOf(":");
  if (delimiterIndex < 0) {
    return null;
  }

  return {
    username: decoded.slice(0, delimiterIndex),
    password: decoded.slice(delimiterIndex + 1),
  };
};

const assertWebhookAccess = (req) => {
  ensureSkudModuleEnabled();

  const allowedIps = skudConfig.webhook.allowedIps;
  if (allowedIps.length > 0) {
    const requestIp = req.ip || req.connection?.remoteAddress || "";
    if (!allowedIps.includes(requestIp)) {
      throw new AppError("IP не разрешен для SKUD webhook", 403);
    }
  }

  const requiredUser = skudConfig.webhook.basicUser;
  const requiredPass = skudConfig.webhook.basicPass;

  if (!requiredUser || !requiredPass) {
    throw new AppError("SKUD webhook auth не настроен", 500);
  }

  const parsed = parseBasicAuthHeader(req.headers.authorization);
  if (
    !parsed ||
    parsed.username !== requiredUser ||
    parsed.password !== requiredPass
  ) {
    throw new AppError("Неверные учетные данные webhook", 401);
  }
};

export const skudController = {
  async health(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const data = await getSkudHealth();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async stats(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const data = await getSkudStats({
        from: req.query.from,
        to: req.query.to,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async events(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const cacheKey = buildEventsCacheKey(req.query);
      const cachedData = getCachedEventsResponse(cacheKey);
      if (cachedData) {
        res.json({
          success: true,
          data: cachedData,
        });
        return;
      }
      const { limit, offset } = parsePagination(req.query);
      const data = await buildStoredEventView({
        from: req.query.from,
        to: req.query.to,
        employeeId: req.query.employeeId,
        employeeName: req.query.employeeName,
        externalEmpId: req.query.externalEmpId,
        counterpartyId: req.query.counterpartyId,
        counterpartyName: req.query.counterpartyName,
        constructionSiteId: req.query.constructionSiteId,
        constructionSiteName: req.query.constructionSiteName,
        accessPoint: req.query.accessPoint,
        direction: req.query.direction,
        eventType: req.query.eventType,
        allow:
          req.query.allow === undefined
            ? undefined
            : parseBooleanParam(req.query.allow, false),
        departmentId: req.query.departmentId,
        passageOnly: parseBooleanParam(req.query.passageOnly, false),
        enrich: req.query.enrich,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        limit,
        offset,
      });

      setCachedEventsResponse(cacheKey, data);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async syncJobs(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { limit, offset } = parsePagination(req.query);
      const result = await listSkudSyncJobs({
        status: req.query.status,
        operation: req.query.operation,
        employeeId: req.query.employeeId,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          items: result.rows,
          pagination: {
            limit,
            offset,
            total: result.count,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async previewBindingImport(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const data = await previewSkudBindingImport(rows);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async executeBindingImport(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const data = await executeSkudBindingImport({
        rows,
        userId: req.user.id,
      });
      res.status(202).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async localEmployees(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { limit, offset } = parsePagination(req.query);
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();

      const rows = await Employee.findAll({
        where: {
          isDeleted: false,
          markedForDeletion: false,
        },
        attributes: [
          "id",
          "firstName",
          "lastName",
          "middleName",
          "inn",
          "isActive",
          "updatedAt",
        ],
        include: [
          {
            model: SkudPersonBinding,
            as: "skudBindings",
            required: false,
            where: {
              externalSystem: "sigur",
              isActive: true,
            },
            attributes: ["id", "externalEmpId", "updatedAt"],
          },
        ],
        order: [["updatedAt", "DESC"]],
        limit: Math.min(limit * 4, 500),
        offset,
      });

      const filtered = search
        ? rows.filter((employee) => {
            const fullName = buildEmployeeDisplayName(employee).toLowerCase();
            const extId = String(
              employee?.skudBindings?.[0]?.externalEmpId || "",
            ).toLowerCase();
            return (
              String(employee?.id || "")
                .toLowerCase()
                .includes(search) ||
              String(employee?.inn || "")
                .toLowerCase()
                .includes(search) ||
              fullName.includes(search) ||
              extId.includes(search)
            );
          })
        : rows;

      const items = filtered.slice(0, limit).map((employee) => ({
        id: employee.id,
        fullName: buildEmployeeDisplayName(employee) || "—",
        inn: employee.inn || null,
        isActive: employee.isActive,
        binding: employee?.skudBindings?.[0]
          ? {
              id: employee.skudBindings[0].id,
              externalEmpId: employee.skudBindings[0].externalEmpId,
              updatedAt: employee.skudBindings[0].updatedAt,
            }
          : null,
      }));

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            limit,
            offset,
            total: search ? filtered.length : items.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async providerEmployees(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const { limit, offset } = parsePagination(req.query);
      const search = String(req.query.search || "").trim();
      const departmentId = String(req.query.departmentId || "").trim();
      const providerFilters = {
        ...(departmentId ? { departmentId } : {}),
        ...(search ? { name: search } : {}),
      };

      const mapEmployee = (item) => ({
        id:
          item?.id === undefined || item?.id === null ? null : String(item.id),
        name: String(item?.name || "").trim() || "—",
        description: String(item?.description || "").trim() || null,
        status: String(item?.status || "").trim() || null,
        departmentId:
          item?.departmentId === undefined || item?.departmentId === null
            ? null
            : String(item.departmentId),
        departmentName:
          String(item?.departmentName || item?.department_name || "").trim() ||
          null,
        raw: item,
      });
      const response = await provider.getEmployees({
        limit,
        offset,
        filters: providerFilters,
      });

      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.items)
          ? response.items
          : [];

      const filtered = rows.map(mapEmployee);
      const total =
        response?.pagination?.total
        || response?.total
        || response?.count
        || filtered.length;

      res.json({
        success: true,
        data: {
          items: filtered,
          pagination: {
            limit,
            offset,
            total,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async providerDepartments(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();
      const { departments: rows, departmentsById } = await getProviderDepartmentsCatalog(provider);

      const mapped = rows.map((item) => {
        const id =
          item?.id === undefined || item?.id === null ? null : String(item.id);
        const parentId =
          item?.parentId === undefined || item?.parentId === null
            ? null
            : String(item.parentId);
        const path = buildDepartmentPath(item, departmentsById);

        return {
          id,
          parentId: parentId && parentId !== "0" ? parentId : null,
          name: String(item?.name || "").trim() || "—",
          description: String(item?.description || "").trim() || null,
          path,
          pathLabel: path.join(" / ") || String(item?.name || "").trim() || "—",
          raw: item,
        };
      });

      const filtered = search
        ? mapped.filter((item) => {
            return (
              String(item.id || "")
                .toLowerCase()
                .includes(search) ||
              String(item.name || "")
                .toLowerCase()
                .includes(search) ||
              String(item.pathLabel || "")
                .toLowerCase()
                .includes(search)
            );
          })
        : mapped;

      res.json({
        success: true,
        data: {
          items: filtered,
          pagination: {
            limit: filtered.length,
            offset: 0,
            total: filtered.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async providerAccessPoints(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const search = String(req.query.search || "").trim().toLowerCase();
      const catalog = await getAccessPointCatalog(provider);
      const items = Array.from(catalog.pointsById.values())
        .map((accessPoint) =>
          mapProviderAccessPoint({
            accessPoint,
            hierarchyById: catalog.hierarchyById,
          }),
        )
        .filter(Boolean);

      const filtered = search
        ? items.filter((item) =>
            [item.id, item.name, item.pathLabel, item.label]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search)),
          )
        : items;

      filtered.sort((left, right) => String(left.label).localeCompare(String(right.label), "ru"));

      res.json({
        success: true,
        data: {
          items: filtered,
          pagination: {
            limit: filtered.length,
            offset: 0,
            total: filtered.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async createProviderDepartment(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const parentId = String(req.body?.parentId || "").trim();
      const created = await provider.createDepartment({
        name: req.body?.name,
        parentId: parentId || 0,
        description: req.body?.description || "",
      });

      res.status(201).json({
        success: true,
        data: {
          id: created?.id === undefined || created?.id === null ? null : String(created.id),
          parentId:
            created?.parentId === undefined || created?.parentId === null
              ? null
              : String(created.parentId),
          name: String(created?.name || req.body?.name || "").trim() || "—",
          description: String(created?.description || "").trim() || null,
          raw: created || null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProviderDepartment(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const parentId =
        req.body?.parentId === undefined || req.body?.parentId === null
          ? undefined
          : String(req.body.parentId).trim() || 0;

      const updated = await provider.updateDepartment(req.params.departmentId, {
        ...(req.body?.name !== undefined ? { name: req.body.name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(req.body?.description !== undefined ? { description: req.body.description } : {}),
      });

      res.json({
        success: true,
        data: {
          id: updated?.id === undefined || updated?.id === null ? req.params.departmentId : String(updated.id),
          parentId:
            updated?.parentId === undefined || updated?.parentId === null
              ? null
              : String(updated.parentId),
          name: String(updated?.name || req.body?.name || "").trim() || "—",
          description:
            updated?.description === undefined || updated?.description === null
              ? null
              : String(updated.description).trim() || null,
          raw: updated || null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteProviderDepartment(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      await provider.deleteDepartment(req.params.departmentId);

      res.json({
        success: true,
        data: {
          id: String(req.params.departmentId),
          deleted: true,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async providerEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const employee = await provider.getEmployeeById(req.params.externalEmpId);

      res.json({
        success: true,
        data: {
          id:
            employee?.id === undefined || employee?.id === null
              ? null
              : String(employee.id),
          name: String(employee?.name || "").trim() || null,
          departmentId:
            employee?.departmentId === undefined || employee?.departmentId === null
              ? null
              : Number.parseInt(String(employee.departmentId), 10),
          isBlocked:
            employee?.isBlocked === undefined || employee?.isBlocked === null
              ? null
              : Boolean(employee.isBlocked),
          location: employee?.location || null,
          raw: employee || null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async auditBindings(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const { limit, offset } = parsePagination(req.query);
      const mismatchOnly = parseBooleanParam(req.query.mismatchOnly, false);
      const search = String(req.query.search || "").trim().toLowerCase();

      const { count, rows } = await SkudPersonBinding.findAndCountAll({
        where: {
          externalSystem: "sigur",
          isActive: true,
        },
        attributes: ["id", "employeeId", "externalEmpId", "updatedAt"],
        include: [
          {
            model: Employee,
            as: "employee",
            required: false,
            attributes: ["id", "firstName", "lastName", "middleName"],
          },
        ],
        order: [["updatedAt", "DESC"]],
        limit,
        offset,
      });

      const providerEmployees = await Promise.all(
        rows.map(async (binding) => {
          const externalEmpId = String(binding.externalEmpId || "").trim();
          if (!externalEmpId) {
            return null;
          }
          try {
            return await provider.getEmployeeById(externalEmpId);
          } catch {
            return null;
          }
        }),
      );

      let items = rows.map((binding, index) => {
        const localName = buildEmployeeDisplayName(binding.employee) || null;
        const providerEmployee = providerEmployees[index];
        const sigurName = String(providerEmployee?.name || "").trim() || null;
        const nameMatch =
          normalizePersonNameForCompare(localName) &&
          normalizePersonNameForCompare(localName) ===
            normalizePersonNameForCompare(sigurName);

        return {
          id: binding.id,
          employeeId: binding.employeeId || null,
          externalEmpId: binding.externalEmpId || null,
          localName,
          sigurName,
          nameMatch: Boolean(nameMatch),
          updatedAt: binding.updatedAt,
        };
      });

      if (mismatchOnly) {
        items = items.filter((item) => !item.nameMatch);
      }

      if (search) {
        items = items.filter((item) => {
          return (
            String(item.employeeId || "").toLowerCase().includes(search) ||
            String(item.externalEmpId || "").toLowerCase().includes(search) ||
            String(item.localName || "").toLowerCase().includes(search) ||
            String(item.sigurName || "").toLowerCase().includes(search)
          );
        });
      }

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            limit,
            offset,
            total: count,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async pullEvents(req, res, next) {
    try {
      const { from, to, limit, offset } = parsePullParams(req.body, req.query);
      const data = await runSkudEventsPull({ from, to, limit, offset });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async upsertBinding(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const binding = await upsertEmployeeBinding({
        employeeId,
        externalSystem: req.body.externalSystem || "sigur",
        externalEmpId: req.body.externalEmpId,
        source: req.body.source || "manual",
        userId: req.user.id,
        metadata: req.body.metadata || {},
      });

      res.json({ success: true, data: binding });
    } catch (error) {
      next(error);
    }
  },

  async syncEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const syncJob = await enqueueSkudSyncForEmployee({
        employeeId,
        operation: "sync_employee",
        userId: req.user.id,
        source: "manual_sync",
        payload: {
          ...(req.body?.sigurDepartmentPath !== undefined
            ? { sigurDepartmentPath: req.body.sigurDepartmentPath }
            : {}),
          ...(req.body?.accessStartTime ? { accessStartTime: req.body.accessStartTime } : {}),
          ...(req.body?.accessEndTime ? { accessEndTime: req.body.accessEndTime } : {}),
        },
      });

      res.status(202).json({ success: true, data: syncJob });
    } catch (error) {
      next(error);
    }
  },

  async blockEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const syncJob = await enqueueSkudSyncForEmployee({
        employeeId,
        operation: "block_employee",
        userId: req.user.id,
        source: "manual_block",
        reasonCode: req.body?.reasonCode || "manual_block",
        statusReason: req.body?.statusReason || "Ручная блокировка из SKUD",
        priority: req.body?.priority || "normal",
      });

      res.status(202).json({ success: true, data: syncJob });
    } catch (error) {
      next(error);
    }
  },

  async unblockEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const syncJob = await enqueueSkudSyncForEmployee({
        employeeId,
        operation: "unblock_employee",
        userId: req.user.id,
        source: "manual_unblock",
        reasonCode: req.body?.reasonCode || "manual_unblock",
        statusReason: req.body?.statusReason || "Ручная разблокировка из SKUD",
        priority: req.body?.priority || "normal",
      });

      res.status(202).json({ success: true, data: syncJob });
    } catch (error) {
      next(error);
    }
  },

  async blacklistEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const syncJob = await enqueueSkudSyncForEmployee({
        employeeId,
        operation: "block_employee",
        userId: req.user.id,
        source: "rkl_blacklist",
        reasonCode: req.body?.reasonCode || "rkl_blacklist",
        statusReason:
          req.body?.statusReason || "Blacklist/RKL block in PassDesk",
        priority: "high",
      });

      res.status(202).json({ success: true, data: syncJob });
    } catch (error) {
      next(error);
    }
  },

  async clearBlacklistEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const syncJob = await enqueueSkudSyncForEmployee({
        employeeId,
        operation: "unblock_employee",
        userId: req.user.id,
        source: "rkl_blacklist_clear",
        reasonCode: req.body?.reasonCode || "rkl_blacklist_clear",
        statusReason:
          req.body?.statusReason || "Blacklist/RKL clear in PassDesk",
        priority: "normal",
      });

      res.status(202).json({ success: true, data: syncJob });
    } catch (error) {
      next(error);
    }
  },

  async listCards(req, res, next) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const result = await listSkudCards({
        employeeId: req.query.employeeId,
        status: req.query.status,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          items: result.rows,
          pagination: {
            limit,
            offset,
            total: result.count,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async assignCard(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId, cardNumber, cardType, notes } = req.body || {};
      if (!employeeId || !cardNumber) {
        throw new AppError("employeeId и cardNumber обязательны", 400);
      }

      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const result = await assignSkudCard({
        employeeId,
        cardNumber,
        cardType,
        notes,
        userId: req.user.id,
      });

      const activeMapping = employee.employeeCounterpartyMappings?.find(
        (mapping) => !mapping?.dismissedAt,
      );
      await logAuditEvent({
        userId: req.user.id,
        eventType: AUDIT_EVENT_TYPES.PASS_ASSIGNED,
        entityType: "employee",
        entityId: employeeId,
        details: {
          counterpartyId: activeMapping?.counterpartyId || null,
          counterpartyName: activeMapping?.counterparty?.name || null,
          cardId: result?.card?.id || null,
          cardNumber: result?.card?.cardNumber || cardNumber,
          cardType: result?.card?.cardType || cardType || null,
          syncJobId: result?.syncJob?.id || null,
        },
        req,
      });

      res.status(202).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async blockCard(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { cardId } = req.body || {};
      if (!cardId) {
        throw new AppError("cardId обязателен", 400);
      }

      const result = await blockSkudCard({
        cardId,
        userId: req.user.id,
      });

      res.status(202).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async unbindCard(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { cardId } = req.body || {};
      if (!cardId) {
        throw new AppError("cardId обязателен", 400);
      }

      const result = await unbindSkudCard({
        cardId,
        userId: req.user.id,
      });

      const employee =
        result?.card?.employeeId
          ? await fetchEmployeeForAccess(result.card.employeeId)
          : null;
      const activeMapping = employee?.employeeCounterpartyMappings?.find(
        (mapping) => !mapping?.dismissedAt,
      );
      await logAuditEvent({
        userId: req.user.id,
        eventType: AUDIT_EVENT_TYPES.PASS_UNBOUND,
        entityType: "employee",
        entityId: result?.card?.employeeId || null,
        details: {
          counterpartyId: activeMapping?.counterpartyId || null,
          counterpartyName: activeMapping?.counterparty?.name || null,
          cardId: result?.card?.id || null,
          cardNumber: result?.card?.cardNumber || null,
          syncJobId: result?.syncJob?.id || null,
        },
        req,
      });

      res.status(202).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async unbindLiveCard(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId, externalCardId } = req.body || {};
      if (!employeeId || !externalCardId) {
        throw new AppError("employeeId и externalCardId обязательны", 400);
      }

      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const result = await unbindLiveSkudCard({
        employeeId,
        externalCardId,
        userId: req.user.id,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async blockLiveEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.body || {};
      if (!employeeId) {
        throw new AppError("employeeId обязателен", 400);
      }

      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const result = await blockLiveSkudEmployee({
        employeeId,
        userId: req.user.id,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async unblockLiveEmployee(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.body || {};
      if (!employeeId) {
        throw new AppError("employeeId обязателен", 400);
      }

      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const result = await unblockLiveSkudEmployee({
        employeeId,
        userId: req.user.id,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async issueQr(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId, tokenType, channel } = req.body || {};
      if (!employeeId) {
        throw new AppError("employeeId обязателен", 400);
      }

      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "read");

      const data = await issueSkudQrToken({
        employeeId,
        tokenType,
        channel,
        issuedBy: req.user.id,
      });

      if (channel === "telegram") {
        const telegramResult = await sendSkudQrToEmployeeTelegram({
          employeeId,
          qrData: data,
        });
        data.delivery = {
          channel: "telegram",
          ...telegramResult,
        };
      }

      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async verifyQr(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { token, markUsed = false } = req.body || {};
      if (!token) {
        throw new AppError("token обязателен", 400);
      }

      const data = await verifySkudQrToken({
        token,
        markUsed: Boolean(markUsed),
      });

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async webdelDecision(req, res, next) {
    try {
      assertWebhookAccess(req);
      const decision = await processSkudDecisionPayload({
        payload: req.body || {},
      });

      res.json({
        allow: decision.allow,
        ...(decision.message ? { message: decision.message } : {}),
      });
    } catch (error) {
      next(error);
    }
  },

  async webdelEvents(req, res, next) {
    try {
      assertWebhookAccess(req);
      const payload = req.body;

      if (Array.isArray(payload)) {
        for (const item of payload) {
          await enqueueSkudEventsIngestJob(item);
        }
      } else {
        await enqueueSkudEventsIngestJob(payload || {});
      }

      res.json({ success: true, message: "accepted" });
    } catch (error) {
      next(error);
    }
  },

  async ingestEventDirect(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const event = await ingestSkudEvent({
        payload: req.body || {},
        source: req.body?.source || "manual",
      });

      res.status(201).json({ success: true, data: event });
    } catch (error) {
      next(error);
    }
  },

  async getEmployeeBinding(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "read");

      const binding = await getEmployeeBinding({
        employeeId,
      });

      const accessState = await SkudAccessState.findOne({
        where: { employeeId, externalSystem: "sigur" },
        attributes: ["status", "source", "updatedAt"],
      });

      res.json({ success: true, data: { ...binding?.toJSON?.() ?? binding, accessState: accessState ?? null } });
    } catch (error) {
      next(error);
    }
  },

  async setBindingDepartment(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const { sigurDepartmentId } = req.body;

      const binding = await getEmployeeBinding({ employeeId });
      if (!binding) {
        throw new AppError("Привязка к СКУД не найдена. Сначала синхронизируйте сотрудника.", 404);
      }

      await binding.update({
        metadata: {
          ...(binding.metadata || {}),
          sigurDepartmentId: sigurDepartmentId || null,
        },
        updatedBy: req.user?.id || null,
        updatedAt: new Date(),
      });

      res.json({ success: true, data: binding });
    } catch (error) {
      next(error);
    }
  },

  async updateBindingMeta(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const { employeeId } = req.params;
      const employee = await fetchEmployeeForAccess(employeeId);
      if (!employee || employee.isDeleted) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, employee, "write");

      const { accessEndTime, cardExpirationDate, sigurDepartmentId } = req.body;

      let binding = await SkudPersonBinding.findOne({
        where: {
          employeeId,
          externalSystem: "sigur",
        },
      });
      if (!binding) {
        // Биндинга ещё нет — создаём заглушку для хранения метаданных
        binding = await SkudPersonBinding.create({
          employeeId,
          externalSystem: "sigur",
          externalEmpId: `pending:${employeeId}`,
          source: "manual",
          isActive: false,
          metadata: {},
          createdBy: req.user?.id || null,
          updatedBy: req.user?.id || null,
        });
      }

      const patch = {};
      if (accessEndTime !== undefined) patch.accessEndTime = accessEndTime || null;
      if (cardExpirationDate !== undefined) patch.cardExpirationDate = cardExpirationDate || null;
      if (sigurDepartmentId !== undefined) patch.sigurDepartmentId = sigurDepartmentId || null;

      await binding.update({
        metadata: { ...(binding.metadata || {}), ...patch },
        updatedBy: req.user?.id || null,
        updatedAt: new Date(),
      });

      res.json({ success: true, data: binding });
    } catch (error) {
      next(error);
    }
  },

  // --- Site Access Points mapping ---

  async getSiteAccessPoints(req, res, next) {
    try {
      const canUseSkudSiteAccessPoints = await hasTable(SKUD_SITE_ACCESS_POINTS_TABLE);
      if (!canUseSkudSiteAccessPoints) {
        return res.json({ success: true, data: [] });
      }
      const { siteId } = req.params;
      const rows = await SkudSiteAccessPoint.findAll({
        where: { constructionSiteId: siteId },
        order: [["createdAt", "ASC"]],
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },

  // Body: { accessPointIds: number[] }
  // Replaces all mappings for the site atomically
  async setSiteAccessPoints(req, res, next) {
    try {
      const canUseSkudSiteAccessPoints = await hasTable(SKUD_SITE_ACCESS_POINTS_TABLE);
      if (!canUseSkudSiteAccessPoints) {
        throw new AppError(
          "Таблица skud_site_access_points отсутствует. Примените миграции СКУД.",
          503,
        );
      }
      const { siteId } = req.params;
      const ids = req.body.accessPointIds;

      await SkudSiteAccessPoint.destroy({ where: { constructionSiteId: siteId } });

      if (ids && ids.length > 0) {
        await SkudSiteAccessPoint.bulkCreate(
          ids.map((apId) => ({ constructionSiteId: siteId, sigurAccessPointId: apId })),
          { ignoreDuplicates: true },
        );
      }

      const rows = await SkudSiteAccessPoint.findAll({
        where: { constructionSiteId: siteId },
        order: [["createdAt", "ASC"]],
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },

  async deleteSiteAccessPoint(req, res, next) {
    try {
      const canUseSkudSiteAccessPoints = await hasTable(SKUD_SITE_ACCESS_POINTS_TABLE);
      if (!canUseSkudSiteAccessPoints) {
        throw new AppError(
          "Таблица skud_site_access_points отсутствует. Примените миграции СКУД.",
          503,
        );
      }
      const { id } = req.params;
      const deleted = await SkudSiteAccessPoint.destroy({ where: { id } });
      if (!deleted) throw new AppError("Запись не найдена", 404);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
