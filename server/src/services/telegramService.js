import crypto from "crypto";
import { Op } from "sequelize";
import {
  Employee,
  TelegramAccount,
  TelegramCommandLog,
  TelegramLinkCode,
  TelegramNotificationLog,
  UserEmployeeMapping,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { normalizeTelegramLanguage, tTelegram } from "./telegramI18n.js";
import { getTelegramBotInstance } from "./telegramBotRuntime.js";

const LINK_CODE_TTL_MINUTES = Math.max(
  Number.parseInt(process.env.TELEGRAM_LINK_CODE_TTL_MINUTES || "10", 10) || 10,
  1,
);

const DOCUMENT_LABELS = {
  passport: "Паспорт",
  kig: "КИГ",
  patent: "Патент",
};

const getEmployeeMapping = async (userId) => {
  const mapping = await UserEmployeeMapping.findOne({
    where: { userId },
    include: [
      {
        model: Employee,
        as: "employee",
        attributes: [
          "id",
          "firstName",
          "lastName",
          "middleName",
          "isActive",
          "passportExpiryDate",
          "kigEndDate",
          "patentIssueDate",
        ],
      },
    ],
    order: [["updatedAt", "DESC"]],
  });

  if (!mapping?.employee || mapping.employee.isDeleted) {
    throw new AppError("Профиль сотрудника не найден", 404);
  }

  return mapping;
};

const getEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Сотрудник";

const toCode = () => {
  const buffer = crypto.randomBytes(6);
  return buffer
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
};

const generateUniqueLinkCode = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = toCode();
    const existing = await TelegramLinkCode.findOne({
      where: {
        code,
        usedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      attributes: ["id"],
    });

    if (!existing) return code;
  }

  throw new AppError("Не удалось сгенерировать код привязки", 500);
};

export const logTelegramCommand = async ({
  employeeId = null,
  telegramUserId = null,
  telegramChatId = null,
  command,
  status = "received",
  requestPayload = {},
  responsePayload = {},
  errorMessage = null,
}) => {
  try {
    await TelegramCommandLog.create({
      employeeId,
      telegramUserId: telegramUserId ? String(telegramUserId) : null,
      telegramChatId: telegramChatId ? String(telegramChatId) : null,
      command,
      status,
      requestPayload,
      responsePayload,
      errorMessage,
    });
  } catch (error) {
    console.error("Failed to write telegram command log:", error.message);
  }
};

