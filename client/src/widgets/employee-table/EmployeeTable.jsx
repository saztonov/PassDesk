import { Table } from "antd";
import { useEffect, useRef } from "react";
import { useEmployeeColumns } from "./EmployeeColumns";
import { useTableFilters } from "./useTableFilters";

// CSS для чередующихся цветов строк и переноса текста в Select
const tableStyles = `
  /* Компактный размер таблицы */
  .ant-table {
    font-size: 13px !important;
  }

  .ant-table td {
    padding: 8px 12px !important;
  }

  .ant-table th {
    padding: 8px 12px !important;
  }

  .table-row-light {
    background-color: #ffffff;
  }
  .table-row-dark {
    background-color: #f5f5f5;
  }
  .employee-table-container .ant-table-tbody > tr > td {
    transition:
      background-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .employee-table-container .table-row-light > td {
    background-color: #ffffff !important;
  }
  .employee-table-container .table-row-dark > td {
    background-color: #f5f5f5 !important;
  }
  .employee-table-container .table-row-light:hover > td,
  .employee-table-container .table-row-light.ant-table-row:hover > td,
  .employee-table-container .table-row-light:focus-within > td {
    background-color: #eef4ff !important;
  }
  .employee-table-container .table-row-dark:hover > td,
  .employee-table-container .table-row-dark.ant-table-row:hover > td,
  .employee-table-container .table-row-dark:focus-within > td {
    background-color: #e7efff !important;
  }
  .employee-table-container .table-row-light:hover > td:first-child,
  .employee-table-container .table-row-dark:hover > td:first-child,
  .employee-table-container .table-row-light:focus-within > td:first-child,
  .employee-table-container .table-row-dark:focus-within > td:first-child {
    box-shadow: inset 3px 0 0 #1677ff;
  }
  .employee-table-container .ant-table-tbody > tr.ant-table-row-selected > td {
    background-color: inherit !important;
  }

  /* Однострочное отображение Select в столбце "Подразделение" */
  .department-select .ant-select-selection-item {
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 22px !important;
    height: 22px !important;
  }

  .department-select .ant-select-selector {
    height: 32px !important;
    padding: 4px 11px !important;
    align-items: center !important;
  }

  /* Контейнер таблицы занимает всю доступную высоту */
  .employee-table-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .employee-table-container .ant-table-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-top: 0 !important;
  }

  .employee-table-container .ant-spin-nested-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .employee-table-container .ant-spin-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .employee-table-container .ant-table {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .employee-table-container .ant-table-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .employee-table-container .ant-table-body {
    flex: 1;
    min-height: 0;
    overflow: auto !important;
  }

  /* Пагинация всегда внизу */
  .employee-table-container .ant-table-pagination {
    flex-shrink: 0;
    margin: 12px 0 !important;
    padding-right: 10px !important;
  }
`;

/**
 * Widget таблицы сотрудников
 * Оптимизирован для быстрой загрузки и рендеринга
 * Сохраняет состояние фильтров в localStorage
 */
const EMPTY_HIDDEN_COLUMN_KEYS = [];
const FORCED_HIDDEN_COLUMN_KEYS = new Set([
  "position",
  "department",
  "constructionSite",
  "documentExpiry",
  "status",
]);
const INTERACTIVE_ROW_TARGET_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "[role='button']",
  ".ant-btn",
  ".ant-select",
  ".ant-select-selector",
  ".ant-picker",
  ".ant-picker-input",
  ".ant-input",
  ".ant-input-affix-wrapper",
  ".ant-popover",
  ".ant-popconfirm",
  ".ant-badge",
].join(", ");

