import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useEmployeeTableFilterOptions } from "@/modules/employees/model/useEmployeeTableFilterOptions";
import { useEmployeesModals } from "@/modules/employees/model/useEmployeesModals";
import { useEmployeesPermissions } from "@/modules/employees/model/useEmployeesPermissions";
import useEmployeesPageViewModels from "@/modules/employees/model/useEmployeesPageViewModels";
import { useEmployeesPortalStats } from "@/modules/employees/model/useEmployeesPortalStats";

const { useBreakpoint } = Grid;

const STATUS_FILTER_LABELS = {
  active: "Действующий",
  draft: "Черновик",
  processed: "Отправленные",
  fired: "Уволен",
  inactive: "Неактивный",
  blocked: "Заблокирован",
};

const TABLE_FILTER_GROUP_LABELS = {
  counterparty: "Контрагент",
  position: "Должность",
  department: "Подразделение",
  constructionSite: "Объект",
  citizenship: "Гражданство",
  isUpload: "ЗУП",
  zupUploadedAt: "Дата ЗУП (НЕТ→ДА)",
  statusCard: "Заполнен",
  documentExpiry: "Срок действия док.",
  status: "Статус",
};

const TABLE_FILTER_VALUE_LABELS = {
  isUpload: {
    uploaded: "ДА (выгружен)",
    not_uploaded: "НЕТ (не выгружен)",
  },
  statusCard: {
    completed: "Заполнен",
    draft: "Не заполнен",
  },
  documentExpiry: {
    expired: "Истек",
    "expiring-soon": "Осталось ≤ 2 недели",
    valid: "В норме",
    "no-data": "Нет данных",
  },
  status: {
    blocked: "Заблокирован",
    fired: "Уволен",
    inactive: "Неактивный",
    draft: "Черновик",
    active: "Действующий",
    processed: "Отправленные",
  },
};

