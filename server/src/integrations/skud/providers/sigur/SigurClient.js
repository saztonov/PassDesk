import axios from "axios";
import https from "https";
import { SigurAuth } from "./SigurAuth.js";

const toNumber = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export class SigurClient {
  constructor({
    baseUrl,
    username,
    password,
    timeoutMs = 15000,
    insecureTls = false,
  }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.httpsAgent = insecureTls
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    this.auth = new SigurAuth({
      baseUrl: this.baseUrl,
      username,
      password,
      timeoutMs,
      insecureTls,
    });
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: this.httpsAgent,
    });
  }

  async request(config, retry = true) {
    const headers = await this.auth.getAuthHeaders(false);
    try {
      const response = await this.http.request({
        ...config,
        headers: {
          ...headers,
          ...(config.headers || {}),
        },
      });
      return response?.data;
    } catch (error) {
      const status = error?.response?.status;
      if (retry && status === 401) {
        const refreshedHeaders = await this.auth.getAuthHeaders(true);
        const response = await this.http.request({
          ...config,
          headers: {
            ...refreshedHeaders,
            ...(config.headers || {}),
          },
        });
        return response?.data;
      }
      throw error;
    }
  }

  async authenticate() {
    await this.auth.authenticate(false);
    return {
      authenticated: true,
      expiresAt: this.auth.expiresAt,
    };
  }

  async getEmployees({ limit = 50, offset = 0, filters = {} } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/employees",
      params: {
        limit,
        offset,
        ...filters,
      },
    });
  }

  async getEmployeeById(externalEmpId) {
    const id = toNumber(externalEmpId);
    if (!id) {
      throw new Error("externalEmpId is required to fetch employee in Sigur");
    }

    return this.request({
      method: "GET",
      url: `/api/v1/employees/${id}`,
    });
  }

  async getDepartments({ limit = 100, offset = 0, filters = {} } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/departments",
      params: {
        limit,
        offset,
        ...filters,
      },
    });
  }

  async createDepartment({ name, parentId = 0, description = "" }) {
    return this.request({
      method: "POST",
      url: "/api/v1/departments",
      data: {
        name: String(name || "").trim(),
        parentId,
        description,
      },
    });
  }

  async getEvents({
    from,
    to,
    startTime,
    endTime,
    eventType,
    accessPointId,
    accessObjectId,
    cardKey,
    lastId,
    lastLogId,
    limit = 100,
    offset = 0,
  } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/events/parsed",
      params: {
        startTime: startTime || from,
        endTime: endTime || to,
        eventType,
        accessPointId,
        accessObjectId,
        cardKey,
        lastId,
        lastLogId,
        limit,
        offset,
      },
    });
  }

  async getRawEvents({
    from,
    to,
    startTime,
    endTime,
    eventType,
    accessPointId,
    accessObjectId,
    cardKey,
    lastId,
    limit = 100,
    offset = 0,
    sortBy = "timestamp",
    sortOrder = "DESC",
    includeFields,
    excludeFields,
  } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/events",
      params: {
        startTime: startTime || from,
        endTime: endTime || to,
        eventType,
        accessPointId,
        accessObjectId,
        cardKey,
        lastId,
        limit,
        offset,
        sortBy,
        sortOrder,
        includeFields,
        excludeFields,
      },
    });
  }

  async createOrUpdateEmployee({ externalEmpId = null, employeePayload }) {
    const id = toNumber(externalEmpId);
    if (id) {
      return this.request({
        method: "PUT",
        url: `/api/v1/employees/${id}`,
        data: employeePayload,
      });
    }

    return this.request({
      method: "POST",
      url: "/api/v1/employees",
      data: employeePayload,
    });
  }

  async blockEmployee(externalEmpId) {
    const id = toNumber(externalEmpId);
    if (!id) {
      throw new Error("externalEmpId is required to block employee in Sigur");
    }

    return this.request({
      method: "PUT",
      url: `/api/v1/employees/${id}/block`,
      data: {},
    });
  }

  async unblockEmployee(externalEmpId) {
    const id = toNumber(externalEmpId);
    if (!id) {
      throw new Error("externalEmpId is required to unblock employee in Sigur");
    }

    return this.request({
      method: "PUT",
      url: `/api/v1/employees/${id}/unblock`,
      data: {},
    });
  }

  async assignCard(externalEmpId, cardPayload = {}) {
    const employeeId = toNumber(externalEmpId);
    if (!employeeId) {
      throw new Error("externalEmpId is required to assign card in Sigur");
    }

    const card = await this.request({
      method: "POST",
      url: "/api/v1/cards",
      data: cardPayload,
    });

    const cardId = toNumber(card?.id);
    if (!cardId) {
      throw new Error("Failed to create card in Sigur");
    }

    await this.request({
      method: "POST",
      url: "/api/v1/bindings/employees-cards",
      data: {
        employeeId,
        cardId,
      },
    });

    return card;
  }

  async unassignCard(externalEmpId, cardNumber) {
    const employeeId = toNumber(externalEmpId);
    if (!employeeId) {
      throw new Error("externalEmpId is required to unassign card in Sigur");
    }

    const cards = await this.request({
      method: "GET",
      url: "/api/v1/cards",
      params: {
        value: cardNumber,
        limit: 1,
      },
    });

    const card = Array.isArray(cards) ? cards[0] : null;
    const cardId = toNumber(card?.id);
    if (!cardId) {
      return null;
    }

    return this.request({
      method: "POST",
      url: "/api/v1/bindings/employees-cards/delete",
      data: {
        employeeId,
        cardId,
      },
    });
  }
}
