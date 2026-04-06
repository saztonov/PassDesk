import { useCallback, useMemo } from "react";

export const useEmployeesPermissions = ({
  user,
  defaultCounterpartyId,
  hasSubcontractors,
}) => {
  const canManageEmployeeMappings =
    user?.role === "admin" || user?.role === "manager";

  const canExport = useMemo(
    () => user?.role === "admin" || user?.role === "manager",
    [user?.role],
  );

  const showCounterpartyColumn =
    canExport || hasSubcontractors || canManageEmployeeMappings;
  const showDepartmentColumn =
    canManageEmployeeMappings ||
    (defaultCounterpartyId && user?.counterpartyId === defaultCounterpartyId);

  const canDeleteEmployee = useCallback(
    () => user?.role === "admin" || user?.role === "manager",
    [user?.role],
  );
  const canMarkForDeletion = useCallback(() => user?.role === "user", [user?.role]);

  return {
    canExport,
    showCounterpartyColumn,
    showDepartmentColumn,
    canDeleteEmployee,
    canMarkForDeletion,
  };
};
