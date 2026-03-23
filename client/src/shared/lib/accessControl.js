export const canManageEmployeeStatuses = (role) =>
  role === "admin" || role === "manager";

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
