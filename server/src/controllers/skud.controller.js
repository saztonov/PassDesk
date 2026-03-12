import { Op } from "sequelize";
import {
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
  SkudPersonBinding,
  SkudAccessEvent,
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
  listSkudCards,
  unbindSkudCard,
} from "../services/skud/SkudCardsService.js";
import {
  issueSkudQrToken,
  processSkudDecisionPayload,
  verifySkudQrToken,
} from "../services/skud/SkudQrService.js";
import { enqueueSkudEventsIngestJob } from "../queues/skud/queue.js";
import { getSkudProvider } from "../integrations/skud/SkudProviderRegistry.js";
import { sendSkudQrToEmployeeTelegram } from "../services/telegramService.js";

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

const PASSAGE_EVENT_TYPES = ["PASS_DETECTED", "PASS_GRANTED", "PASS_DENIED", "PASS_ATTEMPT"];
const RAW_PASSAGE_EVENT_TYPE = 6;

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
  date.setDate(date.getDate() - 30);
  return date.toISOString();
};

const getLiveEventWindows = () => [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

const getLiveEventRawLimit = ({ limit, direction, allow, departmentId, passageOnly }) => {
  if (direction !== undefined || allow !== undefined || departmentId || passageOnly) {
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

const buildProviderEventView = async ({
  from,
  to,
  accessPoint,
  direction,
  eventType,
  allow,
  departmentId,
  passageOnly = false,
  limit = 200,
  offset = 0,
}) => {
  const provider = getSkudProvider();
  const endTime = to || new Date().toISOString();
  const requiredCount = offset + limit;
  const accessPointId =
    accessPoint === undefined || accessPoint === null || accessPoint === ""
      ? undefined
      : Number.parseInt(String(accessPoint), 10);
  const canUseRawEventLog =
    allow === undefined &&
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

    filtered.sort(
      (left, right) =>
        new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime(),
    );

    return filtered;
  };

  if (canUseRawEventLog) {
    const rawLimit = Math.min(limit + 1, 201);
    const rawResult = await provider.getRawEvents({
      startTime: from || undefined,
      endTime,
      accessPointId,
      limit: rawLimit,
      offset,
      sortBy: "timestamp",
      sortOrder: "DESC",
      includeFields: "id,timestamp,accessPointId,accessObjectId,direction,type",
    });
    const rawItems = toProviderItems(rawResult);
    const normalizedItems = rawItems.map((item) => normalizeRawProviderEvent(item));
    const items = applyLiveFilters(normalizedItems);
    const visibleItems = items.slice(0, limit);
    const hasMore = rawItems.length > limit;

    return {
      items: visibleItems,
      pagination: {
        total: hasMore ? offset + visibleItems.length + 1 : offset + visibleItems.length,
        limit,
        offset,
      },
    };
  }

  if (from) {
    const retainLimit = Math.max(
      getLiveEventRawLimit({
        limit: requiredCount,
        direction,
        allow,
        departmentId,
        passageOnly,
      }),
      3000,
    );
    const batchLimit = 3000;
    let rawOffset = 0;
    let rawItems = [];
    let hasMore = false;

    while (true) {
      const batch = await fetchWindowPage(from, batchLimit, rawOffset);
      if (!batch.length) {
        break;
      }

      rawItems = rawItems.concat(batch).slice(-retainLimit);
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
    const visibleItems = items.slice(offset, offset + limit);
    return {
      items: visibleItems,
      pagination: {
        total: hasMore ? Math.max(items.length, offset + visibleItems.length + 1) : items.length,
        limit,
        offset,
      },
    };
  }

  const countWindowItems = async (startTime) => {
    const firstItem = await fetchWindowPage(startTime, 1, 0);
    if (!firstItem.length) {
      return 0;
    }

    let low = 0;
    let high = 1;
    while ((await fetchWindowPage(startTime, 1, high)).length) {
      low = high;
      high *= 2;
      if (high > 1_000_000) {
        break;
      }
    }

    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((await fetchWindowPage(startTime, 1, middle)).length) {
        low = middle;
      } else {
        high = middle;
      }
    }

    return low + 1;
  };

  let selectedWindowStart = windowStartTimes[windowStartTimes.length - 1];
  let selectedWindowCount = 0;

  for (const startTime of windowStartTimes) {
    const count = await countWindowItems(startTime);
    selectedWindowStart = startTime;
    selectedWindowCount = count;

    if (from || count >= requiredCount) {
      break;
    }
  }

  const rawLimit = getLiveEventRawLimit({
    limit: requiredCount,
    direction,
    allow,
    departmentId,
    passageOnly,
  });
  const rawOffset = Math.max(0, selectedWindowCount - rawLimit);
  const rawItems = await fetchWindowPage(selectedWindowStart, rawLimit, rawOffset);
  const items = applyLiveFilters(rawItems.map((item) => normalizeProviderEvent(item)));
  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      total: items.length,
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
      const { limit, offset } = parsePagination(req.query);
      const data = await buildProviderEventView({
        from: req.query.from,
        to: req.query.to,
        accessPoint: req.query.accessPoint,
        direction: req.query.direction,
        eventType: req.query.eventType,
        allow:
          req.query.allow === undefined
            ? undefined
            : parseBooleanParam(req.query.allow, false),
        departmentId: req.query.departmentId,
        passageOnly: parseBooleanParam(req.query.passageOnly, false),
        limit,
        offset,
      });

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
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();

      const response = await provider.getEmployees({
        limit,
        offset,
      });

      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.items)
          ? response.items
          : [];

      const mapped = rows.map((item) => ({
        id:
          item?.id === undefined || item?.id === null ? null : String(item.id),
        name: String(item?.name || "").trim() || "—",
        description: String(item?.description || "").trim() || null,
        status: String(item?.status || "").trim() || null,
        departmentName:
          String(item?.departmentName || item?.department_name || "").trim() ||
          null,
        raw: item,
      }));

      const filtered = search
        ? mapped.filter((item) => {
            return (
              String(item.id || "")
                .toLowerCase()
                .includes(search) ||
              String(item.name || "")
                .toLowerCase()
                .includes(search) ||
              String(item.description || "")
                .toLowerCase()
                .includes(search) ||
              String(item.departmentName || "")
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
            limit,
            offset,
            total: filtered.length,
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
      const rows = await getAllProviderDepartments(provider);
      const departmentsById = new Map(
        rows
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item]),
      );

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

  async pullEvents(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const { from, to, limit, offset } = parsePullParams(req.body, req.query);
      const latestCursor =
        from || to ? { lastLogId: null, from: from || null } : await getLatestSkudPullCursor();
      const shouldBootstrapRecent = !from && !to && !latestCursor.lastLogId && !latestCursor.from;

      if (shouldBootstrapRecent) {
        const snapshotFrom = getDefaultSkudPullFrom();
        const snapshotTo = new Date().toISOString();
        const batchLimit = Math.max(limit, 500);
        let snapshotOffset = 0;
        let recentItems = [];

        while (true) {
          const result = await provider.getEvents({
            startTime: snapshotFrom,
            endTime: snapshotTo,
            limit: batchLimit,
            offset: snapshotOffset,
          });

          const items = toProviderItems(result);
          if (!items.length) {
            break;
          }

          recentItems = recentItems.concat(items).slice(-limit);
          snapshotOffset += items.length;

          if (items.length < batchLimit) {
            break;
          }
        }

        let imported = 0;
        for (const item of recentItems) {
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

        res.json({
          success: true,
          data: {
            fetched: recentItems.length,
            imported,
            from: snapshotFrom,
            to: snapshotTo,
            limit,
            offset: 0,
            mode: "recent_snapshot",
          },
        });
        return;
      }

      let fetched = 0;
      let imported = 0;
      let currentOffset = offset;
      let currentLastLogId = latestCursor.lastLogId || null;
      let currentFrom = from || latestCursor.from || getDefaultSkudPullFrom();

      // Pull in batches until Sigur stops returning new parsed events.
      while (true) {
        const result = await provider.getEvents({
          startTime: currentFrom,
          endTime: to || null,
          lastLogId: currentLastLogId,
          limit,
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

        if (items.length < limit) {
          break;
        }
      }

      res.json({
        success: true,
        data: {
          fetched,
          imported,
          from: currentFrom,
          to: to || null,
          limit,
          offset,
          lastLogId: currentLastLogId,
        },
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
      ensureSkudModuleEnabled();
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

      res.status(202).json({ success: true, data: result });
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

      res.json({ success: true, data: binding });
    } catch (error) {
      next(error);
    }
  },
};
