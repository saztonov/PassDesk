import { useEffect, useState } from "react";

const TABLE_FILTERS_STORAGE_KEY = "employee_table_filters";
const TABLE_COLUMNS_STORAGE_KEY = "employee_table_columns";
const EMPLOYEES_PAGE_STATE_STORAGE_KEY = "employees_page_state";
const UNSUPPORTED_FILTER_KEYS = new Set(["fullName", "createdAt"]);
const NON_HIDEABLE_COLUMN_KEYS = new Set(["actions"]);
const EMPLOYEE_PAGE_SIZE_OPTIONS = [50, 100, 200];
const DEFAULT_EMPLOYEE_PAGE_SIZE = 100;

const normalizePageSize = (value) => {
  const parsed = Number(value);
  return EMPLOYEE_PAGE_SIZE_OPTIONS.includes(parsed)
    ? parsed
    : DEFAULT_EMPLOYEE_PAGE_SIZE;
};

const getInitialFilters = () => {
  try {
    const saved = localStorage.getItem(TABLE_FILTERS_STORAGE_KEY);
    return saved ? normalizeTableFilters(JSON.parse(saved)) : {};
  } catch (error) {
    console.warn("Ошибка при загрузке фильтров таблицы:", error);
    return {};
  }
};

const getInitialHiddenColumns = () => {
  try {
    const saved = localStorage.getItem(TABLE_COLUMNS_STORAGE_KEY);
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((key) => !NON_HIDEABLE_COLUMN_KEYS.has(key))
      : [];
  } catch (error) {
    console.warn("Ошибка при загрузке колонок таблицы:", error);
    return [];
  }
};

const getInitialPageState = () => {
  try {
    const saved = localStorage.getItem(EMPLOYEES_PAGE_STATE_STORAGE_KEY);
    if (!saved) {
      return {
        searchText: "",
        statusFilter: null,
        currentPage: 1,
        pageSize: DEFAULT_EMPLOYEE_PAGE_SIZE,
      };
    }
    const parsed = JSON.parse(saved);
    return {
      searchText: typeof parsed.searchText === "string" ? parsed.searchText : "",
      statusFilter:
        typeof parsed.statusFilter === "string" ? parsed.statusFilter : null,
      currentPage:
        Number.isInteger(parsed.currentPage) && parsed.currentPage > 0
          ? parsed.currentPage
          : 1,
      pageSize: normalizePageSize(parsed.pageSize),
    };
  } catch (error) {
    console.warn("Ошибка при загрузке состояния страницы сотрудников:", error);
    return {
      searchText: "",
      statusFilter: null,
      currentPage: 1,
      pageSize: DEFAULT_EMPLOYEE_PAGE_SIZE,
    };
  }
};

const normalizeTableFilters = (value) => {
  const normalized = {};
  Object.entries(value || {}).forEach(([key, item]) => {
    if (UNSUPPORTED_FILTER_KEYS.has(key)) {
      return;
    }
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
      const normalized = next.filter((col) => !NON_HIDEABLE_COLUMN_KEYS.has(col));
      localStorage.setItem(TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
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
