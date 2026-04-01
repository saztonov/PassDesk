import api from './api';

export const departmentService = {
  // Получить все подразделения
  getAll: (params = {}) =>
    api.get('/departments', {
      params: params && typeof params === "object" ? params : {},
    }),

  // Получить подразделение по ID
  getById: (id) => api.get(`/departments/${id}`),

  // Создать подразделение
  create: (data) => api.post('/departments', data),

  // Обновить подразделение
  update: (id, data) => api.put(`/departments/${id}`, data),

  // Удалить подразделение
  delete: (id) => api.delete(`/departments/${id}`)
};
