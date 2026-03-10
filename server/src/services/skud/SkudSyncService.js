import { Op } from "sequelize";
import {
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
  SkudAccessState,
  SkudPersonBinding,
  SkudSyncJob,
  Status,
  EmployeeStatusMapping,
} from "../../models/index.js";
import { mapEmployeeToSigur } from "../../integrations/skud/providers/sigur/SigurMapper.js";
import { getSkudProvider } from "../../integrations/skud/SkudProviderRegistry.js";
import {
  enqueueSkudBlockUnblockJob,
  enqueueSkudSyncJob,
  enqueueSkudSyncJobFallback,
} from "../../queues/skud/queue.js";

const SAFE_OPERATION_SET = new Set([
  "sync_employee",
  "block_employee",
  "unblock_employee",
]);

const getEmployeeWithSkudContext = async (employeeId) => {
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
      {
        model: EmployeeStatusMapping,
        as: "statusMappings",
        where: { isActive: true },
        required: false,
        include: [
          {
            model: Status,
            as: "status",
            attributes: ["id", "name", "group"],
          },
        ],
      },
      {
        model: SkudPersonBinding,
        as: "skudBindings",
        required: false,
        where: {
          externalSystem: "sigur",
          isActive: true,
        },
      },
    ],
  });
};

const upsertAccessState = async ({
  employeeId,
  status,
  source,
  changedBy,
  reasonCode = null,
  statusReason = null,
  metadata = {},
}) => {
  const existing = await SkudAccessState.findOne({
    where: {
      employeeId,
      externalSystem: "sigur",
    },
  });

  if (existing) {
    return existing.update({
      status,
      source,
      changedBy,
      reasonCode,
      statusReason,
      metadata: {
        ...(existing.metadata || {}),
        ...(metadata || {}),
      },
      updatedAt: new Date(),
    });
  }

  return SkudAccessState.create({
    employeeId,
    externalSystem: "sigur",
    status,
    source,
    changedBy,
    reasonCode,
    statusReason,
    metadata,
  });
};

const normalizeOperation = (operation) => {
  const normalized = String(operation || "sync_employee").trim().toLowerCase();
  if (!SAFE_OPERATION_SET.has(normalized)) {
    throw new Error(`Unsupported SKUD operation: ${operation}`);
  }
  return normalized;
};

export const createSkudSyncJob = async ({
  employeeId,
  operation,
  createdBy = null,
  payload = {},
  priority = "normal",
}) => {
  const normalizedOperation = normalizeOperation(operation);

  const record = await SkudSyncJob.create({
    externalSystem: "sigur",
    employeeId,
    operation: normalizedOperation,
    status: "pending",
    payload: {
      ...(payload || {}),
      priority,
    },
    createdBy,
  });

  if (normalizedOperation === "block_employee" || normalizedOperation === "unblock_employee") {
    await enqueueSkudBlockUnblockJob(record.id, priority === "high" ? 1 : 5);
  } else {
    await enqueueSkudSyncJob(record.id, 5);
  }

  return record;
};

const resolveOrCreateBindingExternalId = async ({ employee, sigurResponse, userId }) => {
  const existingBinding = Array.isArray(employee?.skudBindings)
    ? employee.skudBindings[0]
    : null;

  const responseId =
    sigurResponse?.id ||
    sigurResponse?.employeeId ||
    sigurResponse?.data?.id ||
    null;
  const externalEmpId = responseId ? String(responseId) : existingBinding?.externalEmpId;

  if (!externalEmpId) {
    return null;
  }

  if (existingBinding) {
    await existingBinding.update({
      externalEmpId,
      updatedBy: userId,
      updatedAt: new Date(),
      isActive: true,
    });
  } else {
    await SkudPersonBinding.create({
      employeeId: employee.id,
      externalSystem: "sigur",
      externalEmpId,
      source: "sync",
      isActive: true,
      createdBy: userId,
      updatedBy: userId,
      metadata: {},
    });
  }

  return externalEmpId;
};

const runSyncEmployeeOperation = async ({ employee, userId, payload = {} }) => {
  const provider = getSkudProvider();
  const existingBinding = Array.isArray(employee?.skudBindings)
    ? employee.skudBindings[0]
    : null;

  const counterpartyName =
    employee?.employeeCounterpartyMappings?.[0]?.counterparty?.name || "";

  const employeePayload = mapEmployeeToSigur({
    employee,
    externalEmpId: existingBinding?.externalEmpId || null,
    counterpartyName,
    accessStartTime: payload.accessStartTime || null,
    accessEndTime: payload.accessEndTime || null,
  });

  const response = await provider.createOrUpdateEmployee({
    externalEmpId: existingBinding?.externalEmpId || null,
    employeePayload,
  });

  const externalEmpId = await resolveOrCreateBindingExternalId({
    employee,
    sigurResponse: response,
    userId,
  });

  await upsertAccessState({
    employeeId: employee.id,
    status: "allowed",
    source: "sync",
    changedBy: userId,
    metadata: {
      operation: "sync_employee",
      externalEmpId,
    },
  });

  return {
    response,
    externalEmpId,
  };
};

