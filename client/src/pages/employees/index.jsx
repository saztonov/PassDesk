import { useEffect, useMemo, useState } from "react";
import { App, Grid } from "antd";
import { useNavigate } from "react-router-dom";
import { useEmployees } from "@/entities/employee";
import { useDepartments } from "@/entities/department";
import { useSettings } from "@/entities/settings";
import { useAuthStore } from "@/store/authStore";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTranslation } from "react-i18next";
import EmployeesListSection from "@/modules/employees/ui/EmployeesListSection";
import EmployeesModals from "@/modules/employees/ui/EmployeesModals";
import EmployeesToolbar from "@/modules/employees/ui/EmployeesToolbar";
import { useEmployeesActions } from "@/modules/employees/model/useEmployeesActions";
import { useCounterpartyMap } from "@/modules/employees/model/useCounterpartyMap";
import { useEmployeesPageStorage } from "@/modules/employees/model/useEmployeesPageStorage";
import { useFilteredEmployees } from "@/modules/employees/model/useFilteredEmployees";
import { useEmployeesModals } from "@/modules/employees/model/useEmployeesModals";
import { useEmployeesPermissions } from "@/modules/employees/model/useEmployeesPermissions";
import useEmployeesPageViewModels from "@/modules/employees/model/useEmployeesPageViewModels";

const { useBreakpoint } = Grid;

const EmployeesPage = () => {
  const { modal } = App.useApp();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { t } = useTranslation();

  const { user } = useAuthStore();
  const { defaultCounterpartyId, loading: settingsLoading } = useSettings();

  const {
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    tableFilters,
    setTableFilters,
    resetTrigger,
    hiddenColumns,
    handleResetFilters,
    handleToggleColumn,
    handleResetColumns,
  } = useEmployeesPageStorage();

  const { counterpartyMap, hasSubcontractors } = useCounterpartyMap({
    user,
    defaultCounterpartyId,
  });

  const {
    isModalOpen,
    setIsModalOpen,
    isViewModalOpen,
    setIsViewModalOpen,
    isFilesModalOpen,
    setIsImportModalOpen,
    isRequestModalOpen,
    setIsRequestModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    isImportModalOpen,
    isSecurityModalOpen,
    setIsSecurityModalOpen,
    isSitesModalOpen,
    editingEmployee,
    setEditingEmployee,
    viewingEmployee,
    setViewingEmployee,
    filesEmployee,
    sitesEmployee,
    openCreateModal,
    openEditModal,
    closeEditModal,
    openViewModal,
    closeMobileView,
    openFilesModal,
    closeFilesModal,
    openSitesModal,
    closeSitesModal,
    openRequestModal,
  } = useEmployeesModals();

  usePageTitle(t("employees.title"), isMobile);

  const counterpartyIdForFilter = useMemo(() => {
    if (!tableFilters.counterparty || tableFilters.counterparty.length === 0) {
      return null;
    }
    const counterpartyName = tableFilters.counterparty[0];
    return counterpartyMap[counterpartyName] || null;
  }, [tableFilters.counterparty, counterpartyMap]);

  const isCounterpartyFilterReady =
    !tableFilters.counterparty?.length ||
    Object.keys(counterpartyMap).length > 0;

  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const employeeRequestFilters = useMemo(() => {
    const filters = {};

    if (counterpartyIdForFilter) {
      filters.counterpartyId = counterpartyIdForFilter;
    }

    if (debouncedSearchText) {
      filters.search = debouncedSearchText;
    }

    return filters;
  }, [counterpartyIdForFilter, debouncedSearchText]);

  const {
    employees,
    loading: employeesLoading,
    backgroundLoading,
    totalCount,
    refetch: refetchEmployees,
  } = useEmployees(
    false,
    employeeRequestFilters,
    isCounterpartyFilterReady,
  );

  const { departments, loading: departmentsLoading } = useDepartments();

  const loading = employeesLoading || departmentsLoading || settingsLoading;

  const {
    canExport,
    showCounterpartyColumn,
    showDepartmentColumn,
    canDeleteEmployee,
    canMarkForDeletion,
  } = useEmployeesPermissions({
    user,
    defaultCounterpartyId,
    hasSubcontractors,
  });

  const { filteredEmployees, uniqueFilters } = useFilteredEmployees({
    employees,
    searchText,
    statusFilter,
    counterpartyFilter: tableFilters.counterparty,
    skipSearchFiltering: true,
  });

  const {
    handleCheckInn,
    handleAdd,
    handleEdit,
    handleView,
    handleViewFiles,
    handleFilesUpdated,
    handleConstructionSitesEdit,
    handleSitesUpdated,
    handleRequest,
    handleDelete,
    handleMarkForDeletion,
    handleDepartmentChange,
    handleFormSuccess,
    handleMobileViewEdit,
  } = useEmployeesActions({
    isMobile,
    navigate,
    modal,
    refetchEmployees,
    editingEmployee,
    setEditingEmployee,
    viewingEmployee,
    closeEditModal,
    closeMobileView,
    openCreateModal,
    openEditModal,
    openViewModal,
    openFilesModal,
    openSitesModal,
    openRequestModal,
  });

  const {
    toolbarView,
    toolbarFilters,
    toolbarColumns,
    toolbarActions,
    employeesListModel,
    employeesListActions,
    employeesModalModel,
    employeesModalActions,
  } = useEmployeesPageViewModels({
    backgroundLoading,
    employees,
    totalCount,
    canExport,
    searchText,
    statusFilter,
    setSearchText,
    setStatusFilter,
    handleResetFilters,
    showDepartmentColumn,
    showCounterpartyColumn,
    hiddenColumns,
    handleToggleColumn,
    handleResetColumns,
    handleAdd,
    handleRequest,
    setIsImportModalOpen,
    setIsSecurityModalOpen,
    filteredEmployees,
    loading,
    departments,
    uniqueFilters,
    defaultCounterpartyId,
    user,
    resetTrigger,
    canDeleteEmployee,
    canMarkForDeletion,
    handleView,
    handleEdit,
    handleDelete,
    handleViewFiles,
    handleMarkForDeletion,
    handleDepartmentChange,
    setTableFilters,
    handleConstructionSitesEdit,
    isModalOpen,
    editingEmployee,
    isViewModalOpen,
    viewingEmployee,
    isFilesModalOpen,
    filesEmployee,
    isSitesModalOpen,
    sitesEmployee,
    isRequestModalOpen,
    tableFilters,
    isExportModalOpen,
    isImportModalOpen,
    isSecurityModalOpen,
    setIsModalOpen,
    setEditingEmployee,
    handleFormSuccess,
    handleCheckInn,
    setIsViewModalOpen,
    setViewingEmployee,
    handleMobileViewEdit,
    closeFilesModal,
    handleFilesUpdated,
    closeSitesModal,
    handleSitesUpdated,
    setIsRequestModalOpen,
    refetchEmployees,
    setIsExportModalOpen,
  });

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      <EmployeesToolbar
        isMobile={isMobile}
        t={t}
        view={toolbarView}
        filters={toolbarFilters}
        columns={toolbarColumns}
        actions={toolbarActions}
      />

      <EmployeesListSection
        isMobile={isMobile}
        model={employeesListModel}
        actions={employeesListActions}
      />

      <EmployeesModals
        isMobile={isMobile}
        model={employeesModalModel}
        actions={employeesModalActions}
      />
    </div>
  );
};

export default EmployeesPage;