export const EmployeeTable = ({
  employees,
  total = 0,
  departments,
  loading,
  currentPage,
  pageSize,
  onPaginationChange,
  onEdit,
  onView,
  onDelete,
  onViewFiles,
  onDepartmentChange,
  canExport,
  showDepartmentColumn,
  showCounterpartyColumn, // Новый prop для показа столбца "Контрагент"
  canDeleteEmployee,
  canMarkForDeletion,
  onMarkForDeletion,
  uniqueFilters,
  filterOptions,
  onFiltersChange,
  onConstructionSitesEdit, // Новый prop для редактирования объектов
  resetTrigger, // Триггер для сброса фильтров
  hiddenColumnKeys = EMPTY_HIDDEN_COLUMN_KEYS,
  currentSortBy,
  currentSortOrder,
  onSortChange,
}) => {
  const {
    filters,
    onFiltersChange: handleLocalFiltersChange,
    clearFilters,
  } = useTableFilters();

  const columns = useEmployeeColumns({
    departments,
    onEdit,
    onView,
    onDelete,
    onViewFiles,
    onDepartmentChange,
    canExport,
    showDepartmentColumn,
    showCounterpartyColumn, // Передаем новый prop
    canDeleteEmployee,
    canMarkForDeletion,
    onMarkForDeletion,
    uniqueFilters,
    filterOptions,
    filters, // Передаем фильтры в хук колонок
    onConstructionSitesEdit, // Передаем новый callback
    resetTrigger, // Передаем триггер сброса
    currentSortBy,
    currentSortOrder,
  });

  const visibleColumns = columns.filter(
    (column) =>
      !hiddenColumnKeys.includes(column.key) &&
      !FORCED_HIDDEN_COLUMN_KEYS.has(column.key),
  );

  // При загрузке фильтров из localStorage передаем их на верхний уровень
  // Используем ref чтобы отследить первую загрузку
  const filtersInitializedRef = useRef(false);
  useEffect(() => {
    // Передаем фильтры наверх когда они загружены из localStorage (при первом рендере после инициализации)
    if (
      onFiltersChange &&
      !filtersInitializedRef.current &&
      Object.keys(filters).length > 0
    ) {
      filtersInitializedRef.current = true;
      onFiltersChange(filters);
    }
  }, [filters, onFiltersChange]);

  // Сбрасываем фильтры когда меняется resetTrigger
  useEffect(() => {
    if (resetTrigger > 0) {
      clearFilters();
    }
  }, [resetTrigger, clearFilters]);

  // Обработчик изменения таблицы (фильтры, сортировка, пагинация)
  const handleTableChange = (pagination, nextFilters, sorter, extra) => {
    // Серверная сортировка
    if (extra?.action === "sort" && onSortChange) {
      const sortField = sorter?.column?.key || sorter?.field || null;
      const sortOrder = sorter?.order === "descend" ? "DESC" : sorter?.order === "ascend" ? "ASC" : null;
      onSortChange(sortField, sortOrder);
    }
    const rawFilters = nextFilters || {};
    const normalizedFilters = Object.entries(rawFilters).reduce(
      (acc, [key, value]) => {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            acc[key] = value;
          }
          return acc;
        }

        if (value !== null && value !== undefined) {
          acc[key] = value;
        }

        return acc;
      },
      {},
    );

    const shouldApplyFilterUpdate = extra?.action === "filter";

    if (shouldApplyFilterUpdate) {
      handleLocalFiltersChange(normalizedFilters);

      // Передаем фильтры на верхний уровень если callback передан
      if (onFiltersChange) {
        onFiltersChange(normalizedFilters);
      }
    }

    if (onPaginationChange) {
      const nextPage =
        extra?.action === "filter" ? 1 : (pagination.current ?? currentPage);
      const nextPageSize = pagination.pageSize ?? pageSize;
      onPaginationChange(nextPage, nextPageSize);
    }
  };

  return (
    <div className="employee-table-container">
      <style>{tableStyles}</style>
      <Table
        columns={visibleColumns}
        dataSource={employees}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total) => `Всего: ${total}`,
        }}
        rowClassName={(record, index) =>
          index % 2 === 0 ? "table-row-light" : "table-row-dark"
        }
        onRow={(record) => ({
          onClick: (event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(INTERACTIVE_ROW_TARGET_SELECTOR)
            ) {
              return;
            }

            onView(record);
          },
          style: {
            cursor: "pointer",
          },
        })}
        scroll={{
          x: 1300,
          y: "calc(100vh - 220px)",
        }}
        onChange={handleTableChange}
      />
    </div>
  );
};
