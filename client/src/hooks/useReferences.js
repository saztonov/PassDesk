import { useEffect } from "react";
import { useReferencesStore } from "@/store/referencesStore";

/**
 * Хуки для работы с кэшированными справочниками
 * Автоматически загружают данные при монтировании компонента
 * Используют глобальный кэш (не делают повторных запросов если данные свежие)
 */

/**
 * Хук для работы с подразделениями
 * @param {boolean} autoLoad - автоматически загружать при монтировании (по умолчанию true)
 */
export const useDepartmentsReference = (autoLoad = true) => {
  const {
    departments,
    departmentsLoading,
    departmentsError,
    fetchDepartments,
    invalidateDepartments,
  } = useReferencesStore();

  useEffect(() => {
    if (autoLoad) {
      fetchDepartments();
    }
  }, [autoLoad, fetchDepartments]);

  return {
    departments: departments || [],
    loading: departmentsLoading,
    error: departmentsError,
    refetch: () => fetchDepartments(true), // force reload
    invalidate: invalidateDepartments,
  };
};

/**
 * Хук для работы с настройками
 * @param {boolean} autoLoad - автоматически загружать при монтировании (по умолчанию true)
 */
export const useSettingsReference = (autoLoad = true) => {
  const {
    settings,
    settingsLoading,
    settingsError,
    fetchSettings,
    invalidateSettings,
  } = useReferencesStore();

  useEffect(() => {
    if (autoLoad) {
      fetchSettings();
    }
  }, [autoLoad, fetchSettings]);

  return {
    settings: settings || {},
    defaultCounterpartyId: settings?.defaultCounterpartyId,
    employeeDocumentProfiles: settings?.employeeDocumentProfiles || null,
    loading: settingsLoading,
    error: settingsError,
    refetch: () => fetchSettings(true), // force reload
    invalidate: invalidateSettings,
  };
};
