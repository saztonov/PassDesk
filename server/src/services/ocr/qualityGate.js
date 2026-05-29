const normalizeNonEmptyString = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const PASSPORT_TRANSLATION_ANCHOR_FIELDS = [
  "birthDate",
  "passportNumber",
  "citizenship",
  "passportIssuedAt",
  "passportExpiryDate",
];

// Канал 3.3: gate для passport_translation. Перевод считается валидным
// только если есть ФИО (lastName + firstName) И хотя бы один сильный
// «якорь». Это блокирует галлюцинации модели, когда на нечитаемом скане
// она «придумывает» правдоподобное ФИО без подтверждающих полей.
export const passesPassportTranslationQualityGate = (normalized) => {
  if (!normalized || typeof normalized !== "object") {
    return false;
  }
  const hasName =
    Boolean(normalizeNonEmptyString(normalized.lastName)) &&
    Boolean(normalizeNonEmptyString(normalized.firstName));
  if (!hasName) {
    return false;
  }
  return PASSPORT_TRANSLATION_ANCHOR_FIELDS.some((field) =>
    Boolean(normalizeNonEmptyString(normalized[field])),
  );
};

export const passesQualityGate = (documentType, normalized) => {
  if (documentType === "passport_translation") {
    return passesPassportTranslationQualityGate(normalized);
  }
  return true;
};