export const getMyTelegramBinding = async (userId) => {
  const mapping = await getEmployeeMapping(userId);

  const [account, activeCode] = await Promise.all([
    TelegramAccount.findOne({
      where: {
        employeeId: mapping.employeeId,
      },
    }),
    TelegramLinkCode.findOne({
      where: {
        employeeId: mapping.employeeId,
        usedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      order: [["createdAt", "DESC"]],
    }),
  ]);

  return {
    employeeId: mapping.employeeId,
    employeeFullName: getEmployeeFullName(mapping.employee),
    linked: Boolean(account && account.isActive),
    account: account
      ? {
          telegramUserId: account.telegramUserId,
          telegramChatId: account.telegramChatId,
          telegramUsername: account.telegramUsername,
          telegramFirstName: account.telegramFirstName,
          telegramLastName: account.telegramLastName,
          language: account.language,
          linkedAt: account.linkedAt,
          lastSeenAt: account.lastSeenAt,
        }
      : null,
    activeCode: activeCode
      ? {
          code: activeCode.code,
          expiresAt: activeCode.expiresAt,
          command: `/start ${activeCode.code}`,
        }
      : null,
  };
};

export const generateMyTelegramLinkCode = async (userId) => {
  const mapping = await getEmployeeMapping(userId);

  await TelegramLinkCode.update(
    { usedAt: new Date() },
    {
      where: {
        employeeId: mapping.employeeId,
        usedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
    },
  );

  const code = await generateUniqueLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);

  const linkCode = await TelegramLinkCode.create({
    employeeId: mapping.employeeId,
    code,
    expiresAt,
    createdBy: userId,
    metadata: {
      source: "portal",
    },
  });

  return {
    employeeId: mapping.employeeId,
    employeeFullName: getEmployeeFullName(mapping.employee),
    code: linkCode.code,
    expiresAt: linkCode.expiresAt,
    ttlMinutes: LINK_CODE_TTL_MINUTES,
    command: `/start ${linkCode.code}`,
  };
};

export const unlinkMyTelegramAccount = async (userId) => {
  const mapping = await getEmployeeMapping(userId);
  const account = await TelegramAccount.findOne({
    where: { employeeId: mapping.employeeId },
  });

  if (!account) {
    return { success: true, unlinked: false };
  }

  await account.update({
    isActive: false,
    metadata: {
      ...(account.metadata || {}),
      unlinkedAt: new Date().toISOString(),
      unlinkedBy: userId,
    },
  });

  return { success: true, unlinked: true };
};

export const bindTelegramAccountByCode = async ({
  code,
  telegramUserId,
  telegramChatId,
  telegramUsername,
  telegramFirstName,
  telegramLastName,
  telegramLanguageCode,
}) => {
  const normalizedCode = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalizedCode) {
    throw new AppError("Код привязки не указан", 400);
  }

  const now = new Date();
  const linkCode = await TelegramLinkCode.findOne({
    where: {
      code: normalizedCode,
      usedAt: null,
      expiresAt: {
        [Op.gt]: now,
      },
    },
    include: [
      {
        model: Employee,
        as: "employee",
        required: true,
      },
    ],
  });

  if (!linkCode) {
    throw new AppError("Код привязки недействителен", 400);
  }

  const userIdStr = String(telegramUserId);
  const chatIdStr = String(telegramChatId);

  const existingByTelegram = await TelegramAccount.findOne({
    where: {
      telegramUserId: userIdStr,
      isActive: true,
    },
  });

  if (
    existingByTelegram &&
    existingByTelegram.employeeId !== linkCode.employeeId
  ) {
    throw new AppError("Telegram уже привязан к другому сотруднику", 409);
  }

  const language = normalizeTelegramLanguage(telegramLanguageCode);

  const existingByEmployee = await TelegramAccount.findOne({
    where: { employeeId: linkCode.employeeId },
  });

  let account;
  if (existingByEmployee) {
    account = await existingByEmployee.update({
      telegramUserId: userIdStr,
      telegramChatId: chatIdStr,
      telegramUsername: telegramUsername || null,
      telegramFirstName: telegramFirstName || null,
      telegramLastName: telegramLastName || null,
      language,
      isActive: true,
      linkedAt: existingByEmployee.linkedAt || now,
      lastSeenAt: now,
      metadata: {
        ...(existingByEmployee.metadata || {}),
        linkedVia: "start_code",
      },
    });
  } else {
    account = await TelegramAccount.create({
      employeeId: linkCode.employeeId,
      telegramUserId: userIdStr,
      telegramChatId: chatIdStr,
      telegramUsername: telegramUsername || null,
      telegramFirstName: telegramFirstName || null,
      telegramLastName: telegramLastName || null,
      language,
      isActive: true,
      linkedAt: now,
      lastSeenAt: now,
      metadata: {
        linkedVia: "start_code",
      },
    });
  }

  await linkCode.update({
    usedAt: now,
    usedByTelegramUserId: userIdStr,
    metadata: {
      ...(linkCode.metadata || {}),
      telegramChatId: chatIdStr,
    },
  });

  return {
    account,
    employee: linkCode.employee,
  };
};

export const resolveTelegramLanguage = async (telegramUserId, fallback) => {
  const account = await TelegramAccount.findOne({
    where: {
      telegramUserId: String(telegramUserId),
      isActive: true,
    },
    attributes: ["language"],
  });

  if (!account) {
    return normalizeTelegramLanguage(fallback);
  }

  return normalizeTelegramLanguage(account.language || fallback);
};

export const setTelegramLanguage = async ({ telegramUserId, language }) => {
  const normalized = normalizeTelegramLanguage(language);

  const account = await TelegramAccount.findOne({
    where: {
      telegramUserId: String(telegramUserId),
      isActive: true,
    },
  });

  if (!account) {
    throw new AppError("Telegram не привязан", 404);
  }

  await account.update({
    language: normalized,
    lastSeenAt: new Date(),
  });

  return account;
};

