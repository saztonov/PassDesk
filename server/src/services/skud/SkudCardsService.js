import {
  Employee,
  SkudAccessState,
  SkudCard,
  SkudPersonBinding,
  SkudSyncJob,
} from "../../models/index.js";
import { mapCardToSigur } from "../../integrations/skud/providers/sigur/SigurMapper.js";
import { getSkudProvider } from "../../integrations/skud/SkudProviderRegistry.js";
import { enqueueSkudCardsJob } from "../../queues/skud/queue.js";
import { ensureEmployeeBindingInSkud, syncEmployeeAccessPoints } from "./SkudSyncService.js";

const normalizeCardNumber = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const formatSigurDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const normalizeComparableText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");

const getProviderItems = (response) =>
  Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : [];

const mergeEmployeeCards = ({ localRows = [], liveRows = [], limit = 50 }) => {
  const localByExternalCardId = new Set(
    localRows
      .map((row) => String(row?.externalCardId || "").trim())
      .filter(Boolean),
  );
  const localByCardNumber = new Set(
    localRows
      .map((row) => normalizeCardNumber(row?.cardNumber))
      .filter(Boolean),
  );

  const merged = [...localRows];
  for (const liveRow of liveRows) {
    const externalCardId = String(liveRow?.externalCardId || "").trim();
    const normalizedCardNumber = normalizeCardNumber(liveRow?.cardNumber);
    if (
      (externalCardId && localByExternalCardId.has(externalCardId))
      || (normalizedCardNumber && localByCardNumber.has(normalizedCardNumber))
    ) {
      continue;
    }
    merged.push(liveRow);
  }

  return merged
    .sort((left, right) => {
      const leftTime = new Date(left?.updatedAt || left?.createdAt || left?.issuedAt || 0).getTime() || 0;
      const rightTime = new Date(right?.updatedAt || right?.createdAt || right?.issuedAt || 0).getTime() || 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
};

const buildEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

const ensureEmployeeExists = async (employeeId) => {
  const employee = await Employee.findByPk(employeeId);
  if (!employee || employee.isDeleted) {
    throw new Error("Employee not found");
  }
  return employee;
};

const getEmployeeBinding = async (employeeId) => {
  return SkudPersonBinding.findOne({
    where: {
      employeeId,
      externalSystem: "sigur",
      isActive: true,
    },
  });
};

async function syncResolvedBinding({ employeeId, externalEmpId, userId = null }) {
  const normalizedExternalEmpId = String(externalEmpId || "").trim();
  if (!employeeId || !normalizedExternalEmpId) {
    return null;
  }

  const existing = await SkudPersonBinding.findOne({
    where: {
      employeeId,
      externalSystem: "sigur",
    },
  });

  if (existing) {
    return existing.update({
      externalEmpId: normalizedExternalEmpId,
      isActive: true,
      updatedBy: userId,
      updatedAt: new Date(),
    });
  }

  return SkudPersonBinding.create({
    employeeId,
    externalSystem: "sigur",
    externalEmpId: normalizedExternalEmpId,
    source: "live_resolve",
    isActive: true,
    metadata: {},
    createdBy: userId,
    updatedBy: userId,
  });
}

const resolveLiveExternalEmployeeId = async (employeeId) => {
  const binding = await getEmployeeBinding(employeeId);
  const boundExternalEmpId = String(binding?.externalEmpId || "").trim();
  if (boundExternalEmpId && boundExternalEmpId !== "pending") {
    return boundExternalEmpId;
  }

  const employee = await Employee.findByPk(employeeId, {
    attributes: [
      "id",
      "firstName",
      "lastName",
      "lastNameEnc",
      "lastNameKeyVersion",
      "middleName",
      "inn",
    ],
  });
  if (!employee || employee.isDeleted) {
    return null;
  }

  const provider = getSkudProvider();
  const normalizedInn = String(employee.inn || "").replace(/\D/g, "");
  if (normalizedInn) {
    const byTabId = getProviderItems(await provider.getEmployees({
      limit: 10,
      offset: 0,
      filters: { tabId: normalizedInn },
    }));

    const exactTabMatch = byTabId.find(
      (item) => String(item?.tabId || "").replace(/\D/g, "") === normalizedInn,
    );
    if (exactTabMatch?.id !== undefined && exactTabMatch?.id !== null) {
      await syncResolvedBinding({
        employeeId,
        externalEmpId: exactTabMatch.id,
      });
      return String(exactTabMatch.id);
    }
  }

  const fullName = buildEmployeeFullName(employee);
  if (!fullName) {
    return null;
  }

  const normalizedFullName = normalizeComparableText(fullName);
  const byName = getProviderItems(await provider.getEmployees({
    limit: 10,
    offset: 0,
    filters: { name: fullName },
  }));

  const exactNameMatches = byName.filter(
    (item) => normalizeComparableText(item?.name) === normalizedFullName,
  );

  if (exactNameMatches.length === 1 && exactNameMatches[0]?.id !== undefined && exactNameMatches[0]?.id !== null) {
    await syncResolvedBinding({
      employeeId,
      externalEmpId: exactNameMatches[0].id,
    });
    return String(exactNameMatches[0].id);
  }

  return null;
};

const loadLiveProviderCards = async ({ employeeId, externalEmpId, limit = 50, status = null }) => {
  if (!externalEmpId) {
    return [];
  }

  const provider = getSkudProvider();
  const bindings = await provider.getEmployeeCardBindings(externalEmpId, { limit, offset: 0 });
  const liveRows = await Promise.all(
    bindings.map(async (binding) => {
      const card = await provider.getCardById(binding.cardId);
      const rawCardNumber = String(
        card?.formattedValue
        || card?.name
        || card?.value
        || "",
      ).trim();

      return {
        id: `sigur-live:${binding?.cardId}`,
        employeeId,
        externalSystem: "sigur",
        externalCardId: binding?.cardId ? String(binding.cardId) : null,
        cardNumber: rawCardNumber || "—",
        cardNumberNormalized: normalizeCardNumber(rawCardNumber),
        cardType: "rfid",
        status: card?.holder?.holderId ? "active" : "unbound",
        issuedAt: binding?.startDate || null,
        blockedAt: null,
        lastSeenAt: null,
        notes: "",
        metadata: {
          providerLive: true,
          providerCard: card,
          providerBinding: binding,
        },
        createdAt: null,
        updatedAt: null,
        isProviderLive: true,
        canManage: false,
      };
    }),
  );

  return liveRows.filter((card) => (
    !status || status === "all" || card.status === status
  ));
};

const createCardsJob = async ({ employeeId, operation, payload, userId }) => {
  const record = await SkudSyncJob.create({
    externalSystem: "sigur",
    employeeId,
    operation,
    status: "pending",
    payload,
    createdBy: userId,
  });

  await enqueueSkudCardsJob(record.id, 5);
  return record;
};

export const assignSkudCard = async ({ employeeId, cardNumber, cardType = "rfid", notes = "", userId = null }) => {
  console.log(`[SkudCards][assignCard] employeeId=${employeeId} cardNumber=${cardNumber}`);
  await ensureEmployeeExists(employeeId);

  const normalized = normalizeCardNumber(cardNumber);
  if (!normalized) {
    throw new Error("cardNumber is required");
  }

  const [card] = await SkudCard.findOrCreate({
    where: {
      externalSystem: "sigur",
      cardNumberNormalized: normalized,
    },
    defaults: {
      employeeId,
      externalSystem: "sigur",
      cardNumber: cardNumber,
      cardNumberNormalized: normalized,
      cardType,
      status: "active",
      notes,
      createdBy: userId,
      updatedBy: userId,
      metadata: {},
    },
  });

  await card.update({
    employeeId,
    cardType,
    cardNumber,
    cardNumberNormalized: normalized,
    notes,
    status: "active",
    updatedBy: userId,
    updatedAt: new Date(),
  });

  const syncJob = await createCardsJob({
    employeeId,
    operation: "assign_card",
    userId,
    payload: {
      cardId: card.id,
      cardNumber,
      cardNumberNormalized: normalized,
      cardType,
      notes,
    },
  });

  console.log(`[SkudCards][assignCard] card saved id=${card.id} syncJob=${syncJob.id} status=pending`);
  return { card, syncJob };
};

export const blockSkudCard = async ({ cardId, userId = null }) => {
  const card = await SkudCard.findByPk(cardId);
  if (!card) {
    throw new Error("Card not found");
  }

  await card.update({
    status: "blocked",
    blockedAt: new Date(),
    updatedBy: userId,
    updatedAt: new Date(),
  });

  const syncJob = await createCardsJob({
    employeeId: card.employeeId,
    operation: "block_card",
    userId,
    payload: {
      cardId: card.id,
      cardNumber: card.cardNumber,
      cardNumberNormalized: card.cardNumberNormalized,
    },
  });

  return { card, syncJob };
};

export const unbindSkudCard = async ({ cardId, userId = null }) => {
  const card = await SkudCard.findByPk(cardId);
  if (!card) {
    throw new Error("Card not found");
  }

  const originalEmployeeId = card.employeeId;

  await card.update({
    status: "unbound",
    updatedBy: userId,
    updatedAt: new Date(),
  });

  const syncJob = await createCardsJob({
    employeeId: originalEmployeeId,
    operation: "unbind_card",
    userId,
    payload: {
      cardId: card.id,
      cardNumber: card.cardNumber,
      cardNumberNormalized: card.cardNumberNormalized,
    },
  });

  return { card, syncJob };
};

export const listSkudCards = async ({ employeeId = null, status = null, limit = 50, offset = 0 }) => {
  const where = {
    externalSystem: "sigur",
  };

  if (employeeId) {
    where.employeeId = employeeId;
  }
  if (status && status !== "all") {
    where.status = status;
  }

  const localResult = await SkudCard.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });

  if (!employeeId || offset > 0) {
    return localResult;
  }

  try {
    const externalEmpId = await resolveLiveExternalEmployeeId(employeeId);
    if (!externalEmpId) {
      return localResult;
    }

    const rows = await loadLiveProviderCards({
      employeeId,
      externalEmpId,
      limit,
      status,
    });

    return {
      count: mergeEmployeeCards({
        localRows: localResult.rows,
        liveRows: rows,
        limit,
      }).length,
      rows: mergeEmployeeCards({
        localRows: localResult.rows,
        liveRows: rows,
        limit,
      }),
    };
  } catch (error) {
    console.error(`[SkudCards][list] live fallback failed for employeeId=${employeeId}:`, error?.message || error);
    return localResult;
  }
};

