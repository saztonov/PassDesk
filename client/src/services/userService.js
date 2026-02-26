import api from "./api";

export const userService = {
  // Получить всех пользователей
  getAll: async (params = {}) => {
    const response = await api.get("/users", { params });
    return response.data;
  },

  // Получить пользователя по ID
  getById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  // Создать пользователя
  create: async (userData) => {
    const response = await api.post("/users", userData);
    return response.data;
  },

  // Обновить пользователя
  update: async (id, userData) => {
    const response = await api.put(`/users/${id}`, userData);
    return response.data;
  },

  // Удалить пользователя
  delete: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  // Получить удаленных пользователей
  getDeleted: async (params = {}) => {
    const response = await api.get("/users/deleted", { params });
    return response.data;
  },

  // Восстановить пользователя
  restore: async (id) => {
    const response = await api.post(`/users/${id}/restore`);
    return response.data;
  },

  // Полностью удалить пользователя из корзины
  permanentlyDelete: async (id) => {
    const response = await api.delete(`/users/${id}/permanent`);
    return response.data;
  },

  // Обновить пароль
  updatePassword: async (id, passwordData) => {
    const response = await api.patch(`/users/${id}/password`, passwordData);
    return response.data;
  },

  // Переключить статус активности
  toggleStatus: async (id) => {
    const response = await api.patch(`/users/${id}/toggle-status`);
    return response.data;
  },
};
