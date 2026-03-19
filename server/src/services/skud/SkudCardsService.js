import {
  Employee,
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

  await syncJob.update({
    status: "processing",
    attempts: (syncJob.attempts || 0) + 1,
    updatedAt: new Date(),
  });

  try {
    const payload = syncJob.payload || {};
    const card = payload.cardId ? await SkudCard.findByPk(payload.cardId) : null;
    const provider = getSkudProvider();

    if (syncJob.operation === "assign_card") {
      if (!card?.employeeId) {
        throw new Error("Card or employee binding is missing");
      }
      const externalEmpId = await ensureEmployeeBindingInSkud({
        employeeId: card.employeeId,
        userId: syncJob.createdBy,
        payload: {
          source: "assign_card",
        },
      });

      const response = await provider.assignCard(
        externalEmpId,
        mapCardToSigur({
          cardNumber: card.cardNumber,
          cardType: card.cardType,
        }),
      );

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
      try {
        await syncEmployeeAccessPoints({
          employeeId: card.employeeId,
          externalEmpId,
        });
      } catch (apError) {
        console.error("[SkudCards] Failed to sync access points:", apError?.message);
        // Не фейлим выдачу карты из-за ошибки назначения точек доступа
      }

      await syncJob.update({
        status: "success",
        responsePayload: response,
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      return syncJob;
    }

    if (syncJob.operation === "unbind_card") {
      if (payload.cardNumber && syncJob.employeeId) {
        const binding = await getEmployeeBinding(syncJob.employeeId);
        if (binding?.externalEmpId) {
          await provider.unassignCard(binding.externalEmpId, payload.cardNumber);
        }
      }

      await syncJob.update({
        status: "success",
        responsePayload: { ok: true },
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      return syncJob;
    }

    if (syncJob.operation === "block_card") {
      if (payload.cardNumber && syncJob.employeeId) {
        const binding = await getEmployeeBinding(syncJob.employeeId);
        if (binding?.externalEmpId) {
          await provider.unassignCard(binding.externalEmpId, payload.cardNumber);
        }
      }

      await syncJob.update({
        status: "success",
        responsePayload: { ok: true },
        errorMessage: null,
        processedAt: new Date(),
        updatedAt: new Date(),
      });

      return syncJob;
    }

    throw new Error(`Unsupported cards operation: ${syncJob.operation}`);
  } catch (error) {
    await syncJob.update({
      status: "failed",
      errorMessage: String(error?.message || error),
      processedAt: new Date(),
      updatedAt: new Date(),
    });
    throw error;
  }
};
