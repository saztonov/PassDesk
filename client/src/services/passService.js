import api from "./api";

const toData = (response) => response?.data?.data || response?.data || {};

export const passService = {
  getAll: async (params = {}) => {
    const response = await api.get("/passes", { params });
    return toData(response);
  },

  getById: async (id) => {
    const response = await api.get(`/passes/${id}`);
    return toData(response);
  },

  getByEmployee: async (employeeId) => {
    const response = await api.get(`/passes/employee/${employeeId}`);
    return toData(response);
  },

  create: async (passData) => {
    const response = await api.post("/passes", passData);
    return toData(response);
  },

  update: async (id, passData) => {
    const response = await api.put(`/passes/${id}`, passData);
    return toData(response);
  },

  delete: async (id) => {
    const response = await api.delete(`/passes/${id}`);
    return toData(response);
  },

  revoke: async (id, payload = {}) => {
    const response = await api.patch(`/passes/${id}/revoke`, payload);
    return toData(response);
  },
};
