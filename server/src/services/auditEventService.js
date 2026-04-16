import {
  AuditLog,
  Counterparty,
  EmployeeCounterpartyMapping,
} from "../models/index.js";

export const AUDIT_EVENT_TYPES = Object.freeze({
  EMPLOYEE_UPDATED: "employee_updated",
  EMPLOYEE_TRANSFERRED: "employee_transferred",
  STATUS_CHANGED: "status_changed",
  ZUP_FLAG_CHANGED: "zup_flag_changed",
  FILE_UPLOADED: "file_uploaded",
  FILE_DELETED: "file_deleted",
  PASS_ASSIGNED: "pass_assigned",
  PASS_UNBOUND: "pass_unbound",
  COUNTERPARTY_SITES_SYNCED: "counterparty_sites_synced",
  // P0.2 step 2: audit-лог доступа к OCR-payload (PII паспортных данных).
  // Раньше ocr_result_json попадал в каждый ответ getEmployeeFiles без трекинга.
  OCR_RESULT_ACCESSED: "ocr_result_accessed",
});

export const getEmployeeCounterpartyAuditDetails = async (
  employeeId,
  options = {},
) => {
  const { transaction = null } = options;

  if (!employeeId) {
    return {
      counterpartyId: null,
      counterpartyName: null,
    };
  }

  const activeMapping = await EmployeeCounterpartyMapping.findOne({
    where: {
      employeeId,
      dismissedAt: null,
    },
    include: [
      {
        model: Counterparty,
        as: "counterparty",
        attributes: ["id", "name"],
      },
    ],
    order: [
      ["updatedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
    ...(transaction ? { transaction } : {}),
  });

  return {
    counterpartyId: activeMapping?.counterpartyId || null,
    counterpartyName: activeMapping?.counterparty?.name || null,
  };
};

const normalizeDetails = (eventType, details = {}) => {
  const normalized = {
    eventType,
    ...details,
  };

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === undefined) {
      delete normalized[key];
    }
  });

  return normalized;
};

export const logAuditEvent = async ({
  userId,
  eventType,
  entityType = "employee",
  entityId = null,
  details = {},
  status = "success",
  errorMessage = null,
  req = null,
  transaction = null,
}) => {
  if (!userId || !eventType) {
    return null;
  }

  const payload = {
    userId,
    action: eventType,
    entityType,
    entityId,
    details: normalizeDetails(eventType, details),
    status,
    errorMessage,
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent:
      typeof req?.get === "function" ? req.get("user-agent") : null,
  };

  return AuditLog.create(payload, transaction ? { transaction } : undefined);
};
