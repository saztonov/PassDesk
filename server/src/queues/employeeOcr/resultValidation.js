const normalizeNonEmptyString = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

export const getMissingRequiredOcrFields = ({
  documentType,
  normalized = {},
} = {}) => {
  if (documentType === "snils") {
    const snils = normalizeNonEmptyString(normalized?.snils);
    return snils ? [] : ["snils"];
  }

  return [];
};

export const assertRequiredOcrFields = (payload = {}) => {
  const missingFields = getMissingRequiredOcrFields(payload);
  if (missingFields.length === 0) {
    return;
  }

  throw new Error(
    `OCR missing required fields for ${payload.documentType}: ${missingFields.join(", ")}`,
  );
};

