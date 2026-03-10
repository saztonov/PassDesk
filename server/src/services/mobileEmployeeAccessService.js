import crypto from "crypto";
import { Op, col, fn, where } from "sequelize";
import {
  Employee,
  EmployeeCounterpartyMapping,
  Counterparty,
  Pass,
  EmployeeMobileAuthCode,
  EmployeeMobileSession,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { issueSkudQrTokenForEmployeeActivePass } from "./skud/SkudQrService.js";

const OTP_TTL_MINUTES = Math.max(
  Number.parseInt(process.env.MOBILE_ACCESS_CODE_TTL_MINUTES || "5", 10) || 5,
  1,
);
const OTP_MAX_ATTEMPTS = Math.max(
  Number.parseInt(process.env.MOBILE_ACCESS_CODE_MAX_ATTEMPTS || "5", 10) || 5,
  1,
);
const SESSION_TTL_DAYS = Math.max(
  Number.parseInt(process.env.MOBILE_ACCESS_SESSION_TTL_DAYS || "30", 10) || 30,
  1,
);
const SESSION_LIMIT_PER_EMPLOYEE = Math.max(
  Number.parseInt(process.env.MOBILE_ACCESS_SESSION_LIMIT || "5", 10) || 5,
  1,
);
const DELIVERY_MODE = String(process.env.MOBILE_ACCESS_DELIVERY_MODE || "log")
  .trim()
  .toLowerCase();
const DEBUG_RETURN_CODE = String(
  process.env.MOBILE_ACCESS_DEBUG_RETURN_CODE || "false",
)
  .trim()
  .toLowerCase() === "true";

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const generateOtpCode = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const generateSessionToken = () => crypto.randomBytes(32).toString("hex");

const buildPhoneCandidates = (rawPhone) => {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) {
    throw new AppError("Телефон обязателен", 400);
  }
  if (digits.length < 10 || digits.length > 15) {
    throw new AppError("Телефон имеет неверный формат", 400);
  }

  const normalized =
    digits.length === 10 ? `7${digits}` : digits.length === 11 && digits.startsWith("8")
      ? `7${digits.slice(1)}`
      : digits;

  const candidates = new Set([digits, normalized]);
  if (normalized.length === 11 && normalized.startsWith("7")) {
    candidates.add(`8${normalized.slice(1)}`);
    candidates.add(normalized.slice(1));
  }

  return {
    normalized,
    candidates: Array.from(candidates),
  };
};

const maskPhone = (normalizedPhone) => {
  const digits = String(normalizedPhone || "").replace(/\D/g, "");
  if (digits.length < 4) {
    return digits;
  }

  const start = digits.slice(0, Math.min(2, digits.length));
  const end = digits.slice(-2);
  return `${start}${"*".repeat(Math.max(0, digits.length - 4))}${end}`;
};

const buildEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Сотрудник";

const buildDeviceLabel = (value) =>
  String(value || "").trim().slice(0, 128) || "mobile-device";

const ensureEmployeeMobileEligible = (employee) => {
  if (!employee || employee.isDeleted) {
    throw new AppError("Сотрудник не найден", 404);
  }
  if (employee.markedForDeletion) {
    throw new AppError("Доступ сотрудника отключен", 403);
  }
  if (employee.isActive === false) {
    throw new AppError("Доступ сотрудника отключен", 403);
  }
  if (!String(employee.phone || "").trim()) {
    throw new AppError("У сотрудника не указан телефон", 400);
  }
  return employee;
};

