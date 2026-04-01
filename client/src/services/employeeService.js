import api from "./api";
import { deduplicateRequest } from "../utils/requestCache";

export const employeeService = {
  // Получить всех сотрудников
  getAll: async (params = {}) => {
    const key = `employees:getAll:${JSON.stringify(params)}`;
    return deduplicateRequest(key, async () => {
      const response = await api.get("/employees", { params });
      return response.data;
    });
  },

  // Получить сотрудника по ID
  getById: async (id) => {
    const key = `employees:getById:${id}`;
    return deduplicateRequest(key, async () => {
      const response = await api.get(`/employees/${id}`);
      return response.data;
    });
  },

  // Создать сотрудника
  create: async (employeeData) => {
    // Удаляем старые поля статусов, если они переданы
    const {
      status: _status,
      statusCard: _statusCard,
      statusActive: _statusActive,
      statusSecure: _statusSecure,
      ...cleanData
    } = employeeData;
    const response = await api.post("/employees", cleanData);
    return response.data;
  },

  // Обновить сотрудника
  update: async (id, employeeData) => {
    // Удаляем старые поля статусов, если они переданы
    const {
      status: _status,
      statusCard: _statusCard,
      statusActive: _statusActive,
      statusSecure: _statusSecure,
      ...cleanData
    } = employeeData;
    const response = await api.put(`/employees/${id}`, cleanData);
    return response.data;
  },

  // Удалить сотрудника
  delete: async (id) => {
    const response = await api.delete(`/employees/${id}`);
    return response.data;
  },

  // Пометить сотрудника на удаление
  markForDeletion: async (id) => {
    const response = await api.post(`/employees/${id}/mark-for-deletion`);
    return response.data;
  },

  // Отменить пометку на удаление
  unmarkForDeletion: async (id) => {
    const response = await api.post(`/employees/${id}/unmark-for-deletion`);
    return response.data;
  },

  // Получить сотрудников, помеченных на удаление
  getMarkedForDeletion: async (params = {}) => {
    const response = await api.get(`/employees/marked-for-deletion`, {
      params,
    });
    return response.data;
  },

  // Получить удаленных сотрудников
  getDeleted: async (params = {}) => {
    const response = await api.get(`/employees/deleted`, { params });
    return response.data;
  },

  // Восстановить сотрудника
  restore: async (id) => {
    const response = await api.post(`/employees/${id}/restore`);
    return response.data;
  },

  // Полностью удалить сотрудника из корзины
  permanentlyDelete: async (id) => {
    const response = await api.delete(`/employees/${id}/permanent`);
    return response.data;
  },

  // Поиск сотрудников
  search: async (query) => {
    const response = await api.get("/employees/search", { params: { query } });
    return response.data;
  },

  // Загрузить файлы для сотрудника
  uploadFiles: async (employeeId, formData) => {
    const response = await api.post(
      `/employees/${employeeId}/files`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  // Получить файлы сотрудника
  getFiles: async (employeeId, { force = false } = {}) => {
    if (force) {
      const response = await api.get(`/employees/${employeeId}/files`);
      return response.data;
    }

    const key = `employees:getFiles:${employeeId}`;
    return deduplicateRequest(key, async () => {
      const response = await api.get(`/employees/${employeeId}/files`);
      return response.data;
    });
  },

  // Получить типы документов сотрудника (с образцами)
  getDocumentTypes: async () => {
    const key = "employees:getDocumentTypes";
    return deduplicateRequest(key, async () => {
      const response = await api.get("/employees/document-types");
      return response.data;
    });
  },

  // Таблица документов контрагента
  getDocumentsTable: async (params = {}) => {
    const response = await api.get("/employees/documents/table", { params });
    return response.data;
  },

  // Скачать ZIP всех документов (по текущим фильтрам)
  downloadDocumentsZip: async (params = {}) => {
    const response = await api.get("/employees/documents/export/zip", {
      params,
      responseType: "blob",
    });
    return response;
  },

  // Экспорт метаданных документов в Excel (по текущим фильтрам)
  exportDocumentsExcel: async (params = {}) => {
    const response = await api.get("/employees/documents/export/excel", {
      params,
      responseType: "blob",
    });
    return response;
  },

  // Получить типы документов сотрудника для админки
  getDocumentTypesForAdmin: async () => {
    const response = await api.get("/employees/document-types/admin");
    return response.data;
  },

  // Обновить метаданные типа документа (админ)
  updateDocumentType: async (id, payload) => {
    const response = await api.put(`/employees/document-types/${id}`, payload);
    return response.data;
  },

  // Загрузить образец документа для типа (админ)
  uploadDocumentTypeSample: async (id, file) => {
    const formData = new FormData();
    formData.append("sample", file);
    const response = await api.post(
      `/employees/document-types/${id}/sample`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    return response.data;
  },

  // Удалить образец документа (админ)
  deleteDocumentTypeSample: async (id) => {
    const response = await api.delete(`/employees/document-types/${id}/sample`);
    return response.data;
  },

  // Удалить файл сотрудника
  deleteFile: async (employeeId, fileId) => {
    const response = await api.delete(
      `/employees/${employeeId}/files/${fileId}`,
    );
    return response.data;
  },

  // Получить ссылку для скачивания файла
  getFileDownloadLink: async (employeeId, fileId) => {
    const response = await api.get(
      `/employees/${employeeId}/files/${fileId}/download`,
    );
    return response.data;
  },

  // Получить ссылку для просмотра файла
  getFileViewLink: async (employeeId, fileId) => {
    const response = await api.get(
      `/employees/${employeeId}/files/${fileId}/view`,
    );
    return response.data;
  },

  // Обновить объекты строительства для сотрудника
  updateConstructionSites: async (employeeId, siteIds) => {
    const response = await api.put(
      `/employees/${employeeId}/construction-sites`,
      { siteIds },
    );
    return response.data;
  },

  // Обновить подразделение сотрудника
  updateDepartment: async (employeeId, departmentId) => {
    const response = await api.put(`/employees/${employeeId}/department`, {
      departmentId,
    });
    return response.data;
  },

  // Перевести сотрудника в другую компанию (admin/manager в рамках прав)
  transferToCounterparty: async (employeeId, counterpartyId) => {
    const response = await api.post(`/employees/${employeeId}/transfer`, {
      counterpartyId,
    });
    return response.data;
  },
};
