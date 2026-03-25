import api from '@/services/api';
import { deduplicateRequest } from "@/utils/requestCache";

/**
 * API для работы с настройками
 */
export const settingsApi = {
  // Получить публичные настройки
  getPublicSettings: async () => {
    const response = await deduplicateRequest(
      "settings:public",
      () => api.get('/settings/public'),
    );
    return response.data;
  },

  // Получить все настройки (требует авторизации)
  getAll: async () => {
    const response = await api.get('/settings');
    return response.data;
  },

  // Обновить настройку
  update: async (key, value) => {
    const response = await api.put('/settings', { key, value });
    return response.data;
  },
};
