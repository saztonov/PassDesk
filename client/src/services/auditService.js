import api from "./api";
import { deduplicateRequest } from "../utils/requestCache";

export const auditService = {
  getAll: (params) =>
    deduplicateRequest(
      `audit-logs:getAll:${JSON.stringify(params || {})}`,
      () => api.get("/audit-logs", { params }),
    ),
  getEmployeeHistory: (employeeId, params = {}) =>
    deduplicateRequest(
      `audit-logs:getEmployeeHistory:${employeeId}:${JSON.stringify(params || {})}`,
      () =>
        api.get("/audit-logs", {
          params: {
            ...params,
            entityId: employeeId,
          },
        }),
    ),
};

export default auditService;
