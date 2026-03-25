import api from '@/services/api';
import { deduplicateRequest } from "@/utils/requestCache";

/**
 * API для работы с подразделениями
 */
export const departmentApi = {
  // Получить все подразделения
  getAll: async () => {
    const response = await deduplicateRequest(
      "departments:getAll",
      () => api.get('/departments'),
    );
    return response.data;
  },

  // Получить подразделение по ID
  getById: async (id) => {
    const response = await api.get(`/departments/${id}`);
    return response.data;
  },

  // Создать подразделение
  create: async (data) => {
    const response = await api.post('/departments', data);
    return response.data;
  },

  // Обновить подразделение
  update: async (id, data) => {
    const response = await api.put(`/departments/${id}`, data);
    return response.data;
  },

  // Удалить подразделение
  delete: async (id) => {
    const response = await api.delete(`/departments/${id}`);
    return response.data;
  },
};
