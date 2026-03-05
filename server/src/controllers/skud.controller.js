import { Employee, EmployeeCounterpartyMapping, Counterparty } from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { checkEmployeeAccess } from "../utils/permissionUtils.js";
import { isSkudEnabled, skudConfig } from "../services/skud/skudConfig.js";
import {
  getSkudHealth,
  getSkudStats,
  ingestSkudEvent,
  listSkudEvents,
  listSkudSyncJobs,
} from "../services/skud/SkudStatsService.js";
import { getEmployeeBinding, upsertEmployeeBinding } from "../services/skud/SkudBindingsService.js";
import {
  enqueueSkudSyncForEmployee,
} from "../services/skud/SkudSyncService.js";
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
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit || "50"), 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(String(query.offset || "0"), 10) || 0, 0);
  return { limit, offset };
};

const parsePullParams = (body = {}, query = {}) => {
  const source = body && typeof body === "object" ? body : {};
  const merged = { ...query, ...source };
  const limit = Math.min(
    Math.max(Number.parseInt(String(merged.limit || "100"), 10) || 100, 1),
    500,
  );
  const offset = Math.max(Number.parseInt(String(merged.offset || "0"), 10) || 0, 0);
  return {
    limit,
    offset,
    from: merged.from,
    to: merged.to,
  };
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

  const accessPointRaw = data?.accessPointId ?? accessPoint?.id ?? item?.accessPointId ?? null;
  const directionRaw = data?.direction ?? item?.direction ?? null;
  const allowRaw = data?.allow ?? data?.allowed ?? item?.allow ?? item?.allowed ?? null;
  const keyHexRaw = data?.keyHex ?? data?.key ?? item?.keyHex ?? item?.key ?? null;

  return {
    logId: item?.logId ?? item?.id ?? null,
    externalEmpId:
      externalEmpIdRaw === null || externalEmpIdRaw === undefined
        ? null
        : String(externalEmpIdRaw),
    accessPoint: toNullableInt(accessPointRaw),
    direction: mapDirection(directionRaw),
    allow:
      allowRaw === null || allowRaw === undefined
        ? null
        : Boolean(allowRaw),
    keyHex:
      keyHexRaw === null || keyHexRaw === undefined ? null : String(keyHexRaw),
    eventType: item?.eventType || item?.type || "sigur_event",
    eventTime: item?.timestamp || item?.receivedTime || new Date().toISOString(),
    source: "sigur_pull",
    rawItem: item,
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
  if (!parsed || parsed.username !== requiredUser || parsed.password !== requiredPass) {
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
      const result = await listSkudEvents({
        from: req.query.from,
        to: req.query.to,
        employeeId: req.query.employeeId,
        accessPoint: req.query.accessPoint,
        direction: req.query.direction,
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

  async pullEvents(req, res, next) {
    try {
      ensureSkudModuleEnabled();
      const provider = getSkudProvider();
      const { from, to, limit, offset } = parsePullParams(req.body, req.query);

      const result = await provider.getEvents({ from, to, limit, offset });
      const items = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
          ? result.items
          : [];

      for (const item of items) {
        const payload = normalizeProviderEvent(item);
        await ingestSkudEvent({
          payload,
          source: "sigur_pull",
          externalSystem: "sigur",
        });
      }

      res.json({
        success: true,
        data: {
          fetched: items.length,
          imported: items.length,
          from: from || null,
          to: to || null,
          limit,
          offset,
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
