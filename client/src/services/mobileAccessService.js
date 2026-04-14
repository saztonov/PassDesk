import api from "./api";

const toData = (response) => response?.data?.data ?? response?.data ?? null;

const mobileAccessService = {
  issueQuickQr: async (payload) => {
    const response = await api.post("/mobile-access/quick-qr", payload);
    return toData(response);
  },
};

export default mobileAccessService;
