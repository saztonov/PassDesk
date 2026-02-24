import jwt from "jsonwebtoken";

const TOKEN_PURPOSE = "file_proxy_download";
const TOKEN_ISSUER = "passdesk-file-proxy";
const DEFAULT_TTL_SECONDS = 5 * 60;

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

export const issueFileProxyToken = ({ fileId, disposition = "attachment" }) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to issue file proxy token");
  }
  if (!fileId) {
    throw new Error("fileId is required to issue file proxy token");
  }

  const safeDisposition = disposition === "inline" ? "inline" : "attachment";
  return jwt.sign(
    {
      purpose: TOKEN_PURPOSE,
      fileId,
      disposition: safeDisposition,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: getTokenTtlSeconds(),
      issuer: TOKEN_ISSUER,
      subject: String(fileId),
    },
  );
};

export const verifyFileProxyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to verify file proxy token");
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    issuer: TOKEN_ISSUER,
  });

  if (!decoded || decoded.purpose !== TOKEN_PURPOSE || !decoded.fileId) {
    throw new Error("Invalid file proxy token payload");
  }

  return {
    fileId: decoded.fileId,
    disposition: decoded.disposition === "inline" ? "inline" : "attachment",
  };
};

export const buildFileProxyUrl = (req, fileId, disposition = "attachment") => {
  const token = issueFileProxyToken({ fileId, disposition });
  const origin = `${req.protocol}://${req.get("host")}`;
  const apiVersion = process.env.API_VERSION || "v1";
  return `${origin}/api/${apiVersion}/files/proxy/${fileId}?token=${encodeURIComponent(token)}`;
};
