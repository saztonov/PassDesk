import {
  Employee,
  SkudCard,
  SkudPersonBinding,
  SkudSyncJob,
} from "../../models/index.js";
import { mapCardToSigur, mapEmployeeToSigur } from "../../integrations/skud/providers/sigur/SigurMapper.js";
import { getSkudProvider } from "../../integrations/skud/SkudProviderRegistry.js";
import { enqueueSkudCardsJob } from "../../queues/skud/queue.js";
import { ensureEmployeeBindingInSkud, syncEmployeeAccessPoints } from "./SkudSyncService.js";

const normalizeCardNumber = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

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

  await card.update({
    status: "unbound",
    employeeId: null,
    updatedBy: userId,
    updatedAt: new Date(),
  });

  const syncJob = await createCardsJob({
    employeeId: card.employeeId,
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

  return SkudCard.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });
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
      });
      console.log(`${tag} externalEmpId=${externalEmpId} → reset accessEndTime`);

      // Сбрасываем accessEndTime чтобы снять возможное ограничение периода
      // (блокировка в Sigur ставит accessEndTime = сегодня 00:00)
      try {
        const employee = await Employee.findByPk(effectiveEmployeeId);
        if (employee) {
          await provider.createOrUpdateEmployee({
            externalEmpId,
            employeePayload: mapEmployeeToSigur({
              employee,
              externalEmpId,
              accessEndTime: null,
            }),
          });
          console.log(`${tag} accessEndTime reset OK`);
        }
      } catch (periodError) {
        console.error(`${tag} Failed to reset accessEndTime:`, periodError?.message);
      }

      console.log(`${tag} → assignCard in Sigur cardNumber=${card.cardNumber}`);
      const response = await provider.assignCard(
        externalEmpId,
        mapCardToSigur({
          cardNumber: card.cardNumber,
          cardType: card.cardType,
        }),
      );
      console.log(`${tag} assignCard OK externalCardId=${response?.id}`);

      await card.update({
        externalCardId: response?.id ? String(response.id) : card.externalCardId,
        status: "active",
        metadata: {
          ...(card.metadata || {}),
          lastProviderResponse: response,
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
