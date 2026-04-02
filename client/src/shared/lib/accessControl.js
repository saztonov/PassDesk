export const canManageEmployeeStatuses = (role) =>
  role === "admin" || role === "manager";

export const canManageAdministrativeData = (role) =>
  role === "admin" || role === "manager";

export const canManageUsers = (role) => role === "admin";

export const canManageCounterparties = ({
  role,
  counterpartyId = null,
  defaultCounterpartyId = null,
} = {}) =>
  canManageAdministrativeData(role) ||
  role === "ot_admin" ||
  role === "ot_engineer" ||
  (role === "user" &&
    counterpartyId &&
    counterpartyId !== defaultCounterpartyId);

export const canAccessSkud = (role) => role === "admin";

export const canAccessOt = ({
  role,
  isDefaultCounterpartyUser = false,
  isOtEngineer = false,
  isOtAdmin = false,
}) =>
  isOtEngineer ||
  isOtAdmin ||
  role === "admin" ||
  (role === "user" && !isDefaultCounterpartyUser);
