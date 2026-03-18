import { useEffect, useMemo, useRef, useState } from "react";
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
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
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

  const counterpartyIdsForFilter = useMemo(() => {
    if (!tableFilters.counterparty || tableFilters.counterparty.length === 0) {
      return [];
    }

    return tableFilters.counterparty
      .map((counterpartyName) => counterpartyMap[counterpartyName])
      .filter(Boolean);
  }, [tableFilters.counterparty, counterpartyMap]);

  const isCounterpartyFilterReady =
    !tableFilters.counterparty?.length ||
    Object.keys(counterpartyMap).length > 0;

  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText);
  const filtersInitializedRef = useRef(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const employeeRequestFilters = useMemo(() => {
    const filters = {};

    if (counterpartyIdsForFilter.length > 0) {
      filters.counterpartyIds = JSON.stringify(counterpartyIdsForFilter);
    }

    if (debouncedSearchText) {
      filters.search = debouncedSearchText;
    }

    const effectiveStatusFilters =
      tableFilters.status?.length > 0
        ? tableFilters.status
        : statusFilter
          ? [statusFilter]
          : [];

    const activeOnlyRequest =
      effectiveStatusFilters.length === 1 &&
      effectiveStatusFilters[0] === "active";

    if (effectiveStatusFilters.length > 0 && !activeOnlyRequest) {
      filters.statuses = JSON.stringify(effectiveStatusFilters);
    }

    if (tableFilters.position?.length > 0) {
      filters.positionNames = JSON.stringify(tableFilters.position);
    }

    if (tableFilters.department?.length > 0) {
      filters.departmentNames = JSON.stringify(tableFilters.department);
    }

    if (tableFilters.constructionSite?.length > 0) {
      filters.constructionSiteNames = JSON.stringify(
        tableFilters.constructionSite,
      );
    }

    if (tableFilters.citizenship?.length > 0) {
      filters.citizenshipNames = JSON.stringify(tableFilters.citizenship);
    }

    if (tableFilters.statusCard?.length > 0) {
      filters.statusCard = JSON.stringify(tableFilters.statusCard);
    }

    const createdAtRange = tableFilters.createdAt;
    if (Array.isArray(createdAtRange) && createdAtRange.length > 0) {
      filters.dateFrom = createdAtRange[0];
      filters.dateTo = createdAtRange[1] || createdAtRange[0];
    }

    filters.page = currentPage;
    filters.limit = pageSize;
    filters.activeOnly = activeOnlyRequest;

    return filters;
  }, [
    counterpartyIdsForFilter,
    currentPage,
    debouncedSearchText,
    pageSize,
    statusFilter,
    tableFilters.citizenship,
    tableFilters.constructionSite,
    tableFilters.createdAt,
    tableFilters.department,
    tableFilters.position,
    tableFilters.status,
    tableFilters.statusCard,
  ]);

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }

    setCurrentPage(1);
  }, [
    debouncedSearchText,
    statusFilter,
    tableFilters.counterparty,
    tableFilters.position,
    tableFilters.department,
    tableFilters.constructionSite,
    tableFilters.citizenship,
    tableFilters.status,
    tableFilters.statusCard,
    tableFilters.createdAt,
    setCurrentPage,
  ]);

  const {
    employees,
    loading: employeesLoading,
    backgroundLoading,
    totalCount,
    refetch: refetchEmployees,
  } = useEmployees(
    Boolean(employeeRequestFilters.activeOnly),
    employeeRequestFilters,
    isCounterpartyFilterReady,
  );

  const { departments, loading: departmentsLoading } = useDepartments();

  const loading = employeesLoading || departmentsLoading || settingsLoading;

  const handlePaginationChange = (page, nextPageSize) => {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
      setCurrentPage(1);
      return;
    }

    setCurrentPage(page);
  };

  useEffect(() => {
    if (loading || totalCount <= 0 || employees.length > 0 || currentPage <= 1) {
      return;
    }

    const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [currentPage, employees.length, loading, pageSize, setCurrentPage, totalCount]);

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
    searchText: "",
    statusFilter: null,
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
    currentPage,
    pageSize,
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
    handlePaginationChange,
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
