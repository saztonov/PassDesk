import axios from "axios";
import fs from "fs";

const API_BASE_URL = "https://cloud-api.yandex.net/v1/disk";
const DEFAULT_BASE_PATH = "/PassDesk";

const ensureLeadingSlash = (value = "") => {
  if (!value) {
    return "/";
  }
  return value.startsWith("/") ? value : `/${value}`;
};

const trimSlashes = (value = "") => {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\/{2,}/g, "/");

  if (normalized === "/") {
    return "/";
  }

  return normalized.replace(/\/+$/, "");
};

const normalizeRelativePath = (value = "") =>
  value.replace(/^\/+/, "").replace(/\/{2,}/g, "/");

const getDirectoryPath = (fullPath = "") => {
  if (!fullPath) {
    return "/";
  }
  const parts = fullPath.split("/");
  parts.pop();
  return parts.join("/") || "/";
};

export const createYandexDiskProvider = (config = {}) => {
  if (!config.token) {
    throw new Error("Отсутствует YANDEX_DISK_TOKEN для провайдера хранения");
  }

  const basePath = trimSlashes(
    ensureLeadingSlash(config.basePath || DEFAULT_BASE_PATH),
  );

  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `OAuth ${config.token}`,
      "Content-Type": "application/json",
    },
  });

  const normalizeFullPath = (pathValue = "") => {
    if (!pathValue) {
      return basePath;
    }

    if (pathValue.startsWith(basePath)) {
      return trimSlashes(pathValue);
    }

    const normalizedRelative = normalizeRelativePath(pathValue);
    return trimSlashes(ensureLeadingSlash(`${basePath}/${normalizedRelative}`));
  };

  const toApiPath = (pathValue = "") => `disk:${pathValue || "/"}`;

  const ensureFolder = async (folderPath = "") => {
    const safePath = trimSlashes(ensureLeadingSlash(folderPath));
    if (!safePath || safePath === "/") {
      return;
    }

    const segments = safePath.split("/").filter(Boolean);
    let currentPath = "";

    for (const segment of segments) {
      currentPath += `/${segment}`;
      try {
        await client.put("/resources", undefined, {
          params: { path: toApiPath(currentPath) },
        });
      } catch (error) {
        if (error.response?.status !== 409) {
          console.error("YandexDisk ensureFolder error", {
            path: currentPath,
            status: error.response?.status,
            data: error.response?.data,
          });
          throw error;
        }
      }
    }
  };

  const uploadFile = async ({
    fileBuffer,
    fileLocalPath,
    mimeType,
    originalName,
    filePath,
  }) => {
    const safePath = normalizeFullPath(filePath);
    const directoryPath = getDirectoryPath(safePath);
    await ensureFolder(directoryPath);

    const uploadUrlResponse = await client.get("/resources/upload", {
      params: {
        path: toApiPath(safePath),
        overwrite: true,
      },
    });

    const uploadUrl = uploadUrlResponse.data.href;

    const fileBody =
      fileBuffer || (fileLocalPath ? fs.createReadStream(fileLocalPath) : null);
    if (!fileBody) {
      throw new Error("Отсутствуют данные файла для загрузки");
    }

    await axios.put(uploadUrl, fileBody, {
      headers: {
        "Content-Type": mimeType,
      },
    });

    return {
      filePath: safePath,
      fileKey: safePath.replace(basePath, "").replace(/^\/+/, ""),
      originalName,
    };
  };

  const deleteFile = async (filePath) => {
    const safePath = normalizeFullPath(filePath);
    await client.delete("/resources", {
      params: {
        path: toApiPath(safePath),
        permanently: true,
      },
    });
  };

  const getDownloadUrl = async (filePath, options = {}) => {
    const safePath = normalizeFullPath(filePath);
    const response = await client.get("/resources/download", {
      params: {
        path: toApiPath(safePath),
      },
    });

    return {
      url: response.data.href,
      expiresIn: options.expiresIn || null,
    };
  };

  const getPublicUrl = async (filePath, options = {}) => {
    const safePath = normalizeFullPath(filePath);

    await client.put("/resources/publish", undefined, {
      params: { path: toApiPath(safePath) },
    });

    const infoResponse = await client.get("/resources", {
      params: { path: toApiPath(safePath) },
    });

    return {
      url: infoResponse.data.public_url,
      expiresIn: options.expiresIn || null,
    };
  };

  const getFileBuffer = async (filePath) => {
    const downloadData = await getDownloadUrl(filePath, { expiresIn: 300 });
    const response = await axios.get(downloadData.url, {
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  };

  return {
    type: "yandexDisk",
    name: "yandexDisk",
    basePath,
    resolvePath: (relativePath = "") => {
      if (!relativePath) {
        return basePath;
      }
      const normalized = normalizeRelativePath(relativePath);
      return trimSlashes(ensureLeadingSlash(`${basePath}/${normalized}`));
    },
    normalizePath: (pathValue = "") => normalizeFullPath(pathValue),
    uploadFile,
    deleteFile,
    getDownloadUrl,
    getPublicUrl,
    getFileBuffer,
  };
};
