import { SkudPersonBinding } from "../../models/index.js";

const normalizeExternalSystem = (value) =>
  String(value || "sigur").trim().toLowerCase() || "sigur";

export const upsertEmployeeBinding = async ({
  employeeId,
  externalSystem = "sigur",
  externalEmpId,
  source = "manual",
  userId = null,
  isActive = true,
  metadata = {},
}) => {
  const normalizedSystem = normalizeExternalSystem(externalSystem);
  const normalizedExternalId = String(externalEmpId || "").trim();

  if (!employeeId) {
    throw new Error("employeeId is required");
  }
  if (!normalizedExternalId) {
    throw new Error("externalEmpId is required");
  }

  const existing = await SkudPersonBinding.findOne({
    where: {
      employeeId,
      externalSystem: normalizedSystem,
    },
  });

  if (existing) {
    return existing.update({
      externalEmpId: normalizedExternalId,
      source,
      isActive,
      metadata: {
        ...(existing.metadata || {}),
        ...(metadata || {}),
      },
      updatedBy: userId,
      updatedAt: new Date(),
    });
  }

  return SkudPersonBinding.create({
    employeeId,
    externalSystem: normalizedSystem,
    externalEmpId: normalizedExternalId,
    source,
    isActive,
    metadata: metadata || {},
    createdBy: userId,
    updatedBy: userId,
  });
};

export const getEmployeeBinding = async ({ employeeId, externalSystem = "sigur" }) => {
  return SkudPersonBinding.findOne({
    where: {
      employeeId,
      externalSystem: normalizeExternalSystem(externalSystem),
      isActive: true,
    },
  });
};
