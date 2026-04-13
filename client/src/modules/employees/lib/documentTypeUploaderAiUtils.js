import {
  createAiScannedDocument,
  isAiDocumentScanEnabled,
} from "@/shared/lib/aiDocumentScanner";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_GLOBAL_OCR_RESULT_KEYS = 1000;
const seenOcrResultKeysByEmployee = new Map();

export const MAX_QUEUE_BATCH_SIZE = 100;

export const getSeenOcrResultKeysForEmployee = (employeeId) => {
  const normalizedEmployeeId = String(employeeId || "").trim();
  if (!normalizedEmployeeId) {
    return null;
  }
  let keys = seenOcrResultKeysByEmployee.get(normalizedEmployeeId);
  if (!keys) {
    keys = new Set();
    seenOcrResultKeysByEmployee.set(normalizedEmployeeId, keys);
  }
  return keys;
};

export const rememberSeenOcrResultKey = (employeeId, key) => {
  const keys = getSeenOcrResultKeysForEmployee(employeeId);
  if (!keys || !key) {
    return;
  }
  keys.add(key);
  if (keys.size <= MAX_GLOBAL_OCR_RESULT_KEYS) {
    return;
  }
  const stale = Array.from(keys).slice(0, keys.size - MAX_GLOBAL_OCR_RESULT_KEYS);
  stale.forEach((item) => keys.delete(item));
};

const resolveFileExtension = (fileName = "") =>
  String(fileName || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();

const isImageFile = (file) => {
  const mimeType = String(file?.type || "")
    .trim()
    .toLowerCase();
  const extension = resolveFileExtension(file?.name);

  return mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension);
};

export const prepareFileForUpload = async ({ file, documentType, messageApi }) => {
  if (!isAiDocumentScanEnabled() || !isImageFile(file)) {
    return file;
  }

  const messageKey = `ai-scan-${documentType}-${file.name}-${file.size}`;
  messageApi.loading({
    content: `AI: подготавливаем scan-копию (${file.name})...`,
    key: messageKey,
    duration: 0,
  });

  try {
    const scannedFile = await createAiScannedDocument({
      file,
      documentType,
    });
    messageApi.success({
      content: `AI: scan-копия готова (${file.name})`,
      key: messageKey,
      duration: 2,
    });
    return scannedFile;
  } catch (scanError) {
    console.error("AI scan failed:", scanError);
    const fallbackMessage =
      scanError?.userMessage ||
      scanError?.response?.data?.message ||
      scanError?.message ||
      "AI scan не сработал";
    messageApi.warning({
      content: `${fallbackMessage}. Загружаем исходное фото (${file.name})`,
      key: messageKey,
      duration: 3,
    });
    return file;
  }
};
