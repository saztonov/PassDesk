import { useCallback, useState } from "react";

const STORAGE_KEY = "employee_table_filters";
const UNSUPPORTED_FILTER_KEYS = new Set(["fullName", "createdAt"]);

const getInitialFilters = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {};
    }
    const parsed = JSON.parse(saved);
    const normalized = {};
    Object.entries(parsed || {}).forEach(([key, value]) => {
      if (UNSUPPORTED_FILTER_KEYS.has(key)) {
        return;
      }
      normalized[key] = value;
    });
    return normalized;
  } catch (error) {
    console.warn("Ошибка при загрузке фильтров таблицы сотрудников:", error);
    return {};
  }
};

/**
 * Хук для сохранения и восстановления фильтров таблицы сотрудников
 * Хранит только фильтры столбцов, где они есть
 * Поддерживает как обычные массивы значений, так и массивы дат для фильтра "Дата создания"
 */
export const useTableFilters = () => {
  const [filters, setFilters] = useState(getInitialFilters);

  // Сохранение фильтров при изменении
  const handleFiltersChange = useCallback((newFilters) => {
    // Фильтруем фильтры: оставляем только те, у которых есть значения
    const filteredFilters = {};
    Object.keys(newFilters).forEach((key) => {
      if (UNSUPPORTED_FILTER_KEYS.has(key)) {
        return;
      }
      if (newFilters[key]) {
        // Для массивов проверяем длину, для остального проверяем на null/undefined
        if (Array.isArray(newFilters[key])) {
          if (newFilters[key].length > 0) {
            filteredFilters[key] = newFilters[key];
          }
        } else if (newFilters[key] !== null && newFilters[key] !== undefined) {
          filteredFilters[key] = newFilters[key];
        }
      }
    });

    setFilters(filteredFilters);

    // Сохраняем в localStorage
    if (Object.keys(filteredFilters).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredFilters));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Очистка фильтров
  const clearFilters = useCallback(() => {
    setFilters({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    filters,
    onFiltersChange: handleFiltersChange,
    clearFilters,
  };
};
