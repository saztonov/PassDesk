import {
  ENCRYPTED_EMPLOYEE_FIELDS,
  encryptField,
  hashForSearch,
  isFieldEncryptionEnabled,
} from "./encryptionService.js";

const FIELD_MAPPINGS = [
  {
    plainKey: "lastName",
    encryptedKey: "lastNameEnc",
    hashKey: "lastNameHash",
    keyVersionKey: "lastNameKeyVersion",
    encryptedField: ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME,
  },
  {
    plainKey: "passportNumber",
    encryptedKey: "passportNumberEnc",
    hashKey: "passportNumberHash",
    keyVersionKey: "passportNumberKeyVersion",
    encryptedField: ENCRYPTED_EMPLOYEE_FIELDS.PASSPORT_NUMBER,
  },
  {
    plainKey: "kig",
    encryptedKey: "kigEnc",
    hashKey: "kigHash",
    keyVersionKey: "kigKeyVersion",
    encryptedField: ENCRYPTED_EMPLOYEE_FIELDS.KIG,
  },
  {
    plainKey: "patentNumber",
    encryptedKey: "patentNumberEnc",
    hashKey: "patentNumberHash",
    keyVersionKey: "patentNumberKeyVersion",
    encryptedField: ENCRYPTED_EMPLOYEE_FIELDS.PATENT_NUMBER,
  },
];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const LEGACY_PLAIN_KEYS = Object.freeze([
  "lastName",
  "passportNumber",
  "kig",
  "patentNumber",
]);

const shouldKeepLegacyPlaintext = () => {
  const commonRaw = process.env.FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT;
  if (commonRaw !== undefined) {
    return String(commonRaw).toLowerCase() === "true";
  }

  const raw = process.env.FIELD_ENCRYPTION_KEEP_LEGACY_DOC_PLAINTEXT;
  if (raw === undefined) {
    return true;
  }
  return String(raw).toLowerCase() === "true";
};

export const buildEmployeeSensitiveFieldsPatch = (payload = {}) => {
  if (!isFieldEncryptionEnabled()) {
    return {};
  }

  const patch = {};

  for (const mapping of FIELD_MAPPINGS) {
    if (!hasOwn(payload, mapping.plainKey)) {
      continue;
    }

    const value = payload[mapping.plainKey];
    if (value === null || value === undefined || value === "") {
      patch[mapping.encryptedKey] = null;
      patch[mapping.hashKey] = null;
      patch[mapping.keyVersionKey] = null;
      continue;
    }

    const encrypted = encryptField(value);
    patch[mapping.encryptedKey] = encrypted.payload;
    patch[mapping.hashKey] = hashForSearch(mapping.encryptedField, value);
    patch[mapping.keyVersionKey] = encrypted.keyVersion;
  }

  return patch;
};

export const applyLegacySensitivePlaintextPolicy = (payload = {}) => {
  if (!isFieldEncryptionEnabled() || shouldKeepLegacyPlaintext()) {
    return payload;
  }

  const patchedPayload = { ...payload };
  for (const key of LEGACY_PLAIN_KEYS) {
    if (hasOwn(patchedPayload, key)) {
      patchedPayload[key] = null;
    }
  }

  return patchedPayload;
};
