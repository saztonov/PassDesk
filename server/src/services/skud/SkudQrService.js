import crypto from "crypto";
import QRCode from "qrcode";
import { Op } from "sequelize";
import {
  Employee,
  EmployeeStatusMapping,
  Pass,
  SkudQrToken,
  SkudAccessEvent,
  Status,
} from "../../models/index.js";
import { skudConfig } from "./skudConfig.js";

const hashToken = (token) =>
  crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");

const QR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateShortQrCode = (length = 7) => {
  const bytes = crypto.randomBytes(length);
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += QR_CODE_ALPHABET[bytes[index] % QR_CODE_ALPHABET.length];
  }

  return value;
};

const decodeAsciiTokenFromHex = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9A-F]+$/i.test(normalized)) {
    return null;
  }

  try {
    const decoded = Buffer.from(normalized, "hex")
      .toString("utf8")
      .replace(/\0+$/g, "")
      .trim();

    if (!decoded || !/^[A-Z0-9]+$/i.test(decoded)) {
      return null;
    }

    return decoded.toUpperCase();
  } catch {
    return null;
  }
};

const collectTokenCandidates = (token) => {
  const raw = String(token || "").trim();
  if (!raw) {
    return [];
  }

  const candidates = new Set([raw, raw.toUpperCase()]);
  const decodedAscii = decodeAsciiTokenFromHex(raw);
  if (decodedAscii) {
    candidates.add(decodedAscii);
  }

  return Array.from(candidates);
};

const isPassActiveNow = (pass) => {
  if (!pass) {
    return false;
  }

  if (
    String(pass.status || "")
      .trim()
      .toLowerCase() !== "active"
  ) {
    return false;
  }

  const nowTs = Date.now();
  const validFromTs = pass.validFrom
    ? new Date(pass.validFrom).getTime()
    : null;
  const validUntilTs = pass.validUntil
    ? new Date(pass.validUntil).getTime()
    : null;

  if (Number.isFinite(validFromTs) && validFromTs > nowTs) {
    return false;
  }

  if (Number.isFinite(validUntilTs) && validUntilTs < nowTs) {
    return false;
  }

  return true;
};

const resolveTokenTypeByPassType = (passType) =>
  String(passType || "")
    .trim()
    .toLowerCase() === "temporary"
    ? "one_time"
    : "persistent";

const ensurePassEligibleForQr = ({ pass, employeeId = null }) => {
  if (!pass) {
    throw new Error("Pass not found");
  }

  if (employeeId && String(pass.employeeId) !== String(employeeId)) {
    throw new Error("Pass does not belong to requested employee");
  }

  if (!isPassActiveNow(pass)) {
    throw new Error("Pass is not active for QR issuance");
  }

  return pass;
};

const isEmployeeAllowed = async (employeeId) => {
  const employee = await Employee.findByPk(employeeId, {
    include: [
      {
        model: EmployeeStatusMapping,
        as: "statusMappings",
        where: { isActive: true },
        required: false,
        include: [
          {
            model: Status,
            as: "status",
            attributes: ["name", "group"],
          },
        ],
      },
    ],
  });

  if (!employee || employee.isDeleted || employee.isActive === false) {
    return {
      allow: false,
      message: "Сотрудник неактивен",
    };
  }

  const statusMappings = Array.isArray(employee.statusMappings)
    ? employee.statusMappings
    : [];

  const secureStatus = statusMappings.find(
    (item) => item?.status?.group === "status_secure",
  )?.status?.name;
  if (
    secureStatus === "status_secure_block" ||
    secureStatus === "status_secure_block_compl"
  ) {
    return {
      allow: false,
      message: "Сотрудник заблокирован",
    };
  }

  const activeStatus = statusMappings.find(
    (item) => item?.status?.group === "status_active",
  )?.status?.name;

  if (
    activeStatus === "status_active_fired" ||
    activeStatus === "status_active_inactive"
  ) {
    return {
      allow: false,
      message: "Доступ сотрудника отключен",
    };
  }

  return {
    allow: true,
    message: "Доступ разрешен",
    employee,
  };
};

export const issueSkudQrToken = async ({
  employeeId,
  tokenType = "persistent",
  channel = "web",
  issuedBy = null,
  externalSystem = "sigur",
  metadata = {},
}) => {
  const normalizedType = tokenType === "one_time" ? "one_time" : "persistent";
  const ttlSeconds =
    normalizedType === "one_time"
      ? skudConfig.qr.oneTimeTtlSeconds
      : skudConfig.qr.persistentTtlSeconds;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const payloadBase = {
    sub: String(employeeId),
    iat: now,
    exp,
    typ: normalizedType,
    chn: String(channel || "web"),
    fmt: "short_code",
  };

  let token = null;
  let tokenHash = null;
  let jti = null;
  let qrRecordCreated = false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    token = generateShortQrCode(7);
    tokenHash = hashToken(token);
    jti = crypto.randomUUID();

    try {
      await SkudQrToken.create({
        employeeId,
        externalSystem,
        jti,
        tokenHash,
        tokenType: normalizedType,
        expiresAt: new Date(exp * 1000),
        issuedBy,
        metadata: {
          channel: payloadBase.chn,
          issuedAt: new Date(now * 1000).toISOString(),
          format: payloadBase.fmt,
          ...(metadata || {}),
        },
      });
      qrRecordCreated = true;
      break;
    } catch (error) {
      if (
        error?.name !== "SequelizeUniqueConstraintError" ||
        attempt === 4
      ) {
        throw error;
      }
    }
  }

  if (!qrRecordCreated) {
    throw new Error("Failed to generate unique QR code");
  }

  const payload = {
    ...payloadBase,
    jti,
  };

  const qrImageDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    qrPayload: payload,
    qrImageDataUrl,
  };
};