const EmployeesPage = () => {
  const { modal } = App.useApp();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { t } = useTranslation();

  const { user } = useAuthStore();
  const { defaultCounterpartyId } = useSettings();

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

  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState("DESC");
  const [statsPeriod, setStatsPeriod] = useState("day");

  const handleSortChange = useCallback((field, order) => {
    const normalizedField = field === "fullName" ? "updatedAt" : field;
    setSortBy(normalizedField || null);
    setSortOrder(order || null);
    setCurrentPage(1);
  }, [setCurrentPage]);

  const { counterpartyOptions, hasSubcontractors } = useCounterpartyMap({
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
    return Array.isArray(tableFilters.counterparty)
      ? tableFilters.counterparty.filter(Boolean)
      : [];
  }, [tableFilters.counterparty]);

  const isCounterpartyFilterReady = true;

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

    if (effectiveStatusFilters.length > 0) {
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

    if (tableFilters.documentExpiry?.length > 0) {
      filters.documentExpiryStatuses = JSON.stringify(tableFilters.documentExpiry);
    }

    if (tableFilters.isUpload?.length > 0) {
      filters.uploadStates = JSON.stringify(tableFilters.isUpload);
    }

    if (tableFilters.zupUploadedAt?.length === 2) {
      const [from, to] = tableFilters.zupUploadedAt;
      filters.zupUploadedAtFrom = from;
      filters.zupUploadedAtTo = to;
    }

    filters.page = currentPage;
    filters.limit = pageSize;
    if (sortBy && sortBy !== "fullName") filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    return filters;
  }, [
    counterpartyIdsForFilter,
    currentPage,
    debouncedSearchText,
    pageSize,
    sortBy,
    sortOrder,
    statusFilter,
    tableFilters.citizenship,
    tableFilters.constructionSite,
    tableFilters.department,
    tableFilters.documentExpiry,
    tableFilters.isUpload,
    tableFilters.zupUploadedAt,
    tableFilters.position,
    tableFilters.status,
    tableFilters.statusCard,
  ]);

  const exportQueryParams = useMemo(() => {
    const {
      page: _page,
      limit: _limit,
      sortBy: _sortBy,
      sortOrder: _sortOrder,
      activeOnly: _activeOnly,
      uploadStates: _uploadStates,
      statusCard: _statusCard,
      ...rest
    } = employeeRequestFilters || {};

    return rest;
  }, [employeeRequestFilters]);

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
    tableFilters.documentExpiry,
    tableFilters.isUpload,
    tableFilters.zupUploadedAt,
    tableFilters.status,
    tableFilters.statusCard,
    setCurrentPage,
  ]);

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

  const { departments } = useDepartments();
  const { stats: portalStats, loading: portalStatsLoading } =
    useEmployeesPortalStats({
      period: statsPeriod,
      counterpartyIds: counterpartyIdsForFilter,
    });

  const loading = employeesLoading;

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
  const filterOptions = useEmployeeTableFilterOptions({
    counterpartyOptions,
    uniqueFilters,
  });

  const handleRemoveActiveFilter = useCallback(
    (filter) => {
      if (!filter) {
        return;
      }

      if (filter.type === "search") {
        setSearchText("");
        setCurrentPage(1);
        return;
      }

      if (filter.type === "statusFilter") {
        setStatusFilter(null);
        setCurrentPage(1);
        return;
      }

      if (filter.type === "tableFilter") {
        const { filterKey, value } = filter;

        if (filterKey === "zupUploadedAt") {
          setTableFilters((prev) => {
            const nextFilters = { ...(prev || {}) };
            delete nextFilters[filterKey];
            return nextFilters;
          });
          setCurrentPage(1);
          return;
        }

        setTableFilters((prev) => {
          const currentValues = Array.isArray(prev?.[filterKey])
            ? prev[filterKey]
            : [];
          const nextValues = currentValues.filter(
            (item) => String(item) !== String(value),
          );
          const nextFilters = { ...(prev || {}) };

          if (nextValues.length > 0) {
            nextFilters[filterKey] = nextValues;
          } else {
            delete nextFilters[filterKey];
          }

          return nextFilters;
        });
        setCurrentPage(1);
      }
    },
    [setCurrentPage, setSearchText, setStatusFilter, setTableFilters],
  );

  const activeFilters = useMemo(() => {
    const filters = [];

    if (searchText.trim()) {
      filters.push({
        id: `search:${searchText.trim()}`,
        type: "search",
        label: `Поиск: ${searchText.trim()}`,
      });
    }

    if (statusFilter) {
      filters.push({
        id: `statusFilter:${statusFilter}`,
        type: "statusFilter",
        label: `Быстрый статус: ${STATUS_FILTER_LABELS[statusFilter] || statusFilter}`,
      });
    }

    const counterpartyLabelById = new Map(
      (filterOptions.counterparties || []).map((option) => [
        String(option?.value),
        option?.label,
      ]),
    );

    Object.entries(tableFilters || {}).forEach(([filterKey, filterValue]) => {
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      const groupLabel = TABLE_FILTER_GROUP_LABELS[filterKey] || filterKey;

      if (filterKey === "zupUploadedAt" && values.length === 2) {
        const [from, to] = values;
        filters.push({
          id: `table:zupUploadedAt:${from}:${to}`,
          type: "tableFilter",
          filterKey,
          value: values,
          label: `${groupLabel}: ${from} — ${to}`,
        });
        return;
      }

      values.forEach((value) => {
        if (value === null || value === undefined || value === "") {
          return;
        }

        let valueLabel = String(value);
        if (filterKey === "counterparty") {
          valueLabel = counterpartyLabelById.get(String(value)) || String(value);
        } else if (TABLE_FILTER_VALUE_LABELS[filterKey]?.[value]) {
          valueLabel = TABLE_FILTER_VALUE_LABELS[filterKey][value];
        }

        filters.push({
          id: `table:${filterKey}:${value}`,
          type: "tableFilter",
          filterKey,
          value,
          label: `${groupLabel}: ${valueLabel}`,
        });
      });
    });

    return filters;
  }, [filterOptions.counterparties, searchText, statusFilter, tableFilters]);

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
    activeFilters,
    setSearchText,
    setStatusFilter,
    handleResetFilters,
    onRemoveActiveFilter: handleRemoveActiveFilter,
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
    filterOptions,
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
    sortBy,
    sortOrder,
    handleSortChange,
    statsPeriod,
    setStatsPeriod,
    portalStats,
    portalStatsLoading,
    exportQueryParams,
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
