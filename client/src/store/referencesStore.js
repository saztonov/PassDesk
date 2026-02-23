import { create } from "zustand";
import { citizenshipService } from "@/services/citizenshipService";
import { departmentApi } from "@/entities/department";
import { settingsApi } from "@/entities/settings";
import positionService from "@/services/positionService";
import { constructionSiteService } from "@/services/constructionSiteService";

/**
 * Глобальный store для кэширования справочников
 * Автоматически управляет TTL (время жизни кэша)
 * Сбрасывает кэш при мутациях
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

export const useReferencesStore = create((set, get) => ({
  // ===== ГРАЖДАНСТВА =====
  citizenships: null,
  citizenshipsLoading: false,
  citizenshipsError: null,
  citizenshipsLastFetch: null,

  fetchCitizenships: async (force = false) => {
    const state = get();
    const now = Date.now();

    // Проверяем кэш (если не force и кэш свежий)
    if (
      !force &&
      state.citizenships &&
      state.citizenshipsLastFetch &&
      now - state.citizenshipsLastFetch < CACHE_TTL
    ) {
      return state.citizenships;
    }

    // Если уже загружается - ждём
    if (state.citizenshipsLoading) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.citizenshipsLoading) {
            clearInterval(interval);
            resolve(currentState.citizenships);
          }
        }, 100);
      });
    }

    set({ citizenshipsLoading: true, citizenshipsError: null });

    try {
      const response = await citizenshipService.getAll();
      const data = response.data?.data?.citizenships || [];

      set({
        citizenships: data,
        citizenshipsLoading: false,
        citizenshipsLastFetch: Date.now(),
      });

      return data;
    } catch (error) {
      console.error("Error loading citizenships:", error);
      set({ citizenshipsError: error, citizenshipsLoading: false });
      throw error;
    }
  },

  invalidateCitizenships: () => {
    set({ citizenshipsLastFetch: null });
  },

  // ===== ДОЛЖНОСТИ =====
  positions: null,
  positionsLoading: false,
  positionsError: null,
  positionsLastFetch: null,

  fetchPositions: async (force = false) => {
    const state = get();
    const now = Date.now();

    if (
      !force &&
      state.positions &&
      state.positionsLastFetch &&
      now - state.positionsLastFetch < CACHE_TTL
    ) {
      return state.positions;
    }

    if (state.positionsLoading) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.positionsLoading) {
            clearInterval(interval);
            resolve(currentState.positions);
          }
        }, 100);
      });
    }

    set({ positionsLoading: true, positionsError: null });

    try {
      const response = await positionService.getAll({ limit: 10000 });
      const data = response.data?.data?.positions || [];

      set({
        positions: data,
        positionsLoading: false,
        positionsLastFetch: Date.now(),
      });

      return data;
    } catch (error) {
      console.error("Error loading positions:", error);
      set({ positionsError: error, positionsLoading: false });
      throw error;
    }
  },

  invalidatePositions: () => {
    set({ positionsLastFetch: null });
  },

  // ===== ПОДРАЗДЕЛЕНИЯ =====
  departments: null,
  departmentsLoading: false,
  departmentsError: null,
  departmentsLastFetch: null,

  fetchDepartments: async (force = false) => {
    const state = get();
    const now = Date.now();

    if (
      !force &&
      state.departments &&
      state.departmentsLastFetch &&
      now - state.departmentsLastFetch < CACHE_TTL
    ) {
      return state.departments;
    }

    if (state.departmentsLoading) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.departmentsLoading) {
            clearInterval(interval);
            resolve(currentState.departments);
          }
        }, 100);
      });
    }

    set({ departmentsLoading: true, departmentsError: null });

    try {
      const response = await departmentApi.getAll();
      const data = response?.data?.departments || [];

      set({
        departments: data,
        departmentsLoading: false,
        departmentsLastFetch: Date.now(),
      });

      return data;
    } catch (error) {
      console.error("Error loading departments:", error);
      set({ departmentsError: error, departmentsLoading: false });
      throw error;
    }
  },

  invalidateDepartments: () => {
    set({ departmentsLastFetch: null });
  },

  // ===== НАСТРОЙКИ =====
  settings: null,
  formConfigDefault: null,
  formConfigExternal: null,
  settingsLoading: false,
  settingsError: null,
  settingsLastFetch: null,

  fetchSettings: async (force = false) => {
    const state = get();
    const now = Date.now();

    if (
      !force &&
      state.settings &&
      state.settingsLastFetch &&
      now - state.settingsLastFetch < CACHE_TTL
    ) {
      return state.settings;
    }

    if (state.settingsLoading) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.settingsLoading) {
            clearInterval(interval);
            resolve(currentState.settings);
          }
        }, 100);
      });
    }

    set({ settingsLoading: true, settingsError: null });

    try {
      const response = await settingsApi.getPublicSettings();
      const data = response?.data || {};

      set({
        settings: data,
        formConfigDefault: data.employeeFormConfigDefault,
        formConfigExternal: data.employeeFormConfigExternal,
        settingsLoading: false,
        settingsLastFetch: Date.now(),
      });

      return data;
    } catch (error) {
      const status = error?.response?.status;

      // Для неактивных/неавторизованных пользователей публичные настройки не критичны.
      // Возвращаем безопасный fallback, чтобы UI не падал из-за 401/403.
      if (status === 401 || status === 403) {
        const fallback = {
          defaultCounterpartyId: null,
          employeeFormConfigDefault: null,
          employeeFormConfigExternal: null,
          employeeDocumentProfiles: null,
        };

        set({
          settings: fallback,
          formConfigDefault: null,
          formConfigExternal: null,
          settingsError: null,
          settingsLoading: false,
          settingsLastFetch: Date.now(),
        });

        return fallback;
      }

      console.error("Error loading settings:", error);
      set({ settingsError: error, settingsLoading: false });
      throw error;
    }
  },

  updateFormConfig: (type, config) => {
    if (type === "default") {
      set({ formConfigDefault: config });
    } else {
      set({ formConfigExternal: config });
    }
    // Сбрасываем время fetch, чтобы при следующем запросе данные обновились (хотя мы уже обновили локально)
    set({ settingsLastFetch: Date.now() });
  },

  invalidateSettings: () => {
    set({ settingsLastFetch: null });
  },

  // ===== ОБЪЕКТЫ СТРОИТЕЛЬСТВА =====
  constructionSites: null,
  constructionSitesLoading: false,
  constructionSitesError: null,
  constructionSitesLastFetch: null,

  fetchConstructionSites: async (counterpartyId, force = false) => {
    const state = get();
    const now = Date.now();

    // Для объектов строительства зависимость от counterpartyId
    // Поэтому кэшируем по ключу
    if (
      !force &&
      state.constructionSites &&
      state.constructionSitesLastFetch &&
      now - state.constructionSitesLastFetch < CACHE_TTL
    ) {
      return state.constructionSites;
    }

    if (state.constructionSitesLoading) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.constructionSitesLoading) {
            clearInterval(interval);
            resolve(currentState.constructionSites);
          }
        }, 100);
      });
    }

    set({ constructionSitesLoading: true, constructionSitesError: null });

    try {
      const response =
        await constructionSiteService.getByCounterparty(counterpartyId);
      const data = response?.data?.data?.constructionSites || [];

      set({
        constructionSites: data,
        constructionSitesLoading: false,
        constructionSitesLastFetch: Date.now(),
      });

      return data;
    } catch (error) {
      console.error("Error loading construction sites:", error);
      set({ constructionSitesError: error, constructionSitesLoading: false });
      throw error;
    }
  },

  invalidateConstructionSites: () => {
    set({ constructionSitesLastFetch: null });
  },

  // ===== ОБЩИЕ МЕТОДЫ =====

  // Сбросить весь кэш
  invalidateAll: () => {
    set({
      citizenshipsLastFetch: null,
      positionsLastFetch: null,
      departmentsLastFetch: null,
      settingsLastFetch: null,
      constructionSitesLastFetch: null,
    });
  },

  // Очистить все данные (при logout)
  clearAll: () => {
    set({
      citizenships: null,
      citizenshipsLastFetch: null,
      positions: null,
      positionsLastFetch: null,
      departments: null,
      departmentsLastFetch: null,
      settings: null,
      formConfigDefault: null,
      formConfigExternal: null,
      settingsLastFetch: null,
      constructionSites: null,
      constructionSitesLastFetch: null,
    });
  },
}));
