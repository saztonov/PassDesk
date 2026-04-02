import api from './api';
import { deduplicateRequest } from "../utils/requestCache";

export const counterpartyService = {
  getAll: (params) =>
    deduplicateRequest(
      `counterparties:getAll:${JSON.stringify(params || {})}`,
      () => api.get('/counterparties', { params }),
    ),
  getById: (id) => api.get(`/counterparties/${id}`),
  create: (data) => api.post('/counterparties', data),
  update: (id, data) => api.put(`/counterparties/${id}`, data),
  delete: (id) => api.delete(`/counterparties/${id}`),
  getStats: () => api.get('/counterparties/stats'),
  generateRegistrationCode: (id) => api.post(`/counterparties/${id}/generate-registration-code`),
  getConstructionSites: (counterpartyId) => api.get(`/counterparties/${counterpartyId}/construction-sites`),
  saveConstructionSites: (counterpartyId, constructionSiteIds) => api.post(`/counterparties/${counterpartyId}/construction-sites`, { constructionSiteIds }),
  syncConstructionSitesFromSkud: (payload = {}) =>
    api.post('/counterparties/sync-construction-sites-from-skud', payload, {
      timeout: 5 * 60 * 1000,
    }),
  getAvailable: () =>
    deduplicateRequest(
      "counterparties:getAvailable",
      () => api.get('/counterparties/available'),
    ) // Список доступных контрагентов для текущего пользователя
};
