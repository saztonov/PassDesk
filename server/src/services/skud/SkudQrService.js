import crypto from "crypto";
import QRCode from "qrcode";
import {
  Employee,
  EmployeeStatusMapping,
  Pass,
  SkudQrToken,
  SkudAccessEvent,
  Status,
} from "../../models/index.js";
import { skudConfig } from "./skudConfig.js";

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const sign = (payloadEncoded) => {
  const secret = skudConfig.qr.hmacSecret;
  if (!secret) {
    throw new Error("SKUD_QR_HMAC_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const hashToken = (token) =>
  crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");

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
  const jti = crypto.randomUUID();

  const payload = {
    sub: String(employeeId),
    jti,
    iat: now,
    exp,
    typ: normalizedType,
    chn: String(channel || "web"),
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  const token = `${payloadEncoded}.${signature}`;
  const tokenHash = hashToken(token);

  await SkudQrToken.create({
    employeeId,
    externalSystem,
    jti,
    tokenHash,
    tokenType: normalizedType,
    expiresAt: new Date(exp * 1000),
    issuedBy,
    metadata: {
      channel: payload.chn,
      issuedAt: new Date(now * 1000).toISOString(),
      ...(metadata || {}),
    },
  });

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
    const [payloadEncoded, signature] = String(token || "").split(".");
    if (!payloadEncoded || !signature) {
      return { allow: false, message: "Некорректный QR" };
    }

    const expectedSignature = sign(payloadEncoded);
    const isSignatureValid =
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

    if (!isSignatureValid) {
      return { allow: false, message: "Подпись QR недействительна" };
    }

    const payloadRaw = base64UrlDecode(payloadEncoded);
    const payload = JSON.parse(payloadRaw);

    if (!payload?.sub || !payload?.exp || !payload?.jti) {
      return { allow: false, message: "Некорректный payload QR" };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(payload.exp) < nowSec) {
      return { allow: false, message: "Срок действия QR истек" };
    }

    const tokenHash = hashToken(token);
    const qrRecord = await SkudQrToken.findOne({
      where: {
        externalSystem,
        tokenHash,
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

    const employeeAccess = await isEmployeeAllowed(payload.sub);
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
      employeeId: payload.sub,
      payload,
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
      message: "QR токен не передан",
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