export const issueSkudQrTokenForPass = async ({
  passId,
  employeeId = null,
  channel = "web",
  issuedBy = null,
  externalSystem = "sigur",
}) => {
  const pass = await Pass.findByPk(passId, {
    attributes: [
      "id",
      "employeeId",
      "passType",
      "status",
      "validFrom",
      "validUntil",
      "passNumber",
    ],
  });

  ensurePassEligibleForQr({ pass, employeeId });

  const tokenType = resolveTokenTypeByPassType(pass.passType);
  const result = await issueSkudQrToken({
    employeeId: pass.employeeId,
    tokenType,
    channel,
    issuedBy,
    externalSystem,
    metadata: {
      passId: pass.id,
      passType: pass.passType,
      passNumber: pass.passNumber || null,
    },
  });

  return {
    ...result,
    passId: pass.id,
    passType: pass.passType,
    passNumber: pass.passNumber || null,
    tokenType,
  };
};

export const issueSkudQrTokenForEmployeeActivePass = async ({
  employeeId,
  channel = "mobile",
  issuedBy = null,
  externalSystem = "sigur",
}) => {
  const passes = await Pass.findAll({
    where: {
      employeeId,
      status: "active",
    },
    attributes: [
      "id",
      "employeeId",
      "passType",
      "status",
      "validFrom",
      "validUntil",
      "passNumber",
      "updatedAt",
    ],
    order: [
      ["validUntil", "ASC"],
      ["updatedAt", "DESC"],
    ],
    limit: 20,
  });

  const pass = passes.find((item) => isPassActiveNow(item));
  if (!pass) {
    throw new Error("Active pass for employee is not found");
  }

  return issueSkudQrTokenForPass({
    passId: pass.id,
    employeeId,
    channel,
    issuedBy,
    externalSystem,
  });
};

export const verifySkudQrToken = async ({
  token,
  markUsed = false,
  externalSystem = "sigur",
}) => {
  try {
    const tokenCandidates = collectTokenCandidates(token);
    if (tokenCandidates.length === 0) {
      return { allow: false, message: "Некорректный QR" };
    }

    const tokenHashes = tokenCandidates.map((item) => hashToken(item));
    const qrRecord = await SkudQrToken.findOne({
      where: {
        externalSystem,
        tokenHash: {
          [Op.in]: tokenHashes,
        },
      },
    });

    if (!qrRecord) {
      return { allow: false, message: "QR не найден" };
    }

    if (qrRecord.revokedAt) {
      return { allow: false, message: "QR отозван" };
    }

    if (
      qrRecord.expiresAt &&
      new Date(qrRecord.expiresAt).getTime() < Date.now()
    ) {
      return { allow: false, message: "Срок действия QR истек" };
    }

    if (qrRecord.tokenType === "one_time" && qrRecord.usedAt) {
      return { allow: false, message: "QR уже использован" };
    }

    const employeeAccess = await isEmployeeAllowed(qrRecord.employeeId);
    if (!employeeAccess.allow) {
      return employeeAccess;
    }

    if (markUsed && qrRecord.tokenType === "one_time") {
      await qrRecord.update({
        usedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return {
      allow: true,
      message: "Доступ разрешен",
      employeeId: qrRecord.employeeId,
      tokenType: qrRecord.tokenType,
      expiresAt: qrRecord.expiresAt,
      format: qrRecord.metadata?.format || "short_code",
      payload: {
        sub: String(qrRecord.employeeId),
        jti: qrRecord.jti,
        exp: Math.floor(new Date(qrRecord.expiresAt).getTime() / 1000),
        typ: qrRecord.tokenType,
        chn: qrRecord.metadata?.channel || "web",
        fmt: qrRecord.metadata?.format || "short_code",
      },
      qrRecord,
    };
  } catch (error) {
    return {
      allow: false,
      message: "Ошибка проверки QR",
      error: String(error?.message || error),
    };
  }
};

export const processSkudDecisionPayload = async ({ payload = {} }) => {
  const token =
    String(payload?.token || "").trim() ||
    String(payload?.qr || "").trim() ||
    String(payload?.keyHex || "").trim();

  if (!token) {
    return {
      allow: false,
      message: "QR-код не передан",
    };
  }

  const result = await verifySkudQrToken({ token, markUsed: true });

  await SkudAccessEvent.create({
    externalSystem: "sigur",
    source: "webdel",
    eventType: "decision",
    employeeId: result.employeeId || null,
    accessPoint: payload?.accessPoint || null,
    direction: payload?.direction || null,
    keyHex: payload?.keyHex || null,
    allow: Boolean(result.allow),
    decisionMessage: result.message || null,
    eventTime: new Date(),
    rawPayload: payload,
  });

  return {
    allow: Boolean(result.allow),
    message: result.message || undefined,
    employeeId: result.employeeId || null,
  };
};
