import { useEffect, useState } from "react";

const TABLE_FILTERS_STORAGE_KEY = "employee_table_filters";
const TABLE_COLUMNS_STORAGE_KEY = "employee_table_columns";
const EMPLOYEES_PAGE_STATE_STORAGE_KEY = "employees_page_state";

const getInitialFilters = () => {
  return {};
};

const getInitialHiddenColumns = () => {
  try {
    const saved = localStorage.getItem(TABLE_COLUMNS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.warn("Ошибка при загрузке колонок таблицы:", error);
    return [];
  }
};

const getInitialPageState = () => {
  try {
    const saved = localStorage.getItem(EMPLOYEES_PAGE_STATE_STORAGE_KEY);
    if (!saved) {
      return { searchText: "", statusFilter: null, currentPage: 1, pageSize: 20 };
    }
    const parsed = JSON.parse(saved);
    return {
      searchText: "",
      statusFilter: null,
      currentPage: 1,
      pageSize:
        Number.isInteger(parsed.pageSize) && parsed.pageSize > 0
          ? parsed.pageSize
          : 20,
    };
  } catch (error) {
    console.warn("Ошибка при загрузке состояния страницы сотрудников:", error);
    return { searchText: "", statusFilter: null, currentPage: 1, pageSize: 20 };
  }
};

const normalizeTableFilters = (value) => {
  const normalized = {};
  Object.entries(value || {}).forEach(([key, item]) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      if (item.length > 0) {
        normalized[key] = item;
      }
      return;
    }
    normalized[key] = item;
  });
  return normalized;
};

export const useEmployeesPageStorage = () => {
  const [initialPageState] = useState(getInitialPageState);
  const [searchText, setSearchText] = useState(initialPageState.searchText);
  const [statusFilter, setStatusFilter] = useState(
    initialPageState.statusFilter,
  );
  const [currentPage, setCurrentPage] = useState(initialPageState.currentPage);
  const [pageSize, setPageSize] = useState(initialPageState.pageSize);
  const [tableFilters, setTableFilters] = useState(getInitialFilters);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [hiddenColumns, setHiddenColumns] = useState(getInitialHiddenColumns);

  useEffect(() => {
    setSearchText("");
    setStatusFilter(null);
    setCurrentPage(1);
    setTableFilters({});
    localStorage.removeItem(TABLE_FILTERS_STORAGE_KEY);
    localStorage.setItem(
      EMPLOYEES_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        searchText: "",
        statusFilter: null,
        currentPage: 1,
        pageSize: initialPageState.pageSize,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(
      EMPLOYEES_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({ searchText, statusFilter, currentPage, pageSize }),
    );
  }, [searchText, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    const normalizedFilters = normalizeTableFilters(tableFilters);
    if (Object.keys(normalizedFilters).length > 0) {
      localStorage.setItem(
        TABLE_FILTERS_STORAGE_KEY,
        JSON.stringify(normalizedFilters),
      );
    } else {
      localStorage.removeItem(TABLE_FILTERS_STORAGE_KEY);
    }
  }, [tableFilters]);

  const handleResetFilters = () => {
    setSearchText("");
    setStatusFilter(null);
    setTableFilters({});
    setCurrentPage(1);
    localStorage.removeItem(TABLE_FILTERS_STORAGE_KEY);
    localStorage.setItem(
      EMPLOYEES_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        searchText: "",
        statusFilter: null,
        currentPage: 1,
        pageSize,
      }),
    );
    setResetTrigger((prev) => prev + 1);
  };

  const handleToggleColumn = (key) => {
    setHiddenColumns((prev) => {
      const next = prev.includes(key)
        ? prev.filter((col) => col !== key)
        : [...prev, key];
      localStorage.setItem(TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleResetColumns = () => {
    setHiddenColumns([]);
    localStorage.setItem(TABLE_COLUMNS_STORAGE_KEY, JSON.stringify([]));
  };

  return {
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
  };
};
