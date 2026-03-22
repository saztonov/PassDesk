import { useEffect, useState } from "react";

const STORAGE_KEY = "employee_table_filters";

const getInitialFilters = () => {
  return {};
};

/**
 * Хук для сохранения и восстановления фильтров таблицы сотрудников
 * Хранит только фильтры столбцов, где они есть
 * Поддерживает как обычные массивы значений, так и массивы дат для фильтра "Дата создания"
 */
export const useTableFilters = () => {
  const [filters, setFilters] = useState(getInitialFilters);

  useEffect(() => {
    setFilters({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Сохранение фильтров при изменении
  const handleFiltersChange = (newFilters) => {
    // Фильтруем фильтры: оставляем только те, у которых есть значения
    const filteredFilters = {};
    Object.keys(newFilters).forEach((key) => {
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
  };

  // Очистка фильтров
  const clearFilters = () => {
    setFilters({});
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    filters,
    onFiltersChange: handleFiltersChange,
    clearFilters,
  };
};
