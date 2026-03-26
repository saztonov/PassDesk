import api from "./api";
import { deduplicateRequest } from "../utils/requestCache";

export const auditService = {
  getAll: (params) =>
    deduplicateRequest(
      `audit-logs:getAll:${JSON.stringify(params || {})}`,
      () => api.get("/audit-logs", { params }),
    ),
};

export default auditService;
