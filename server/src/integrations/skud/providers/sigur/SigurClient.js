import axios from "axios";
import https from "https";
import { SigurAuth } from "./SigurAuth.js";

const toNumber = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildEmployeeCardBindingPayload = ({
  employeeId,
  cardId,
  format,
  startDate,
  expirationDate,
}) => {
  const binding = {
    employeeId: toNumber(employeeId),
    cardId: toNumber(cardId),
  };

  if (format) {
    binding.format = String(format).trim();
  }
  if (startDate !== undefined) {
    binding.startDate = startDate;
  }
  if (expirationDate !== undefined) {
    binding.expirationDate = expirationDate;
  }

  return [binding];
};

const buildEmployeeAccessPointBindingPayload = ({ employeeId, accessPointIds = [] }) => {
  const normalizedEmployeeId = toNumber(employeeId);
  const normalizedAccessPointIds = accessPointIds
    .map((value) => toNumber(value))
    .filter(Boolean);

  if (!normalizedEmployeeId || !normalizedAccessPointIds.length) {
    return [];
  }

  return [{
    employeeIds: [normalizedEmployeeId],
    accessPointIds: normalizedAccessPointIds,
  }];
};

const getUniqueSortedIds = (values = []) => [...new Set(
  values.map((value) => toNumber(value)).filter(Boolean),
)].sort((left, right) => left - right);

