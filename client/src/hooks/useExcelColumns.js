import { useState, useEffect } from "react";

// Все доступные столбцы для экспорта (в стандартном порядке)
const DEFAULT_COLUMNS = [
  { key: "number", label: "№ п/п" },
  { key: "fullName", label: "ФИО" },
  { key: "gender", label: "Пол" },
  { key: "kig", label: "КИГ" },
  { key: "kigEndDate", label: "Дата окончания КИГ" },
  { key: "citizenship", label: "Гражданство" },
  { key: "birthDate", label: "Дата рождения" },
  { key: "birthCountry", label: "Страна рождения" },
  { key: "birthRegion", label: "Область рождения" },
  { key: "birthCity", label: "Населенный пункт рождения" },
  { key: "snils", label: "СНИЛС" },
  { key: "position", label: "Должность" },
  { key: "department", label: "Подразделение" },
  { key: "inn", label: "ИНН сотрудника" },
  { key: "passportType", label: "Тип паспорта" },
  { key: "passport", label: "Паспорт" },
  { key: "passportDate", label: "Дата выдачи паспорта" },
  { key: "passportExpiryDate", label: "Дата окончания паспорта" },
  { key: "passportIssuer", label: "Кем выдан паспорт" },
  { key: "passportDepartmentCode", label: "Код подразделения" },
  { key: "registrationAddress", label: "Адрес регистрации" },
  { key: "phone", label: "Телефон" },
  { key: "patentNumber", label: "Патент" },
  { key: "patentIssueDate", label: "Дата выдачи патента" },
  { key: "blankNumber", label: "Номер бланка патента" },
  { key: "counterparty", label: "Контрагент" },
  { key: "counterpartyInn", label: "ИНН контрагента" },
  { key: "counterpartyKpp", label: "КПП контрагента" },
  { key: "bankAccountNumber", label: "Номер банковского счета" },
  { key: "bankBik", label: "БИК" },
  { key: "idAll", label: "id_all" },
];

const STORAGE_KEY = "passdesk_excel_columns_selection";
const DEFAULT_COLUMNS_BY_KEY = new Map(
  DEFAULT_COLUMNS.map((column) => [column.key, column]),
);

// Получить дефолтное состояние (все столбцы активны в стандартном порядке)
const getDefaultSelection = () => {
  return DEFAULT_COLUMNS.map((col, index) => ({
    key: col.key,
    label: col.label,
    enabled: true,
    order: index,
  }));
};

const normalizeColumnsSelection = (rawColumns) => {
  if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
    return getDefaultSelection();
  }

  const seenKeys = new Set();
  const normalized = [];

  rawColumns.forEach((column) => {
    const key = typeof column?.key === "string" ? column.key.trim() : "";
    if (!key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    const defaultColumn = DEFAULT_COLUMNS_BY_KEY.get(key);

    normalized.push({
      key,
      label: defaultColumn?.label || column?.label || key,
      enabled: typeof column?.enabled === "boolean" ? column.enabled : true,
      order: normalized.length,
    });
  });

  const getKeyIndex = (key) => normalized.findIndex((column) => column.key === key);

  DEFAULT_COLUMNS.forEach((defaultColumn, defaultIndex) => {
    if (seenKeys.has(defaultColumn.key)) {
      return;
    }

    const missingColumn = {
      key: defaultColumn.key,
      label: defaultColumn.label,
      enabled: true,
      order: normalized.length,
    };

    let insertIndex = normalized.length;

    for (let i = defaultIndex - 1; i >= 0; i -= 1) {
      const previousKey = DEFAULT_COLUMNS[i]?.key;
      const previousIndex = getKeyIndex(previousKey);
      if (previousIndex !== -1) {
        insertIndex = previousIndex + 1;
        break;
      }
    }

    if (insertIndex === normalized.length) {
      for (let i = defaultIndex + 1; i < DEFAULT_COLUMNS.length; i += 1) {
        const nextKey = DEFAULT_COLUMNS[i]?.key;
        const nextIndex = getKeyIndex(nextKey);
        if (nextIndex !== -1) {
          insertIndex = nextIndex;
          break;
        }
      }
    }

    normalized.splice(insertIndex, 0, missingColumn);
    seenKeys.add(defaultColumn.key);
  });

  const issuerIndex = normalized.findIndex(
    (column) => column.key === "passportIssuer",
  );
  const departmentCodeIndex = normalized.findIndex(
    (column) => column.key === "passportDepartmentCode",
  );

  if (issuerIndex !== -1 && departmentCodeIndex !== -1) {
    const [departmentCodeColumn] = normalized.splice(departmentCodeIndex, 1);
    const nextIssuerIndex = normalized.findIndex(
      (column) => column.key === "passportIssuer",
    );
    const targetIndex = nextIssuerIndex + 1;
    normalized.splice(targetIndex, 0, departmentCodeColumn);
  }

  return normalized.map((column, index) => ({
    ...column,
    order: index,
  }));
};

