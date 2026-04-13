import {
  ENCRYPTED_EMPLOYEE_FIELDS,
  hashForSearch,
  isFieldEncryptionEnabled,
} from "../services/encryptionService.js";

const CITIZENSHIP_LOOKUP_ALIASES = {
  россия: "российская федерация",
  рф: "российская федерация",
};

const NON_PATENT_CITIZENSHIPS = new Set([
  "российская федерация",
  "россия",
  "рф",
  "армения",
  "беларусь",
  "казахстан",
  "киргизия",
  "кыргызстан",
]);

const toTitleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/(^|[\s-])([a-zа-яё])/giu, (_, prefix, char) =>
      `${prefix}${char.toUpperCase()}`,
    );

export const normalizeCitizenshipLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const formatCitizenshipDisplayName = (value) =>
  String(value || "")
    .trim()
    .split(",")
    .map((part) => toTitleCase(part.trim()))
    .join(", ");

export const inferCitizenshipRequiresPatent = (citizenshipName) =>
  !NON_PATENT_CITIZENSHIPS.has(
    CITIZENSHIP_LOOKUP_ALIASES[normalizeCitizenshipLookupValue(citizenshipName)] ||
      normalizeCitizenshipLookupValue(citizenshipName),
  );

export const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

export const shouldSkipPatentValidation = (employeeData) =>
  employeeData?.isClosedBrigade === true ||
  String(employeeData?.employmentStatus || "").trim().toLowerCase() === "fired";

export const resolveCitizenshipAlias = (citizenshipName) => {
  const normalized = normalizeCitizenshipLookupValue(citizenshipName);
  return CITIZENSHIP_LOOKUP_ALIASES[normalized] || normalized;
};

export const buildLastNameHash = (lastName) => {
  if (!lastName || !isFieldEncryptionEnabled()) {
    return null;
  }

  try {
    return hashForSearch(ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME, lastName);
  } catch {
    return null;
  }
};
