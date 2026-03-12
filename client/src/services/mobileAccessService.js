import axios from "axios";
import { getBaseURL } from "./api";

const publicApi = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
  timeout: 60000,
});

const toData = (response) => response?.data?.data ?? response?.data ?? null;

const mobileAccessService = {
  issueQuickQr: async (payload) => {
    const response = await publicApi.post("/mobile-access/quick-qr", payload);
    return toData(response);
  },
};

export default mobileAccessService;
