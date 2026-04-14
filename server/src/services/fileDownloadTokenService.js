import crypto from "crypto";
import jwt from "jsonwebtoken";

const TOKEN_PURPOSE = "file_proxy_download";
const TOKEN_ISSUER = "passdesk-file-proxy";
const DEFAULT_TTL_SECONDS = 5 * 60;

const isSecretStrongEnough = (secret) =>
  typeof secret === "string" && secret.trim().length >= 32;

const canUseLegacyJwtSecret = () => {
  if (process.env.FILE_PROXY_ALLOW_LEGACY_JWT_SECRET === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
};

const getFileProxySecret = () => {
  const dedicatedSecret = process.env.FILE_PROXY_JWT_SECRET;
  if (isSecretStrongEnough(dedicatedSecret)) {
    return dedicatedSecret;
  }

  if (canUseLegacyJwtSecret() && isSecretStrongEnough(process.env.JWT_SECRET)) {
    return process.env.JWT_SECRET;
  }

  throw new Error(
    "FILE_PROXY_JWT_SECRET with at least 32 characters is required for file proxy token operations",
  );
};

const resolveRequestIp = (req) => {
  const forwardedFor = req?.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req?.ip || req?.connection?.remoteAddress || "";
};

export const buildFileProxyRequesterFingerprint = (req) => {
  const ip = resolveRequestIp(req);
  const userAgent = req?.get?.("user-agent") || req?.headers?.["user-agent"] || "";
  const normalized = `${ip}|${String(userAgent).trim().toLowerCase()}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
};

const getTokenTtlSeconds = () => {
  const raw = process.env.FILE_PROXY_TOKEN_TTL_SECONDS;
  if (!raw) {
    return DEFAULT_TTL_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return parsed;
};

export const issueFileProxyToken = ({
  fileId,
  disposition = "attachment",
  requestedByUserId,
  requesterFingerprint = null,
}) => {
  const secret = getFileProxySecret();
  if (!fileId) {
    throw new Error("fileId is required to issue file proxy token");
  }
  if (!requestedByUserId) {
    throw new Error("requestedByUserId is required to issue file proxy token");
  }
  if (!requesterFingerprint) {
    throw new Error("requesterFingerprint is required to issue file proxy token");
  }

  const safeDisposition = disposition === "inline" ? "inline" : "attachment";
  const safeRequestedByUserId = String(requestedByUserId);
  return jwt.sign(
    {
      purpose: TOKEN_PURPOSE,
      fileId,
      disposition: safeDisposition,
      requestedByUserId: safeRequestedByUserId,
      requesterFingerprint,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: getTokenTtlSeconds(),
      issuer: TOKEN_ISSUER,
      subject: String(fileId),
    },
  );
};

export const verifyFileProxyToken = (token, { requesterFingerprint } = {}) => {
  const secret = getFileProxySecret();
  if (!requesterFingerprint) {
    throw new Error("requesterFingerprint is required to verify file proxy token");
  }
  const decoded = jwt.verify(token, secret, {
    issuer: TOKEN_ISSUER,
    algorithms: ["HS256"],
  });

  if (
    !decoded ||
    decoded.purpose !== TOKEN_PURPOSE ||
    !decoded.fileId ||
    !decoded.requesterFingerprint ||
    !decoded.requestedByUserId
  ) {
    throw new Error("Invalid file proxy token payload");
  }
  if (decoded.requesterFingerprint !== requesterFingerprint) {
    throw new Error("File proxy token requester fingerprint mismatch");
  }

  return {
    fileId: decoded.fileId,
    disposition: decoded.disposition === "inline" ? "inline" : "attachment",
    requestedByUserId: decoded.requestedByUserId || null,
  };
};

export const buildFileProxyUrl = (req, fileId, disposition = "attachment") => {
  const token = issueFileProxyToken({
    fileId,
    disposition,
    requestedByUserId: req?.user?.id || null,
    requesterFingerprint: buildFileProxyRequesterFingerprint(req),
  });
  const origin = `${req.protocol}://${req.get("host")}`;
  const apiVersion = process.env.API_VERSION || "v1";
  return `${origin}/api/${apiVersion}/files/proxy/${fileId}/${encodeURIComponent(token)}`;
};