/**
 * Хук для управления выбором и порядком столбцов экспорта
 * Сохраняет выбор в localStorage
 */
export const useExcelColumns = () => {
  const [columns, setColumns] = useState(getDefaultSelection());
  const [isLoading, setIsLoading] = useState(true);

  // Загружаем состояние из localStorage при инициализации
  useEffect(() => {
    try {
      const savedSelection = localStorage.getItem(STORAGE_KEY);
      if (savedSelection) {
        const parsed = JSON.parse(savedSelection);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = normalizeColumnsSelection(parsed);
          setColumns(normalized);

          if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
        }
      }
    } catch (error) {
      console.error("Error loading Excel columns selection:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Сохраняем состояние в localStorage при изменении
  const updateColumns = (newColumns) => {
    const normalized = normalizeColumnsSelection(newColumns);
    setColumns(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.error("Error saving Excel columns selection:", error);
    }
  };

  // Включить/отключить столбец
  const toggleColumn = (columnKey) => {
    const updated = columns.map((col) =>
      col.key === columnKey ? { ...col, enabled: !col.enabled } : col,
    );
    updateColumns(updated);
  };

  // Переместить столбец вверх
  const moveColumnUp = (columnKey) => {
    const currentIndex = columns.findIndex((col) => col.key === columnKey);
    if (currentIndex <= 0) return;

    const updated = [...columns];
    [updated[currentIndex], updated[currentIndex - 1]] = [
      updated[currentIndex - 1],
      updated[currentIndex],
    ];

    // Обновляем значения order для корректности
    updated.forEach((col, index) => {
      col.order = index;
    });

    updateColumns(updated);
  };

  // Переместить столбец вниз
  const moveColumnDown = (columnKey) => {
    const currentIndex = columns.findIndex((col) => col.key === columnKey);
    if (currentIndex >= columns.length - 1) return;

    const updated = [...columns];
    [updated[currentIndex], updated[currentIndex + 1]] = [
      updated[currentIndex + 1],
      updated[currentIndex],
    ];

    // Обновляем значения order для корректности
    updated.forEach((col, index) => {
      col.order = index;
    });

    updateColumns(updated);
  };

  // Включить все
  const selectAll = () => {
    const allSelected = columns.map((col) => ({
      ...col,
      enabled: true,
    }));
    updateColumns(allSelected);
  };

  // Отключить все
  const deselectAll = () => {
    const allDeselected = columns.map((col) => ({
      ...col,
      enabled: false,
    }));
    updateColumns(allDeselected);
  };

  // Получить список активных столбцов в порядке
  const getActiveColumns = () => {
    return columns.filter((col) => col.enabled);
  };

  // Сбросить в дефолтное состояние
  const resetToDefault = () => {
    const defaultColumns = getDefaultSelection();
    updateColumns(defaultColumns);
  };

  return {
    columns,
    isLoading,
    updateColumns,
    toggleColumn,
    moveColumnUp,
    moveColumnDown,
    selectAll,
    deselectAll,
    resetToDefault,
    getActiveColumns,
  };
};
