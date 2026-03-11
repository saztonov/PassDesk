import { Op, fn, col } from "sequelize";
import {
  SkudAccessEvent,
  SkudAccessState,
  SkudPersonBinding,
  SkudSyncJob,
  Employee,
  EmployeeCounterpartyMapping,
  Department,
} from "../../models/index.js";
import { getSkudProvider } from "../../integrations/skud/SkudProviderRegistry.js";

const buildDateFilter = ({ from, to }) => {
  const where = {};
  if (from || to) {
    where.eventTime = {};
    if (from) {
      where.eventTime[Op.gte] = new Date(from);
    }
    if (to) {
      where.eventTime[Op.lte] = new Date(to);
    }
  }
  return where;
};

const PASSAGE_EVENT_TYPES = ["PASS_DETECTED", "PASS_GRANTED", "PASS_DENIED", "PASS_ATTEMPT"];

export const getSkudHealth = async () => {
  const provider = getSkudProvider();
  let auth = null;
  let authError = null;

  try {
    auth = await provider.authenticate();
  } catch (error) {
    authError = error?.message || "SKUD provider auth failed";
  }

  const latestSyncJob = await SkudSyncJob.findOne({
    order: [["updatedAt", "DESC"]],
    attributes: ["id", "status", "updatedAt", "processedAt"],
  });

  return {
    provider: "sigur",
    authOk: Boolean(auth?.authenticated),
    authExpiresAt: auth?.expiresAt || null,
    authError,
    lastSyncAt: latestSyncJob?.processedAt || latestSyncJob?.updatedAt || null,
  };
};

export const getSkudStats = async ({ from, to }) => {
  const eventWhere = buildDateFilter({ from, to });

  const [
    totalEvents,
    inEvents,
    outEvents,
    deniedEvents,
    syncJobs,
    blockedCount,
  ] = await Promise.all([
    SkudAccessEvent.count({ where: eventWhere }),
    SkudAccessEvent.count({ where: { ...eventWhere, direction: 1 } }),
    SkudAccessEvent.count({ where: { ...eventWhere, direction: 2 } }),
    SkudAccessEvent.count({ where: { ...eventWhere, allow: false } }),
    SkudSyncJob.findAll({
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    }),
    SkudAccessState.count({
      where: {
        externalSystem: "sigur",
        status: "blocked",
      },
    }),
  ]);

  const syncJobsByStatus = {
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
  };

  for (const row of syncJobs) {
    syncJobsByStatus[row.status] = Number(row.count || 0);
  }

  return {
    events: {
      total: totalEvents,
      in: inEvents,
      out: outEvents,
      denied: deniedEvents,
      denyRate: totalEvents > 0 ? Number(((deniedEvents / totalEvents) * 100).toFixed(2)) : 0,
    },
    syncJobs: syncJobsByStatus,
    blockedEmployees: blockedCount,
  };
};

export const listSkudEvents = async ({
  from,
  to,
  employeeId,
  accessPoint,
  direction,
  eventType,
  allow,
  departmentId,
  passageOnly = false,
  limit = 50,
  offset = 0,
}) => {
  const where = buildDateFilter({ from, to });
  if (employeeId) where.employeeId = employeeId;
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

  const employeeInclude = {
    model: Employee,
    as: "employee",
    required: false,
    attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
    include: [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        required: Boolean(departmentId),
        attributes: ["id", "departmentId"],
        ...(departmentId ? { where: { departmentId } } : {}),
        include: [
          {
            model: Department,
            as: "department",
            required: false,
            attributes: ["id", "name"],
          },
        ],
      },
    ],
  };

  return SkudAccessEvent.findAndCountAll({
    where,
    include: [employeeInclude],
    order: [["eventTime", "DESC"]],
    distinct: true,
    limit,
    offset,
  });
};

export const listSkudSyncJobs = async ({ status, operation, employeeId, limit = 50, offset = 0 }) => {
  const where = {
    externalSystem: "sigur",
  };
  if (status && status !== "all") where.status = status;
  if (operation) where.operation = operation;
  if (employeeId) where.employeeId = employeeId;

  return SkudSyncJob.findAndCountAll({
    where,
    include: [
      {
        model: Employee,
        as: "employee",
        required: false,
        attributes: ["id", "firstName", "lastName", "middleName"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });
};

export const ingestSkudEvent = async ({ payload, source = "webdel", externalSystem = "sigur" }) => {
  const toNullableInt = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toDirection = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const normalized = String(value).trim().toUpperCase();
    if (normalized === "IN") return 1;
    if (normalized === "OUT") return 2;
    return toNullableInt(value);
  };

  const logIdRaw = payload?.logId ?? payload?.id ?? payload?.eventId ?? null;
  const logId =
    logIdRaw === null || logIdRaw === undefined || logIdRaw === ""
      ? null
      : Number.parseInt(String(logIdRaw), 10);

  const externalEmpId = String(
    payload?.externalEmpId || payload?.employeeId || payload?.employee || "",
  ).trim();

  let employeeId = null;
  if (externalEmpId) {
    const binding = await SkudPersonBinding.findOne({
      where: {
        externalSystem,
        externalEmpId,
      },
      attributes: ["employeeId"],
    });
    employeeId = binding?.employeeId || null;
  }

  if (logId !== null) {
    const existing = await SkudAccessEvent.findOne({
      where: {
        externalSystem,
        source,
        logId,
      },
    });

    if (existing) {
      return existing;
    }
  }

  return SkudAccessEvent.create({
    externalSystem,
    source,
    eventType: String(payload?.eventType || payload?.type || "passage"),
    logId,
    employeeId,
    externalEmpId: externalEmpId || null,
    accessPoint: toNullableInt(payload?.accessPoint),
    direction: toDirection(payload?.direction),
    keyHex: payload?.keyHex ? String(payload.keyHex) : null,
    allow:
      payload?.allow === undefined || payload?.allow === null
        ? null
        : Boolean(payload.allow),
    decisionMessage: payload?.message || payload?.decisionMessage || null,
    eventTime: payload?.eventTime ? new Date(payload.eventTime) : new Date(),
    rawPayload: payload || {},
  });
};
