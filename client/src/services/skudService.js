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

  getLocalEmployees: async (params = {}) => {
    const response = await api.get("/skud/local/employees", { params });
    return toData(response);
  },

  getProviderEmployees: async (params = {}) => {
    const response = await api.get("/skud/provider/employees", { params });
    return toData(response);
  },

  getProviderEmployee: async (externalEmpId) => {
    const response = await api.get(`/skud/provider/employees/${externalEmpId}`);
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

  previewBindingImport: async (rows = []) => {
    const response = await api.post("/skud/bindings/import/preview", { rows });
    return toData(response);
  },

  executeBindingImport: async (rows = []) => {
    const response = await api.post("/skud/bindings/import/execute", { rows });
    return toData(response);
  },

  syncEmployee: async (employeeId) => {
    const response = await api.post(`/skud/sync/employee/${employeeId}`);
    return toData(response);
  },

  blockEmployee: async (employeeId, payload = {}) => {
    const response = await api.post(`/skud/sync/employee/${employeeId}/block`, payload);
    return toData(response);
  },

  unblockEmployee: async (employeeId, payload = {}) => {
    const response = await api.post(`/skud/sync/employee/${employeeId}/unblock`, payload);
    return toData(response);
  },

  upsertBinding: async (employeeId, payload) => {
    const response = await api.post(`/skud/bindings/employee/${employeeId}`, payload);
    return toData(response);
  },

  getEmployeeBinding: async (employeeId) => {
    const response = await api.get(`/skud/bindings/employee/${employeeId}`);
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

  issueQr: async (payload) => {
    const response = await api.post("/skud/qr/issue", payload);
    return toData(response);
  },

  verifyQr: async (payload) => {
    const response = await api.post("/skud/qr/verify", payload);
    return toData(response);
  },
};

export default skudService;
