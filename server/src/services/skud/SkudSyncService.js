import {
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
  Department,
  ConstructionSite,
  SkudAccessState,
  SkudPersonBinding,
  SkudSyncJob,
  SkudSiteAccessPoint,
  Status,
  EmployeeStatusMapping,
} from "../../models/index.js";
import { mapEmployeeToSigur } from "../../integrations/skud/providers/sigur/SigurMapper.js";
import { getSkudProvider } from "../../integrations/skud/SkudProviderRegistry.js";
import { skudConfig } from "./skudConfig.js";
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
            attributes: ["id", "name", "type"],
          },
          {
            model: Department,
            as: "department",
            attributes: ["id", "name"],
            required: false,
          },
          {
            model: ConstructionSite,
            as: "constructionSite",
            attributes: ["id", "shortName", "fullName"],
            required: false,
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

const getEmployeeDepartmentName = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  return (
    mappings.find((item) => item?.department?.name)?.department?.name
      || null
  );
};

const normalizeSigurPathSegments = (input) => {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const value = String(input || "").trim();
  if (!value) {
    return [];
  }

  return value
    .split(/[\\/|>]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getEmployeeSiteName = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const site = mappings.find((item) => item?.constructionSite)?.constructionSite;
  return (
    String(site?.shortName || "").trim()
    || String(site?.fullName || "").trim()
    || null
  );
};

const isContractorEmployee = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];
  const counterpartyType = mappings[0]?.counterparty?.type || "";
  return counterpartyType === "contractor" || counterpartyType === "general_contractor";
};

const getEmployeeSigurDepartmentPath = ({ employee, payload = {} }) => {
  const explicitPath = normalizeSigurPathSegments(payload?.sigurDepartmentPath);
  if (explicitPath.length > 0) {
    return explicitPath;
  }

  const segments = [];
  const isContractor = isContractorEmployee(employee);
  const contractorsRoot = String(skudConfig?.sigur?.departmentRootContractors || "").trim();
  const ownRoot = String(skudConfig?.sigur?.departmentRoot || "").trim();
  const configuredRoot = (isContractor && contractorsRoot) ? contractorsRoot : ownRoot;
  const siteName = getEmployeeSiteName(employee);
  const departmentName = getEmployeeDepartmentName(employee);

  if (configuredRoot) {
    segments.push(configuredRoot);
  }
  if (siteName) {
    segments.push(siteName);
  }
  if (departmentName) {
    segments.push(departmentName);
  }

  return segments.filter(Boolean);
};

const getProviderItems = (response) => (
  Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : []
);