const ensureBinding = async ({ employee, userId, payload = {} }) => {
  const existingBinding = Array.isArray(employee?.skudBindings)
    ? employee.skudBindings[0]
    : null;

  if (existingBinding?.externalEmpId) {
    return existingBinding.externalEmpId;
  }

  const result = await runSyncEmployeeOperation({ employee, userId, payload });
  if (!result.externalEmpId) {
    throw new Error("Unable to resolve externalEmpId for SKUD operation");
  }

  return result.externalEmpId;
};

const runBlockOperation = async ({ employee, userId, payload = {} }) => {
  const provider = getSkudProvider();
  const externalEmpId = await ensureBinding({ employee, userId, payload });
  const response = await provider.blockEmployee(externalEmpId, payload.statusReason || null);

  await upsertAccessState({
    employeeId: employee.id,
    status: "blocked",
    source: payload.source || "status_trigger",
    changedBy: userId,
    reasonCode: payload.reasonCode || null,
    statusReason: payload.statusReason || null,
    metadata: {
      operation: "block_employee",
      externalEmpId,
    },
  });

  return { response, externalEmpId };
};

const runUnblockOperation = async ({ employee, userId, payload = {} }) => {
  const provider = getSkudProvider();
  const externalEmpId = await ensureBinding({ employee, userId, payload });
  const response = await provider.unblockEmployee(externalEmpId);

  await upsertAccessState({
    employeeId: employee.id,
    status: "allowed",
    source: payload.source || "status_trigger",
    changedBy: userId,
    reasonCode: payload.reasonCode || null,
    statusReason: payload.statusReason || null,
    metadata: {
      operation: "unblock_employee",
      externalEmpId,
    },
  });

  return { response, externalEmpId };
};

export const processSkudSyncJobById = async (syncJobId) => {
  const syncJob = await SkudSyncJob.findByPk(syncJobId);
  if (!syncJob) {
    return null;
  }

  await syncJob.update({
    status: "processing",
    attempts: (syncJob.attempts || 0) + 1,
    updatedAt: new Date(),
  });

  try {
    if (!syncJob.employeeId) {
      throw new Error("sync job does not contain employeeId");
    }

    const employee = await getEmployeeWithSkudContext(syncJob.employeeId);
    if (!employee || employee.isDeleted) {
      throw new Error("Employee is not found for SKUD sync job");
    }

    const payload = syncJob.payload || {};
    let result = null;

    if (syncJob.operation === "sync_employee") {
      result = await runSyncEmployeeOperation({
        employee,
        userId: syncJob.createdBy,
        payload,
      });
    } else if (syncJob.operation === "block_employee") {
      result = await runBlockOperation({
        employee,
        userId: syncJob.createdBy,
        payload,
      });
    } else if (syncJob.operation === "unblock_employee") {
      result = await runUnblockOperation({
        employee,
        userId: syncJob.createdBy,
        payload,
      });
    } else {
      throw new Error(`Unsupported SKUD sync operation: ${syncJob.operation}`);
    }

    await syncJob.update({
      status: "success",
      responsePayload: result,
      errorMessage: null,
      processedAt: new Date(),
      updatedAt: new Date(),
    });

    return syncJob;
  } catch (error) {
    await syncJob.update({
      status: "failed",
      errorMessage: String(error?.message || error),
      processedAt: new Date(),
      updatedAt: new Date(),
    });
    throw error;
  }
};

export const enqueueSkudSyncForEmployee = async ({
  employeeId,
  operation,
  userId,
  source = "manual",
  reasonCode = null,
  statusReason = null,
  priority = "normal",
  payload = {},
}) => {
  const syncJob = await createSkudSyncJob({
    employeeId,
    operation,
    createdBy: userId,
    priority,
    payload: {
      ...(payload || {}),
      source,
      reasonCode,
      statusReason,
    },
  });

  return syncJob;
};

export const handleSkudStatusTrigger = async ({
  employeeId,
  statusName,
  userId,
  source = "status_trigger",
}) => {
  const normalized = String(statusName || "").trim();
  if (!normalized) return null;

  if (normalized === "status_secure_block" || normalized === "status_secure_block_compl") {
    return enqueueSkudSyncForEmployee({
      employeeId,
      operation: "block_employee",
      userId,
      source,
      reasonCode: normalized,
      statusReason: "Secure status blocked",
      priority: normalized === "status_secure_block_compl" ? "high" : "normal",
    });
  }

  if (normalized === "status_secure_allow") {
    return enqueueSkudSyncForEmployee({
      employeeId,
      operation: "unblock_employee",
      userId,
      source,
      reasonCode: normalized,
      statusReason: "Secure status allow",
      priority: "normal",
    });
  }

  return null;
};

export const enqueueSkudSyncJobByIdFallback = enqueueSkudSyncJobFallback;
