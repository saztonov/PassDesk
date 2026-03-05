import { Op, fn, col } from "sequelize";
import {
  SkudAccessEvent,
  SkudAccessState,
  SkudPersonBinding,
  SkudSyncJob,
  Employee,
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

export const listSkudEvents = async ({ from, to, employeeId, accessPoint, direction, limit = 50, offset = 0 }) => {
  const where = buildDateFilter({ from, to });
  if (employeeId) where.employeeId = employeeId;
  if (accessPoint !== undefined && accessPoint !== null && accessPoint !== "") {
    where.accessPoint = Number.parseInt(String(accessPoint), 10);
  }
  if (direction !== undefined && direction !== null && direction !== "") {
    where.direction = Number.parseInt(String(direction), 10);
  }

  return SkudAccessEvent.findAndCountAll({
    where,
    include: [
      {
        model: Employee,
        as: "employee",
        required: false,
        attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
      },
    ],
    order: [["eventTime", "DESC"]],
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
    accessPoint:
      payload?.accessPoint === undefined || payload?.accessPoint === null
        ? null
        : Number.parseInt(String(payload.accessPoint), 10),
    direction:
      payload?.direction === undefined || payload?.direction === null
        ? null
        : Number.parseInt(String(payload.direction), 10),
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
