import { useCallback, useMemo } from "react";

export const useEmployeesPermissions = ({
  user,
  defaultCounterpartyId,
  hasSubcontractors,
}) => {
  const canExport = useMemo(
    () =>
      user?.counterpartyId === defaultCounterpartyId && user?.role !== "user",
    [user?.counterpartyId, user?.role, defaultCounterpartyId],
  );

  const showCounterpartyColumn = canExport || hasSubcontractors;
  const showDepartmentColumn =
    defaultCounterpartyId && user?.counterpartyId === defaultCounterpartyId;

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
