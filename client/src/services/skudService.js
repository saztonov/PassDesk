import api from "./api";

const toData = (response) => response?.data?.data || response?.data || {};

const skudService = {
  getHealth: async () => {
    const response = await api.get("/skud/health");
    return toData(response);
  },

  getStats: async (params = {}) => {
    const response = await api.get("/skud/stats", { params });
    return toData(response);
  },

  getEvents: async (params = {}) => {
    const response = await api.get("/skud/events", { params });
    return toData(response);
  },

  pullEvents: async (payload = {}) => {
    const response = await api.post("/skud/events/pull", payload);
    return toData(response);
  },

  getSyncJobs: async (params = {}) => {
    const response = await api.get("/skud/sync-jobs", { params });
    return toData(response);
  },

  syncEmployee: async (employeeId) => {
    const response = await api.post(`/skud/sync/employee/${employeeId}`);
    return toData(response);
  },

  upsertBinding: async (employeeId, payload) => {
    const response = await api.post(`/skud/bindings/employee/${employeeId}`, payload);
    return toData(response);
  },

  getCards: async (params = {}) => {
    const response = await api.get("/skud/cards", { params });
    return toData(response);
  },

  assignCard: async (payload) => {
    const response = await api.post("/skud/cards/assign", payload);
    return toData(response);
  },

  blockCard: async (cardId) => {
    const response = await api.post("/skud/cards/block", { cardId });
    return toData(response);
  },

  unbindCard: async (cardId) => {
    const response = await api.post("/skud/cards/unbind", { cardId });
    return toData(response);
  },
};

export default skudService;
