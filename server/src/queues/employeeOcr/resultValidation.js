import { passesPassportTranslationQualityGate } from "../../services/ocr/qualityGate.js";

const normalizeNonEmptyString = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

export { passesPassportTranslationQualityGate };

export const getMissingRequiredOcrFields = ({
  documentType,
  normalized = {},
} = {}) => {
  if (documentType === "snils") {
    const snils = normalizeNonEmptyString(normalized?.snils);
    return snils ? [] : ["snils"];
  }

  if (documentType === "passport_translation") {
    if (passesPassportTranslationQualityGate(normalized)) {
      return [];
    }
    return ["passport_translation_quality"];
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

