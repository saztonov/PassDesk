import { useMemo } from "react";
import { useEmployeesCrudActions } from "@/modules/employees/model/useEmployeesCrudActions";
import { useEmployeesNavigationActions } from "@/modules/employees/model/useEmployeesNavigationActions";

export const useEmployeesActions = ({
  isMobile,
  navigate,
  modal,
  refetchEmployees,
  editingEmployee,
  setEditingEmployee,
  viewingEmployee,
  closeEditModal,
  closeMobileView,
  openViewModal,
  openFilesModal,
  openSitesModal,
  openRequestModal,
}) => {
  const crudActions = useEmployeesCrudActions({
    modal,
    navigate,
    closeEditModal,
    refetchEmployees,
    editingEmployee,
    setEditingEmployee,
  });

  const navigationActions = useEmployeesNavigationActions({
    isMobile,
    navigate,
    openViewModal,
    openFilesModal,
    openSitesModal,
    openRequestModal,
    closeMobileView,
    setEditingEmployee,
    viewingEmployee,
  });

  return useMemo(
    () => ({
      ...crudActions,
      ...navigationActions,
    }),
    [crudActions, navigationActions],
  );
};
