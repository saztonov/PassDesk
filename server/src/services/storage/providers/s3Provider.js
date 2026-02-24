import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fsp from "fs/promises";

const DEFAULT_BASE_PATH = "";
const DEFAULT_DOWNLOAD_TTL = 3600;

const normalizeRelativePath = (value = "") =>
  value.replace(/^\/+/, "").replace(/\/{2,}/g, "/");

const sanitizeKey = (value = "") => {
  if (!value) {
    return "";
  }

  return value.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
};

const streamToBuffer = async (stream) => {
  if (!stream) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  if (typeof stream.transformToByteArray === "function") {
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

export const createS3Provider = (config = {}) => {
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      `Отсутствуют ключи доступа для провайдера ${config.providerName || "S3"}`,
    );
  }

  if (!config.bucketName) {
    throw new Error(
      `Не указано имя бакета для провайдера ${config.providerName || "S3"}`,
    );
  }

  if (!config.region) {
    throw new Error(
      `Не указан регион для провайдера ${config.providerName || "S3"}`,
    );
  }

  if (!config.endpoint) {
    throw new Error(
      `Не указан endpoint для провайдера ${config.providerName || "S3"}`,
    );
  }

  const basePath = config.basePath
    ? normalizeRelativePath(config.basePath)
    : DEFAULT_BASE_PATH;

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    tls: true,
  });

  const resolvePath = (relativePath = "") => {
    const normalized = normalizeRelativePath(relativePath);
    if (!basePath) {
      return sanitizeKey(normalized);
    }
    return sanitizeKey([basePath, normalized].filter(Boolean).join("/"));
  };

  const normalizePath = (pathValue = "") => {
    if (!pathValue) {
      return basePath;
    }

    const key = sanitizeKey(pathValue);

    if (!basePath) {
      return key;
    }

    if (key === basePath || key.startsWith(`${basePath}/`)) {
      return key;
    }

    return resolvePath(key);
  };

  const uploadFile = async ({
    fileBuffer,
    fileLocalPath,
    mimeType,
    originalName,
    filePath,
  }) => {
    const objectKey = normalizePath(filePath);
    const fileBody = fileBuffer || (fileLocalPath ? await fsp.readFile(fileLocalPath) : null);

    if (!fileBody) {
      throw new Error("Отсутствуют данные файла для загрузки");
    }

    const putParams = {
      Bucket: config.bucketName,
      Key: objectKey,
      Body: fileBody,
      ContentType: mimeType,
      ContentLength: Buffer.isBuffer(fileBody) ? fileBody.length : undefined,
    };

    if (config.kmsKeyId) {
      putParams.ServerSideEncryption = "aws:kms";
      putParams.SSEKMSKeyId = config.kmsKeyId;
    }

    const putCommand = new PutObjectCommand(putParams);

    await client.send(putCommand);

    const fileKey =
      basePath && objectKey.startsWith(`${basePath}/`)
        ? objectKey.slice(basePath.length + 1)
        : objectKey;

    return {
      filePath: objectKey,
      fileKey,
      originalName,
    };
  };

  const deleteFile = async (filePath) => {
    const objectKey = normalizePath(filePath);
    const deleteCommand = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
    });
    await client.send(deleteCommand);
  };

  const getDownloadUrl = async (filePath, options = {}) => {
    const objectKey = normalizePath(filePath);

    // Строим параметры команды GetObject
    const getCommandParams = {
      Bucket: config.bucketName,
      Key: objectKey,
    };

    // Если передано имя файла, добавляем заголовок Content-Disposition для скачивания
    if (options.fileName) {
      // Экранируем имя файла для заголовка Content-Disposition
      const encodedFileName = encodeURIComponent(options.fileName).replace(
        /'/g,
        "%27",
      );
      getCommandParams.ResponseContentDisposition = `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;
    }

    const getCommand = new GetObjectCommand(getCommandParams);

    const url = await getSignedUrl(client, getCommand, {
      expiresIn: options.expiresIn || DEFAULT_DOWNLOAD_TTL,
    });

    return {
      url,
      expiresIn: options.expiresIn || DEFAULT_DOWNLOAD_TTL,
    };
  };

  const getPublicUrl = async (filePath, options = {}) => {
    // Для S3 (Cloud.ru / Yandex) публикуем через подписанную ссылку
    return getDownloadUrl(filePath, {
      expiresIn: options.expiresIn || DEFAULT_DOWNLOAD_TTL,
    });
  };

  const getFileBuffer = async (filePath) => {
    const objectKey = normalizePath(filePath);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      }),
    );

    return streamToBuffer(response.Body);
  };

  return {
    type: "s3",
    name: config.providerName || "s3",
    basePath,
    bucketName: config.bucketName,
    resolvePath,
    normalizePath,
    uploadFile,
    deleteFile,
    getDownloadUrl,
    getPublicUrl,
    getFileBuffer,
  };
};