const sendTelegramText = async ({ chatId, text, extra = {} }) => {
  const bot = getTelegramBotInstance();
  if (!bot) {
    return false;
  }

  try {
    await bot.telegram.sendMessage(String(chatId), String(text), {
      disable_web_page_preview: true,
      ...extra,
    });
    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error.message);
    return false;
  }
};

const saveNotificationOnce = async ({
  employeeId,
  eventType,
  eventKey,
  payload,
}) => {
  try {
    await TelegramNotificationLog.create({
      employeeId,
      eventType,
      eventKey,
      payload: payload || {},
      deliveredAt: new Date(),
    });
    return true;
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      return false;
    }
    throw error;
  }
};

export const runTelegramDocumentExpiryCheck = async () => {
  const accounts = await TelegramAccount.findAll({
    where: {
      isActive: true,
    },
    include: [
      {
        model: Employee,
        as: "employee",
        attributes: [
          "id",
          "passportExpiryDate",
          "kigEndDate",
          "patentIssueDate",
        ],
        required: true,
      },
    ],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const account of accounts) {
    const employee = account.employee;
    if (!employee) continue;

    const checks = [];

    if (employee.passportExpiryDate) {
      checks.push({
        documentType: "passport",
        date: new Date(employee.passportExpiryDate),
      });
    }

    if (employee.kigEndDate) {
      checks.push({
        documentType: "kig",
        date: new Date(employee.kigEndDate),
      });
    }

    if (employee.patentIssueDate) {
      const patentExpiry = new Date(employee.patentIssueDate);
      patentExpiry.setFullYear(patentExpiry.getFullYear() + 1);
      checks.push({
        documentType: "patent",
        date: patentExpiry,
      });
    }

    for (const item of checks) {
      const expiryDate = new Date(item.date);
      expiryDate.setHours(0, 0, 0, 0);

      if (expiryDate.getTime() > today.getTime()) {
        continue;
      }

      const eventKey = `${item.documentType}:${expiryDate.toISOString().split("T")[0]}`;

      const canSend = await saveNotificationOnce({
        employeeId: employee.id,
        eventType: "document_expiry",
        eventKey,
        payload: {
          documentType: item.documentType,
          expiryDate: expiryDate.toISOString(),
        },
      });

      if (!canSend) {
        continue;
      }

      const text = tTelegram(account.language, "notifyDocExpired", {
        document: DOCUMENT_LABELS[item.documentType] || item.documentType,
        date: expiryDate.toLocaleDateString("ru-RU"),
      });

      await sendTelegramText({
        chatId: account.telegramChatId,
        text,
      });
    }
  }
};

export const getTelegramAccountByUser = async (telegramUserId) => {
  return TelegramAccount.findOne({
    where: {
      telegramUserId: String(telegramUserId),
      isActive: true,
    },
    include: [
      {
        model: Employee,
        as: "employee",
        attributes: ["id", "firstName", "lastName", "middleName", "isActive"],
      },
    ],
  });
};

export const buildTelegramHelpText = (language) => tTelegram(language, "help");

export const buildStartNeedCodeText = (language) =>
  tTelegram(language, "startNeedCode");

export const buildNotLinkedText = (language) =>
  tTelegram(language, "notLinked");

export const mapLinkErrorToMessage = (error, language) => {
  if (error instanceof AppError && error.statusCode === 409) {
    return tTelegram(language, "startAlreadyLinked");
  }

  if (error instanceof AppError && error.statusCode === 400) {
    return tTelegram(language, "startInvalidCode");
  }

  return tTelegram(language, "startInvalidCode");
};

export const touchTelegramAccount = async (telegramUserId) => {
  const account = await TelegramAccount.findOne({
    where: {
      telegramUserId: String(telegramUserId),
      isActive: true,
    },
  });

  if (account) {
    await account.update({
      lastSeenAt: new Date(),
    });
  }

  return account;
};