export const processSkudCardJobById = async (syncJobId) => {
  const syncJob = await SkudSyncJob.findByPk(syncJobId);
  if (!syncJob) return null;

  const tag = `[SkudCards][job=${syncJobId}][op=${syncJob.operation}][emp=${syncJob.employeeId}]`;
  console.log(`${tag} START attempt=${(syncJob.attempts || 0) + 1}`);

  await syncJob.update({
    status: "processing",
    attempts: (syncJob.attempts || 0) + 1,
    updatedAt: new Date(),
  });

  try {
    const payload = syncJob.payload || {};
    const card = payload.cardId ? await SkudCard.findByPk(payload.cardId) : null;
    const provider = getSkudProvider();

    console.log(`${tag} payload.cardId=${payload.cardId} card.employeeId=${card?.employeeId} syncJob.employeeId=${syncJob.employeeId}`);

    if (syncJob.operation === "assign_card") {
      const effectiveEmployeeId = card?.employeeId || syncJob.employeeId;
      if (!effectiveEmployeeId) {
        throw new Error("Card or employee binding is missing");
      }
      // Если карта существовала раньше и employeeId не успел обновиться — патчим
      if (card && !card.employeeId) {
        await card.update({ employeeId: effectiveEmployeeId, updatedAt: new Date() });
      }
      console.log(`${tag} card=${card?.id} cardNumber=${card?.cardNumber} effectiveEmployeeId=${effectiveEmployeeId} → ensureEmployeeBindingInSkud`);
      const externalEmpId = await ensureEmployeeBindingInSkud({
        employeeId: effectiveEmployeeId,
        userId: syncJob.createdBy,
        payload: {
          source: "assign_card",
        },
        forceSync: true,
      });
      const binding = await getEmployeeBinding(effectiveEmployeeId);
      const bindingExpirationDate = formatSigurDateTime(
        binding?.metadata?.cardExpirationDate || null,
      );
      const bindingStartDate = bindingExpirationDate
        ? formatSigurDateTime(new Date(new Date().setHours(0, 0, 0, 0)))
        : null;

      console.log(`${tag} → assignCard in Sigur cardNumber=${card.cardNumber}`);
      const response = await provider.assignCard(
        externalEmpId,
        {
          ...mapCardToSigur({
          cardNumber: card.cardNumber,
          cardType: card.cardType,
          }),
          bindingStartDate,
          bindingExpirationDate,
        },
      );
      console.log(`${tag} assignCard OK externalCardId=${response?.id}`);

      await card.update({
        externalCardId: response?.id ? String(response.id) : card.externalCardId,
        status: "active",
        issuedAt: bindingStartDate ? new Date(bindingStartDate.replace(" ", "T")) : card.issuedAt,
        metadata: {
          ...(card.metadata || {}),
          lastProviderResponse: response,
          bindingStartDate,
          bindingExpirationDate,
        },
        updatedAt: new Date(),
      });

      // Назначаем точки доступа сотруднику на основе его объектов
      console.log(`${tag} → syncEmployeeAccessPoints`);
      try {
        const apResult = await syncEmployeeAccessPoints({
          employeeId: effectiveEmployeeId,
          externalEmpId,
        });
        console.log(`${tag} syncEmployeeAccessPoints OK count=${Array.isArray(apResult) ? apResult.length : "?"}`);
      } catch (apError) {
        console.error(`${tag} Failed to sync access points:`, apError?.message);
        // Не фейлим выдачу карты из-за ошибки назначения точек доступа
      }

      await syncJob.update({
        status: "success",
        responsePayload: response,
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`${tag} DONE success`);
      return syncJob;
    }

    if (syncJob.operation === "unbind_card") {
      console.log(`${tag} unbind cardNumber=${payload.cardNumber}`);
      if (payload.cardNumber && syncJob.employeeId) {
        const binding = await getEmployeeBinding(syncJob.employeeId);
        if (binding?.externalEmpId) {
          await provider.unassignCard(binding.externalEmpId, payload.cardNumber);
          console.log(`${tag} unassignCard OK externalEmpId=${binding.externalEmpId}`);
          await provider.clearEmployeeAccessPoints(binding.externalEmpId);
          console.log(`${tag} clearEmployeeAccessPoints OK externalEmpId=${binding.externalEmpId}`);
        } else {
          console.log(`${tag} no active Sigur binding, skip unassign`);
        }
      }

      await syncJob.update({
        status: "success",
        responsePayload: { ok: true },
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`${tag} DONE success`);
      return syncJob;
    }

    if (syncJob.operation === "block_card") {
      console.log(`${tag} block cardNumber=${payload.cardNumber}`);
      if (payload.cardNumber && syncJob.employeeId) {
        const binding = await getEmployeeBinding(syncJob.employeeId);
        if (binding?.externalEmpId) {
          await provider.unassignCard(binding.externalEmpId, payload.cardNumber);
          console.log(`${tag} unassignCard(block) OK externalEmpId=${binding.externalEmpId}`);
        } else {
          console.log(`${tag} no active Sigur binding, skip block`);
        }
      }

      await syncJob.update({
        status: "success",
        responsePayload: { ok: true },
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`${tag} DONE success`);
      return syncJob;
    }

    throw new Error(`Unsupported cards operation: ${syncJob.operation}`);
  } catch (error) {
    console.error(`${tag} FAILED:`, error?.message);
    await syncJob.update({
      status: "failed",
      errorMessage: String(error?.message || error),
      processedAt: new Date(),
      updatedAt: new Date(),
    });
    throw error;
  }
};

export const unbindLiveSkudCard = async ({ employeeId, externalCardId, userId = null }) => {
  if (!employeeId || !externalCardId) {
    throw new Error("employeeId and externalCardId are required");
  }

  const externalEmpId = await resolveLiveExternalEmployeeId(employeeId);
  if (!externalEmpId) {
    throw new Error("Unable to resolve externalEmpId for live unbind");
  }

  const provider = getSkudProvider();
  await provider.unassignCardByExternalCardId(externalEmpId, externalCardId);
  await provider.clearEmployeeAccessPoints(externalEmpId);
  await syncResolvedBinding({ employeeId, externalEmpId, userId });

  await SkudCard.update(
    {
      employeeId: null,
      status: "unbound",
      updatedBy: userId,
      updatedAt: new Date(),
    },
    {
      where: {
        externalSystem: "sigur",
        externalCardId: String(externalCardId),
      },
    },
  );

  return { ok: true, externalEmpId: String(externalEmpId), externalCardId: String(externalCardId) };
};

async function upsertSkudAccessState({ employeeId, status, source, changedBy = null }) {
  const existing = await SkudAccessState.findOne({ where: { employeeId, externalSystem: "sigur" } });
  if (existing) {
    return existing.update({ status, source, changedBy, updatedAt: new Date() });
  }
  return SkudAccessState.create({ employeeId, externalSystem: "sigur", status, source, changedBy });
}

export const blockLiveSkudEmployee = async ({ employeeId, userId = null }) => {
  if (!employeeId) {
    throw new Error("employeeId is required");
  }

  const externalEmpId = await resolveLiveExternalEmployeeId(employeeId);
  if (!externalEmpId) {
    throw new Error("Unable to resolve externalEmpId for live block");
  }

  const provider = getSkudProvider();
  const response = await provider.blockEmployee(externalEmpId);
  await syncResolvedBinding({ employeeId, externalEmpId, userId });
  await upsertSkudAccessState({ employeeId, status: "blocked", source: "live_block", changedBy: userId });

  return {
    ok: true,
    externalEmpId: String(externalEmpId),
    response,
  };
};

export const unblockLiveSkudEmployee = async ({ employeeId, userId = null }) => {
  if (!employeeId) {
    throw new Error("employeeId is required");
  }

  const externalEmpId = await resolveLiveExternalEmployeeId(employeeId);
  if (!externalEmpId) {
    throw new Error("Unable to resolve externalEmpId for live unblock");
  }

  const provider = getSkudProvider();
  const response = await provider.unblockEmployee(externalEmpId);
  await syncResolvedBinding({ employeeId, externalEmpId, userId });
  await upsertSkudAccessState({ employeeId, status: "allowed", source: "live_unblock", changedBy: userId });

  return {
    ok: true,
    externalEmpId: String(externalEmpId),
    response,
  };
};

export const deleteEmployeeFromSkud = async ({ employeeId }) => {
  if (!employeeId) return { ok: false, reason: "no_employee_id" };

  const binding = await SkudPersonBinding.findOne({
    where: { employeeId, externalSystem: "sigur" },
  });

  const externalEmpId = String(binding?.externalEmpId || "").trim();
  if (!externalEmpId || externalEmpId === "pending") {
    return { ok: false, reason: "no_binding" };
  }

  const provider = getSkudProvider();
  try {
    await provider.deleteEmployee(externalEmpId);
  } catch (err) {
    // 404/422 = уже удалён из Sigur
    if (![404, 422].includes(err?.response?.status)) {
      throw err;
    }
  }

  return { ok: true, externalEmpId };
};