export class SigurClient {
  constructor({
    baseUrl,
    username,
    password,
    timeoutMs = 15000,
    insecureTls = false,
  }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
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

  async getPositions({ limit = 100, offset = 0, filters = {} } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/positions",
      params: {
        limit,
        offset,
        ...filters,
      },
    });
  }

  async createPosition({ name }) {
    return this.request({
      method: "POST",
      url: "/api/v1/positions",
      data: {
        name: String(name || "").trim(),
      },
    });
  }

  async getAccessPoints({ limit = 100, offset = 0, filters = {} } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/accesspoints",
      params: {
        limit,
        offset,
        ...filters,
      },
    });
  }

  async getAccessPointById(accessPointId) {
    const id = toNumber(accessPointId);
    if (!id) {
      throw new Error("accessPointId is required to fetch access point in Sigur");
    }

    return this.request({
      method: "GET",
      url: `/api/v1/accesspoints/${id}`,
    });
  }

  async getAccessPointHierarchy() {
    return this.request({
      method: "GET",
      url: "/api/v1/accesspoints/hierarchy",
    });
  }

  async getCards({ limit = 50, offset = 0, filters = {} } = {}) {
    return this.request({
      method: "GET",
      url: "/api/v1/cards",
      params: {
        limit,
        offset,
        ...filters,
      },
    });
  }

  async getCardById(cardId) {
    const id = toNumber(cardId);
    if (!id) {
      throw new Error("cardId is required to fetch card in Sigur");
    }

    return this.request({
      method: "GET",
      url: `/api/v1/cards/${id}`,
    });
  }

  async getEmployeeCardBindings(externalEmpId, { limit = 100, offset = 0 } = {}) {
    const employeeId = toNumber(externalEmpId);
    if (!employeeId) {
      return [];
    }

    const result = await this.request({
      method: "GET",
      url: "/api/v1/bindings/employees-cards",
      params: {
        employeeId,
        limit,
        offset,
      },
    });

    return Array.isArray(result) ? result : (result?.items || result?.data || []);
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

  async updateDepartment(departmentId, { name, parentId, description } = {}) {
    const id = toNumber(departmentId);
    if (!id) {
      throw new Error("departmentId is required to update department in Sigur");
    }

    const data = {};
    if (name !== undefined) {
      data.name = String(name || "").trim();
    }
    if (parentId !== undefined) {
      data.parentId = parentId;
    }
    if (description !== undefined) {
      data.description = description;
    }

    return this.request({
      method: "PUT",
      url: `/api/v1/departments/${id}`,
      data,
    });
  }

  async deleteDepartment(departmentId) {
    const id = toNumber(departmentId);
    if (!id) {
      throw new Error("departmentId is required to delete department in Sigur");
    }

    return this.request({
      method: "DELETE",
      url: `/api/v1/departments/${id}`,
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

    console.log(`[Sigur][assignCard] empId=${employeeId} payload=${JSON.stringify(cardPayload)}`);

    let card;
    try {
      card = await this.request({
        method: "POST",
        url: "/api/v1/cards",
        data: cardPayload,
      });
      console.log(`[Sigur][assignCard] card created id=${card?.id} value=${card?.value} format=${card?.format}`);
    } catch (createError) {
      // 422 = карта с таким номером уже существует в Sigur — ищем её
      if (createError?.response?.status === 422) {
        console.log(`[Sigur][assignCard] 422 on create, searching by value="${cardPayload.value}" err=${JSON.stringify(createError?.response?.data)}`);
        const cardValue = cardPayload.value || cardPayload.name;
        const existing = await this.request({
          method: "GET",
          url: "/api/v1/cards",
          params: { value: cardValue, limit: 1 },
        });
        const found = Array.isArray(existing) ? existing[0] : null;
        console.log(`[Sigur][assignCard] found existing card=${JSON.stringify(found)}`);
        if (!found?.id) {
          throw new Error(`Card already exists in Sigur but could not be found by value="${cardValue}"`);
        }
        card = found;
      } else {
        throw createError;
      }
    }

    const cardId = toNumber(card?.id);
    if (!cardId) {
      throw new Error("Failed to create card in Sigur");
    }

    const employeeCardBindingPayload = buildEmployeeCardBindingPayload({
      employeeId,
      cardId,
      format: card?.format || cardPayload?.format,
    });

    try {
      await this.request({
        method: "POST",
        url: "/api/v1/bindings/employees-cards",
        data: employeeCardBindingPayload,
      });
    } catch (bindError) {
      if (bindError?.response?.status === 400 || bindError?.response?.status === 422) {
        console.log(`[Sigur][assignCard] ${bindError.response.status} on bind. err=${JSON.stringify(bindError?.response?.data)}`);
        // Проверяем — может карта уже привязана к этому сотруднику (тогда это успех)
        const empCards = await this.request({
          method: "GET",
          url: "/api/v1/cards",
          params: { employeeId, limit: 200 },
        }).catch(() => null);
        const alreadyBound = Array.isArray(empCards)
          ? empCards.some((c) => toNumber(c?.id) === cardId)
          : false;
        if (alreadyBound) {
          console.log(`[Sigur][assignCard] card ${cardId} already bound to emp ${employeeId}, treating as success`);
        } else {
          // Карта привязана к другому сотруднику — ищем биндинг по cardId через карточку
          const cardInfo = await this.request({
            method: "GET",
            url: `/api/v1/cards/${cardId}`,
          }).catch(() => null);
          console.log(`[Sigur][assignCard] cardInfo=${JSON.stringify(cardInfo)}`);
          // Пробуем переназначить через DELETE старого биндинга
          const employeeCards = await this.request({
            method: "GET",
            url: "/api/v1/bindings/employees-cards",
            params: { cardId, limit: 1 },
          }).catch(() => null);
          const oldBinding = Array.isArray(employeeCards) ? employeeCards[0] : null;
          const deletePayload = oldBinding
            ? buildEmployeeCardBindingPayload({
              employeeId: oldBinding.employeeId,
              cardId: oldBinding.cardId,
              format: oldBinding.format || card?.format || cardPayload?.format,
              startDate: oldBinding.startDate,
              expirationDate: oldBinding.expirationDate,
            })
            : [];
          if (deletePayload.length > 0) {
            console.log(`[Sigur][assignCard] deleting old binding payload=${JSON.stringify(deletePayload)}`);
            await this.request({
              method: "POST",
              url: "/api/v1/bindings/employees-cards/delete",
              data: deletePayload,
            }).catch(() => {});
            await this.request({
              method: "POST",
              url: "/api/v1/bindings/employees-cards",
              data: employeeCardBindingPayload,
            });
          } else {
            throw bindError;
          }
        }
      } else {
        throw bindError;
      }
    }

    return card;
  }

  async getEmployeeAccessPointBindings(externalEmpId) {
    const id = toNumber(externalEmpId);
    if (!id) return [];
    const result = await this.request({
      method: "GET",
      url: "/api/v1/bindings/employees-accesspoints",
      params: { employeeId: id, limit: 500 },
      timeout: Math.max(this.timeoutMs, 60000),
    });
    return Array.isArray(result) ? result : (result?.items || result?.data || []);
  }

  async clearEmployeeAccessPoints(externalEmpId) {
    const id = toNumber(externalEmpId);
    if (!id) return;
    const bindings = await this.getEmployeeAccessPointBindings(id);
    const accessPointIds = getUniqueSortedIds(
      bindings.map((binding) => binding?.accessPointId),
    );
    if (!accessPointIds.length) {
      return [];
    }
    await this.deleteEmployeeAccessPoints(id, accessPointIds);
    return accessPointIds;
  }

  async deleteEmployeeAccessPoints(externalEmpId, accessPointIds = []) {
    const id = toNumber(externalEmpId);
    const normalizedAccessPointIds = getUniqueSortedIds(accessPointIds);
    const deletePayload = buildEmployeeAccessPointBindingPayload({
      employeeId: id,
      accessPointIds: normalizedAccessPointIds,
    });
    if (!deletePayload.length) {
      return [];
    }

    await this.request({
      method: "POST",
      url: "/api/v1/bindings/employees-accesspoints/delete",
      data: deletePayload,
      timeout: Math.max(this.timeoutMs, 60000),
    });
    return normalizedAccessPointIds;
  }

  async assignAccessPointsToEmployee(externalEmpId, accessPointIds = []) {
    const id = toNumber(externalEmpId);
    if (!id) {
      throw new Error("externalEmpId is required to assign access points in Sigur");
    }

    const desiredAccessPointIds = getUniqueSortedIds(accessPointIds);
    const currentBindings = await this.getEmployeeAccessPointBindings(id);
    const currentAccessPointIds = getUniqueSortedIds(
      currentBindings.map((binding) => binding?.accessPointId),
    );

    const accessPointIdsToDelete = currentAccessPointIds.filter(
      (accessPointId) => !desiredAccessPointIds.includes(accessPointId),
    );
    const accessPointIdsToAssign = desiredAccessPointIds.filter(
      (accessPointId) => !currentAccessPointIds.includes(accessPointId),
    );

    if (accessPointIdsToDelete.length) {
      await this.deleteEmployeeAccessPoints(id, accessPointIdsToDelete);
    }

    if (!accessPointIdsToAssign.length) {
      return desiredAccessPointIds.map((accessPointId) => ({
        employeeId: id,
        accessPointId,
      }));
    }

    const bindingPayload = buildEmployeeAccessPointBindingPayload({
      employeeId: id,
      accessPointIds: accessPointIdsToAssign,
    });
    const result = await this.request({
      method: "POST",
      url: "/api/v1/bindings/employees-accesspoints",
      data: bindingPayload,
      timeout: Math.max(this.timeoutMs, 60000),
    });
    return Array.isArray(result) ? result : [];
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
      data: buildEmployeeCardBindingPayload({
        employeeId,
        cardId,
        format: card?.format,
      }),
    });
  }

  async unassignCardByExternalCardId(externalEmpId, externalCardId) {
    const employeeId = toNumber(externalEmpId);
    const cardId = toNumber(externalCardId);
    if (!employeeId) {
      throw new Error("externalEmpId is required to unassign card in Sigur");
    }
    if (!cardId) {
      throw new Error("externalCardId is required to unassign card in Sigur");
    }

    const card = await this.getCardById(cardId);

    return this.request({
      method: "POST",
      url: "/api/v1/bindings/employees-cards/delete",
      data: buildEmployeeCardBindingPayload({
        employeeId,
        cardId,
        format: card?.format,
      }),
    });
  }
}
