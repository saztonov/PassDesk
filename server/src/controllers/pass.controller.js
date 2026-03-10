import { Op } from "sequelize";
import { AppError } from "../middleware/errorHandler.js";
import {
  Pass,
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
} from "../models/index.js";
import {
  checkEmployeeAccess,
  getAccessibleEmployeeIds,
} from "../utils/permissionUtils.js";
import { enqueueSkudSyncForEmployee } from "../services/skud/SkudSyncService.js";
import { isSkudEnabled } from "../services/skud/skudConfig.js";
import { issueSkudQrTokenForPass } from "../services/skud/SkudQrService.js";

const PASS_SYNCABLE_STATUSES = new Set(["active", "expired", "revoked"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePagination = (query = {}) => {
  const page = Math.max(Number.parseInt(String(query.page || "1"), 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit || "10"), 10) || 10, 1),
    100,
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const parseDateValue = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    throw new AppError(`${fieldName} обязателен`, 400);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${fieldName} имеет неверный формат`, 400);
  }

  return parsed;
};

const normalizeStatus = (value, fallback = "pending") => {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  if (!PASS_SYNCABLE_STATUSES.has(normalized) && normalized !== "pending") {
    throw new AppError("Недопустимый статус пропуска", 400);
  }
  return normalized;
};

const normalizePassPayload = (source = {}, { isUpdate = false } = {}) => {
  const payload = {};

  if (!isUpdate || source.employeeId !== undefined) {
    const employeeId = String(source.employeeId || "").trim();
    if (!UUID_RE.test(employeeId)) {
      throw new AppError("employeeId обязателен и должен быть UUID", 400);
    }
    payload.employeeId = employeeId;
  }

  if (!isUpdate || source.passType !== undefined) {
    const passType = String(source.passType || "")
      .trim()
      .toLowerCase();
    if (
      !["temporary", "permanent", "visitor", "contractor"].includes(passType)
    ) {
      throw new AppError("Недопустимый тип пропуска", 400);
    }
    payload.passType = passType;
  }

  if (!isUpdate || source.validFrom !== undefined) {
    payload.validFrom = parseDateValue(source.validFrom, "validFrom");
  }

  if (!isUpdate || source.validUntil !== undefined) {
    payload.validUntil = parseDateValue(source.validUntil, "validUntil");
  }

  const nextValidFrom = payload.validFrom;
  const nextValidUntil = payload.validUntil;
  if (nextValidFrom && nextValidUntil && nextValidUntil < nextValidFrom) {
    throw new AppError("validUntil не может быть раньше validFrom", 400);
  }

  if (source.accessZones !== undefined) {
    if (!Array.isArray(source.accessZones)) {
      throw new AppError("accessZones должен быть массивом", 400);
    }
    payload.accessZones = source.accessZones
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (source.status !== undefined || !isUpdate) {
    payload.status = normalizeStatus(
      source.status,
      isUpdate ? undefined : "pending",
    );
  }

  if (source.passNumber !== undefined) {
    payload.passNumber = String(source.passNumber || "").trim() || null;
  }

  if (source.qrCode !== undefined) {
    payload.qrCode = source.qrCode ? String(source.qrCode) : null;
  }

  if (source.documentFileKey !== undefined) {
    payload.documentFileKey =
      String(source.documentFileKey || "").trim() || null;
  }

  if (source.documentFileUrl !== undefined) {
    payload.documentFileUrl =
      String(source.documentFileUrl || "").trim() || null;
  }

  if (source.notes !== undefined) {
    payload.notes = String(source.notes || "").trim() || null;
  }

  if (source.revokeReason !== undefined) {
    payload.revokeReason = String(source.revokeReason || "").trim() || null;
  }

  return payload;
};

const includeEmployee = [
  {
    model: Employee,
    as: "employee",
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
  },
];

const fetchEmployeeForPassFlow = async (employeeId) => {
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

const fetchPassOrThrow = async (id) => {
  const pass = await Pass.findByPk(id, {
    include: includeEmployee,
  });

  if (!pass) {
    throw new AppError("Пропуск не найден", 404);
  }

  if (!pass.employee) {
    throw new AppError("Сотрудник для пропуска не найден", 404);
  }

  return pass;
};

const buildSkudPayloadFromPass = (pass) => ({
  accessStartTime: pass.validFrom
    ? new Date(pass.validFrom).toISOString()
    : null,
  accessEndTime: pass.validUntil
    ? new Date(pass.validUntil).toISOString()
    : null,
  passId: pass.id,
  passNumber: pass.passNumber || null,
});

const syncPassWithSkudIfNeeded = async ({ pass, userId, source }) => {
  if (!isSkudEnabled()) {
    return null;
  }

  if (pass.status === "active") {
    return enqueueSkudSyncForEmployee({
      employeeId: pass.employeeId,
      operation: "sync_employee",
      userId,
      source,
      priority: "normal",
      payload: buildSkudPayloadFromPass(pass),
    });
  }

  if (pass.status === "expired" || pass.status === "revoked") {
    return enqueueSkudSyncForEmployee({
      employeeId: pass.employeeId,
      operation: "block_employee",
      userId,
      source,
      reasonCode: pass.status === "revoked" ? "pass_revoked" : "pass_expired",
      statusReason:
        pass.status === "revoked"
          ? "Pass revoked in PassDesk"
          : "Pass expired in PassDesk",
      priority: pass.status === "revoked" ? "high" : "normal",
      payload: buildSkudPayloadFromPass(pass),
    });
  }

  return null;
};

export const getAllPasses = async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};

    if (req.query.status) {
      where.status = normalizeStatus(req.query.status);
    }

    if (req.query.employeeId) {
      const employeeId = Number.parseInt(String(req.query.employeeId), 10);
      if (!Number.isInteger(employeeId) || employeeId <= 0) {
        throw new AppError("employeeId должен быть числом", 400);
      }
      where.employeeId = employeeId;
    }

    if (req.user.role !== "admin") {
      const distinctEmployeeRows = await Pass.findAll({
        where,
        attributes: ["employeeId"],
        group: ["employee_id"],
        raw: true,
      });
      const candidateEmployeeIds = distinctEmployeeRows
        .map((item) => item.employeeId)
        .filter(Boolean);
      const { allowedIds } = await getAccessibleEmployeeIds(
        req.user,
        candidateEmployeeIds,
        "read",
      );

      if (allowedIds.length === 0) {
        return res.json({
          success: true,
          data: {
            passes: [],
            pagination: {
              page,
              limit,
              total: 0,
              pages: 0,
            },
          },
        });
      }

      if (where.employeeId) {
        if (!allowedIds.includes(where.employeeId)) {
          return res.json({
            success: true,
            data: {
              passes: [],
              pagination: {
                page,
                limit,
                total: 0,
                pages: 0,
              },
            },
          });
        }
      } else {
        where.employeeId = { [Op.in]: allowedIds };
      }
    }

    const { rows, count } = await Pass.findAndCountAll({
      where,
      include: includeEmployee,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: {
        passes: rows,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPassById = async (req, res, next) => {
  try {
    const pass = await fetchPassOrThrow(req.params.id);
    await checkEmployeeAccess(req.user, pass.employee, "read");

    return res.json({
      success: true,
      data: pass,
    });
  } catch (error) {
    next(error);
  }
};

export const getPassesByEmployee = async (req, res, next) => {
  try {
    const employeeId = Number.parseInt(String(req.params.employeeId), 10);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new AppError("employeeId должен быть числом", 400);
    }

    const employee = await fetchEmployeeForPassFlow(employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee, "read");

    const passes = await Pass.findAll({
      where: { employeeId },
      include: includeEmployee,
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      success: true,
      data: {
        passes,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPass = async (req, res, next) => {
  try {
    const payload = normalizePassPayload(req.body);
    const employee = await fetchEmployeeForPassFlow(payload.employeeId);
    if (!employee) {
      throw new AppError("Сотрудник не найден", 404);
    }

    await checkEmployeeAccess(req.user, employee);

    const pass = await Pass.create({
      ...payload,
      issuedBy: req.user.id,
    });

    const createdPass = await fetchPassOrThrow(pass.id);
    await syncPassWithSkudIfNeeded({
      pass: createdPass,
      userId: req.user.id,
      source: "pass_create",
    });

    return res.status(201).json({
      success: true,
      message: "Пропуск создан",
      data: createdPass,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePass = async (req, res, next) => {
  try {
    const pass = await fetchPassOrThrow(req.params.id);
    await checkEmployeeAccess(req.user, pass.employee);

    const payload = normalizePassPayload(req.body, { isUpdate: true });

    const nextValidFrom = payload.validFrom ?? pass.validFrom;
    const nextValidUntil = payload.validUntil ?? pass.validUntil;
    if (nextValidFrom && nextValidUntil && nextValidUntil < nextValidFrom) {
      throw new AppError("validUntil не может быть раньше validFrom", 400);
    }

    if (payload.employeeId && payload.employeeId !== pass.employeeId) {
      const nextEmployee = await fetchEmployeeForPassFlow(payload.employeeId);
      if (!nextEmployee) {
        throw new AppError("Сотрудник не найден", 404);
      }
      await checkEmployeeAccess(req.user, nextEmployee);
    }

    await pass.update(payload);

    const updatedPass = await fetchPassOrThrow(pass.id);
    await syncPassWithSkudIfNeeded({
      pass: updatedPass,
      userId: req.user.id,
      source: "pass_update",
    });

    return res.json({
      success: true,
      message: "Пропуск обновлен",
      data: updatedPass,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePass = async (req, res, next) => {
  try {
    const pass = await fetchPassOrThrow(req.params.id);
    await checkEmployeeAccess(req.user, pass.employee);

    if (pass.status === "active" || pass.status === "expired") {
      await syncPassWithSkudIfNeeded({
        pass: await pass.update({
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: req.user.id,
          revokeReason: pass.revokeReason || "Pass deleted in PassDesk",
        }),
        userId: req.user.id,
        source: "pass_delete",
      });
    }

    await pass.destroy();

    return res.json({
      success: true,
      message: "Пропуск удален",
    });
  } catch (error) {
    next(error);
  }
};

export const revokePass = async (req, res, next) => {
  try {
    const pass = await fetchPassOrThrow(req.params.id);
    await checkEmployeeAccess(req.user, pass.employee);

    await pass.update({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: req.user.id,
      revokeReason:
        String(req.body?.reason || req.body?.revokeReason || "").trim() ||
        "Revoked in PassDesk",
    });

    const revokedPass = await fetchPassOrThrow(pass.id);
    await syncPassWithSkudIfNeeded({
      pass: revokedPass,
      userId: req.user.id,
      source: "pass_revoke",
    });

    return res.json({
      success: true,
      message: "Пропуск отозван",
      data: revokedPass,
    });
  } catch (error) {
    next(error);
  }
};

export const issuePassQr = async (req, res, next) => {
  try {
    const pass = await fetchPassOrThrow(req.params.id);
    await checkEmployeeAccess(req.user, pass.employee, "read");

    const data = await issueSkudQrTokenForPass({
      passId: pass.id,
      employeeId: pass.employeeId,
      channel:
        String(req.body?.channel || "web")
          .trim()
          .toLowerCase() || "web",
      issuedBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