const getAllSigurDepartments = async (provider) => {
  const limit = 500;
  const items = [];
  let offset = 0;

  while (true) {
    const response = await provider.getDepartments({ limit, offset });
    const page = getProviderItems(response);
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

const resolveSigurDepartmentId = async ({ provider, pathSegments = [], description = "" }) => {
  const segments = normalizeSigurPathSegments(pathSegments);
  if (!segments.length) {
    return null;
  }

  let departments = await getAllSigurDepartments(provider);
  let parentId = 0;
  let resolvedId = null;

  for (const segment of segments) {
    const normalizedName = String(segment || "").trim();
    if (!normalizedName) {
      continue;
    }

    const existing = departments.find(
      (item) =>
        Number.parseInt(String(item?.parentId ?? 0), 10) === parentId
        && String(item?.name || "").trim().toLowerCase() === normalizedName.toLowerCase(),
    );

    if (existing?.id !== undefined && existing?.id !== null) {
      resolvedId = Number.parseInt(String(existing.id), 10);
      parentId = resolvedId;
      continue;
    }

    try {
      const created = await provider.createDepartment({
        name: normalizedName,
        parentId,
        description,
      });
      const createdId =
        created?.id ?? created?.departmentId ?? created?.data?.id ?? null;
      if (createdId === undefined || createdId === null) {
        throw new Error(`Failed to create Sigur department: ${normalizedName}`);
      }
      resolvedId = Number.parseInt(String(createdId), 10);
      parentId = resolvedId;
      departments = await getAllSigurDepartments(provider);
    } catch (error) {
      departments = await getAllSigurDepartments(provider);
      const duplicate = departments.find(
        (item) =>
          Number.parseInt(String(item?.parentId ?? 0), 10) === parentId
          && String(item?.name || "").trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (!duplicate?.id) {
        throw error;
      }
      resolvedId = Number.parseInt(String(duplicate.id), 10);
      parentId = resolvedId;
    }
  }

  return resolvedId;
};

const runSyncEmployeeOperation = async ({ employee, userId, payload = {} }) => {
  const provider = getSkudProvider();
  const existingBinding = Array.isArray(employee?.skudBindings)
    ? employee.skudBindings[0]
    : null;

  const counterpartyName =
    employee?.employeeCounterpartyMappings?.[0]?.counterparty?.name || "";
  const departmentPath = getEmployeeSigurDepartmentPath({ employee, payload });
  const departmentId = await resolveSigurDepartmentId({
    provider,
    pathSegments: departmentPath,
    description: counterpartyName,
  });

  const employeePayload = mapEmployeeToSigur({
    employee,
    externalEmpId: existingBinding?.externalEmpId || null,
    counterpartyName,
    departmentId,
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

export const syncEmployeeAccessPoints = async ({ employeeId, externalEmpId }) => {
  const tag = `[SkudSync][accessPoints][emp=${employeeId}][ext=${externalEmpId}]`;
  const provider = getSkudProvider();

  // Получаем объекты сотрудника
  const mappings = await EmployeeCounterpartyMapping.findAll({
    where: { employeeId },
    attributes: ["construction_site_id"],
  });

  const siteIds = [...new Set(
    mappings.map((m) => m.constructionSiteId).filter(Boolean),
  )];

  console.log(`${tag} siteIds=${JSON.stringify(siteIds)}`);
  if (!siteIds.length) {
    console.log(`${tag} no sites assigned, skip`);
    return [];
  }

  // Получаем точки доступа Sigur для этих объектов
  const apRows = await SkudSiteAccessPoint.findAll({
    where: { constructionSiteId: siteIds },
  });

  const accessPointIds = [...new Set(apRows.map((r) => r.sigurAccessPointId))];

  console.log(`${tag} accessPointIds=${JSON.stringify(accessPointIds)}`);
  if (!accessPointIds.length) {
    console.log(`${tag} no access points mapped for these sites, skip`);
    return [];
  }

  const result = await provider.assignAccessPointsToEmployee(externalEmpId, accessPointIds);
  console.log(`${tag} assignAccessPoints OK`);
  return result;
};

export const ensureEmployeeBindingInSkud = async ({
  employee = null,
  employeeId = null,
  userId,
  payload = {},
}) => {
  const targetEmployee =
    employee || (employeeId ? await getEmployeeWithSkudContext(employeeId) : null);

  if (!targetEmployee || targetEmployee.isDeleted) {
    throw new Error("Employee is not found for SKUD binding");
  }

  const existingBinding = Array.isArray(targetEmployee?.skudBindings)
    ? targetEmployee.skudBindings[0]
    : null;

  if (existingBinding?.externalEmpId) {
    return existingBinding.externalEmpId;
  }

  const result = await runSyncEmployeeOperation({
    employee: targetEmployee,
    userId,
    payload,
  });
  if (!result.externalEmpId) {
    throw new Error("Unable to resolve externalEmpId for SKUD operation");
  }

  return result.externalEmpId;
};

const runBlockOperation = async ({ employee, userId, payload = {} }) => {
  const provider = getSkudProvider();
  const externalEmpId = await ensureEmployeeBindingInSkud({
    employee,
    userId,
    payload,
  });
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
  const externalEmpId = await ensureEmployeeBindingInSkud({
    employee,
    userId,
    payload,
  });
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
