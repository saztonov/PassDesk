import { useCallback } from "react";

export const useEmployeesNavigationActions = ({
  isMobile,
  navigate,
  openViewModal,
  openFilesModal,
  openSitesModal,
  openRequestModal,
  closeMobileView,
  setEditingEmployee,
  viewingEmployee,
}) => {
  const handleAdd = useCallback(() => {
    navigate("/employees/add");
  }, [navigate]);

  const handleEdit = useCallback(
    (employee) => {
      navigate(`/employees/edit/${employee.id}`);
    },
    [navigate],
  );

  const handleView = useCallback(
    (employee) => {
      openViewModal(employee);
    },
    [openViewModal],
  );

  const handleViewFiles = useCallback(
    (employee) => {
      openFilesModal(employee);
    },
    [openFilesModal],
  );

  const handleConstructionSitesEdit = useCallback(
    (employee) => {
      openSitesModal(employee);
    },
    [openSitesModal],
  );

  const handleRequest = useCallback(() => {
    if (isMobile) {
      navigate("/employees/request");
      return;
    }
    openRequestModal();
  }, [isMobile, navigate, openRequestModal]);

  const handleMobileViewEdit = useCallback(() => {
    closeMobileView();
    setEditingEmployee(viewingEmployee);
    navigate(`/employees/edit/${viewingEmployee.id}`);
  }, [closeMobileView, setEditingEmployee, viewingEmployee, navigate]);

  return {
    handleAdd,
    handleEdit,
    handleView,
    handleViewFiles,
    handleConstructionSitesEdit,
    handleRequest,
    handleMobileViewEdit,
  };
};
