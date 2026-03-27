import api from './api';

const applicationService = {
  // Получить все заявки
  getAll: (params) => api.get('/applications', { params }),

  // Получить заявку по ID
  getById: (id) => api.get(`/applications/${id}`),

  // Создать заявку
  create: (data) => api.post('/applications', data),

  // Обновить заявку
  update: (id, data) => api.put(`/applications/${id}`, data),

  // Удалить заявку
  delete: (id) => api.delete(`/applications/${id}`),

  // Копировать заявку
  copy: (id) => api.post(`/applications/${id}/copy`),

  // Получить договоры для контрагента и объекта
  getContracts: (counterpartyId, constructionSiteId) => 
    api.get('/applications/helpers/contracts', {
      params: { counterpartyId, constructionSiteId }
    }),

  // Получить сотрудников контрагента
  getEmployees: (counterpartyId) => 
    api.get('/applications/helpers/employees', {
      params: { counterpartyId }
    }),

  getRequestEmployees: (params) =>
    api.get('/applications/helpers/request-employees', { params }),

  // Работа с файлами заявки
  uploadFiles: (applicationId, formData) =>
    api.post(`/applications/${applicationId}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  getFiles: (applicationId) =>
    api.get(`/applications/${applicationId}/files`),

  deleteFile: (applicationId, fileId) =>
    api.delete(`/applications/${applicationId}/files/${fileId}`),

  getFileDownloadLink: (applicationId, fileId) =>
    api.get(`/applications/${applicationId}/files/${fileId}/download`),

  getFileViewLink: (applicationId, fileId) =>
    api.get(`/applications/${applicationId}/files/${fileId}/view`),

  // Экспорт заявки в Word
  exportToWord: async (applicationId) => {
    const response = await api.get(`/applications/${applicationId}/export/word`, {
      responseType: 'blob' // Важно для скачивания файлов
    });
    return response;
  },

  // Выгрузить согласия на перс. данные Застройщика в ZIP
  downloadDeveloperBiometricConsents: (applicationId, employeeIds) =>
    api.post(`/applications/${applicationId}/consents/developer-biometric/download`, { employeeIds }, {
      responseType: 'blob' // Важно для скачивания файлов
    })
};

export { applicationService };