const findEmployeeByPhone = async (rawPhone) => {
  const { normalized, candidates } = buildPhoneCandidates(rawPhone);

  const employees = await Employee.findAll({
    where: {
      isDeleted: false,
      [Op.and]: [
        where(
          fn("regexp_replace", col("phone"), "\\D", "", "g"),
          {
            [Op.in]: candidates,
          },
        ),
      ],
    },
    attributes: [
      "id",
      "firstName",
      "lastName",
      "middleName",
      "phone",
      "isActive",
      "isDeleted",
      "markedForDeletion",
    ],
    limit: 5,
  });

  if (!employees.length) {
    throw new AppError("Сотрудник с таким телефоном не найден", 404);
  }

  if (employees.length > 1) {
    throw new AppError("Найдено несколько сотрудников с таким телефоном", 409);
  }

  return {
    employee: ensureEmployeeMobileEligible(employees[0]),
    normalizedPhone: normalized,
  };
};

const invalidateActiveCodes = async (employeeId, phoneNormalized) => {
  await EmployeeMobileAuthCode.update(
    { usedAt: new Date(), updatedAt: new Date() },
    {
      where: {
        employeeId,
        phoneNormalized,
        usedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
    },
  );
};

const deliverOtpCode = async ({ employee, normalizedPhone, code }) => {
  if (DELIVERY_MODE === "log" || DELIVERY_MODE === "debug") {
    console.log(
      `[mobile-access] OTP for ${buildEmployeeFullName(employee)} (${normalizedPhone}): ${code}`,
    );
  }

  return {
    channel: DELIVERY_MODE,
    delivered: DELIVERY_MODE === "log" || DELIVERY_MODE === "debug",
  };
};

const cleanupExpiredSessions = async (employeeId) => {
  await EmployeeMobileSession.update(
    {
      revokedAt: new Date(),
      updatedAt: new Date(),
    },
    {
      where: {
        employeeId,
        revokedAt: null,
        expiresAt: {
          [Op.lte]: new Date(),
        },
      },
    },
  );
};

const trimEmployeeSessions = async (employeeId) => {
  const activeSessions = await EmployeeMobileSession.findAll({
    where: {
      employeeId,
      revokedAt: null,
      expiresAt: {
        [Op.gt]: new Date(),
      },
    },
    order: [["updatedAt", "DESC"]],
  });

  const overflow = activeSessions.slice(SESSION_LIMIT_PER_EMPLOYEE);
  if (!overflow.length) {
    return;
  }

  await EmployeeMobileSession.update(
    {
      revokedAt: new Date(),
      updatedAt: new Date(),
    },
    {
      where: {
        id: {
          [Op.in]: overflow.map((item) => item.id),
        },
      },
    },
  );
};

const toEmployeeMobilePayload = async (employeeId) => {
  const employee = await Employee.findByPk(employeeId, {
    attributes: [
      "id",
      "firstName",
      "lastName",
      "middleName",
      "phone",
      "isActive",
      "markedForDeletion",
    ],
    include: [
      {
        model: EmployeeCounterpartyMapping,
        as: "employeeCounterpartyMappings",
        required: false,
        include: [
          {
            model: Counterparty,
            as: "counterparty",
            attributes: ["id", "name", "type"],
          },
        ],
      },
      {
        model: Pass,
        as: "passes",
        required: false,
        attributes: [
          "id",
          "passType",
          "status",
          "validFrom",
          "validUntil",
          "passNumber",
        ],
        where: {
          status: "active",
        },
      },
    ],
    order: [[{ model: Pass, as: "passes" }, "validUntil", "ASC"]],
  });

  ensureEmployeeMobileEligible(employee);

  const activePass = Array.isArray(employee.passes) ? employee.passes[0] || null : null;
  const counterparty = employee.employeeCounterpartyMappings?.[0]?.counterparty || null;

  return {
    employee: {
      id: employee.id,
      fullName: buildEmployeeFullName(employee),
      phoneMasked: maskPhone(employee.phone || ""),
      counterparty: counterparty
        ? {
            id: counterparty.id,
            name: counterparty.name,
            type: counterparty.type,
          }
        : null,
    },
    activePass: activePass
      ? {
          id: activePass.id,
          passType: activePass.passType,
          passNumber: activePass.passNumber || null,
          validFrom: activePass.validFrom,
          validUntil: activePass.validUntil,
        }
      : null,
  };
};

export const requestMobileAccessCode = async ({
  phone,
  requestIp = null,
  deviceLabel = "",
}) => {
  const { employee, normalizedPhone } = await findEmployeeByPhone(phone);
  await invalidateActiveCodes(employee.id, normalizedPhone);

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await EmployeeMobileAuthCode.create({
    employeeId: employee.id,
    phoneNormalized: normalizedPhone,
    codeHash: hashValue(code),
    expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
    deliveryChannel: DELIVERY_MODE,
    requestIp,
    metadata: {
      deviceLabel: buildDeviceLabel(deviceLabel),
    },
  });

  const delivery = await deliverOtpCode({
    employee,
    normalizedPhone,
    code,
  });

  return {
    phoneMasked: maskPhone(normalizedPhone),
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: OTP_TTL_MINUTES,
    delivery,
    ...(DEBUG_RETURN_CODE ? { debugCode: code } : {}),
  };
};

export const verifyMobileAccessCode = async ({
  phone,
  code,
  deviceLabel = "",
  requestIp = null,
  userAgent = null,
}) => {
  const { normalizedPhone } = buildPhoneCandidates(phone);
  const codeHash = hashValue(code);
  const authCode = await EmployeeMobileAuthCode.findOne({
    where: {
      phoneNormalized: normalizedPhone,
      usedAt: null,
      expiresAt: {
        [Op.gt]: new Date(),
      },
    },
    include: [
      {
        model: Employee,
        as: "employee",
        required: true,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  if (!authCode) {
    throw new AppError("Код подтверждения недействителен или истек", 400);
  }

  ensureEmployeeMobileEligible(authCode.employee);

  if (authCode.codeHash !== codeHash) {
    const nextAttempts = (authCode.attempts || 0) + 1;
    await authCode.update({
      attempts: nextAttempts,
      usedAt: nextAttempts >= authCode.maxAttempts ? new Date() : null,
      updatedAt: new Date(),
    });
    throw new AppError("Неверный код подтверждения", 400);
  }

  await authCode.update({
    attempts: (authCode.attempts || 0) + 1,
    usedAt: new Date(),
    updatedAt: new Date(),
  });

  await cleanupExpiredSessions(authCode.employeeId);

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await EmployeeMobileSession.create({
    employeeId: authCode.employeeId,
    phoneNormalized: normalizedPhone,
    tokenHash: hashValue(token),
    deviceLabel: buildDeviceLabel(deviceLabel),
    requestIp,
    userAgent,
    lastSeenAt: new Date(),
    expiresAt,
    metadata: {
      authCodeId: authCode.id,
    },
  });

  await trimEmployeeSessions(authCode.employeeId);

  return {
    accessToken: token,
    expiresAt: expiresAt.toISOString(),
    sessionId: session.id,
    employee: await toEmployeeMobilePayload(authCode.employeeId),
  };
};

export const resolveMobileEmployeeSession = async (token) => {
  const tokenHash = hashValue(token);
  const session = await EmployeeMobileSession.findOne({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        [Op.gt]: new Date(),
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

  if (!session) {
    throw new AppError("Мобильная сессия недействительна", 401);
  }

  ensureEmployeeMobileEligible(session.employee);

  return session;
};

export const getMobileEmployeeSessionState = async (session) => {
  return {
    session: {
      id: session.id,
      deviceLabel: session.deviceLabel || null,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    },
    ...(await toEmployeeMobilePayload(session.employeeId)),
  };
};

export const touchMobileEmployeeSession = async (session) => {
  await session.update({
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  });
};

export const issueMobileEmployeeSkudQr = async (session) => {
  const result = await issueSkudQrTokenForEmployeeActivePass({
    employeeId: session.employeeId,
    channel: "mobile",
    issuedBy: null,
  });

  await touchMobileEmployeeSession(session);
  return result;
};

export const revokeMobileEmployeeSession = async (session) => {
  await session.update({
    revokedAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    revoked: true,
    sessionId: session.id,
  };
};
