const PROFILE_CODES = {
  EXTERNAL: "external",
  DEFAULT_RU_BY: "default_ru_by",
  DEFAULT_FOREIGN: "default_foreign",
};

export const profileLabels = {
  [PROFILE_CODES.EXTERNAL]: "Все контрагенты (кроме дефолтного)",
  [PROFILE_CODES.DEFAULT_RU_BY]: "Дефолтный контрагент: РФ + РБ",
  [PROFILE_CODES.DEFAULT_FOREIGN]:
    "Дефолтный контрагент: остальные гражданства",
};

const BASE_CONSENTS = [
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
];
const REQUIRED_PROFILE_CODES = {
  [PROFILE_CODES.EXTERNAL]: [],
  [PROFILE_CODES.DEFAULT_RU_BY]: [],
  [PROFILE_CODES.DEFAULT_FOREIGN]: ["kig"],
};

export const DEFAULT_DOCUMENT_PROFILES = {
  [PROFILE_CODES.EXTERNAL]: [...BASE_CONSENTS],
  [PROFILE_CODES.DEFAULT_RU_BY]: [
    "passport",
    "bank_details",
    ...BASE_CONSENTS,
    "diploma",
    "snils_card",
  ],
  [PROFILE_CODES.DEFAULT_FOREIGN]: [
    "passport",
    "passport_translation",
    "kig",
    "patent_front",
    "patent_back",
    "bank_details",
    ...BASE_CONSENTS,
    "snils_card",
    "visa",
    "arrival_notice",
    "patent_payment_receipt",
  ],
};

const DOCUMENT_TYPE_LABELS = {
  passport: "Паспорт",
  passport_translation: "Перевод паспорта",
  inn_document: "ИНН",
  bank_details: "Реквизиты счета",
  kig: "КИГ",
  consent: "Согласие на перс.дан. Подрядчик",
  biometric_consent: "Согласие на перс.дан. Генподряд",
  biometric_consent_developer: "Согласие на перс.дан. Застройщ",
  diploma: "Диплом",
  snils_card: "СНИЛС",
  patent_front: "Патент (лиц.)",
  patent_back: "Патент (спин.)",
  visa: "Виза",
  arrival_notice: "Уведомление о прибытии (регистрация)",
  patent_payment_receipt: "Чек оплаты патента",
};

const RU_BY_CODES = new Set(["ru", "rus", "643", "by", "blr", "112", "rb"]);

const normalizeString = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isRuOrByName = (nameValue) => {
  const normalized = normalizeString(nameValue);
  if (!normalized) return false;
  return (
    normalized.includes("рос") ||
    normalized.includes("russia") ||
    normalized.includes("беларус") ||
    normalized.includes("belarus")
  );
};

export const resolveEmployeeCounterpartyId = ({
  employee,
  fallbackCounterpartyId = null,
}) => {
  const mappingCounterpartyId =
    employee?.employeeCounterpartyMappings?.[0]?.counterpartyId ||
    employee?.employeeCounterpartyMappings?.[0]?.counterparty?.id ||
    null;

  return (
    mappingCounterpartyId ||
    employee?.counterpartyId ||
    fallbackCounterpartyId ||
    null
  );
};

export const isRuOrByCitizenship = (citizenship) => {
  const code = normalizeString(citizenship?.code || citizenship?.countryCode);
  if (RU_BY_CODES.has(code)) {
    return true;
  }
  return isRuOrByName(citizenship?.name);
};

export const resolveEmployeeDocumentProfile = ({
  counterpartyId,
  defaultCounterpartyId,
  citizenship,
}) => {
  const isDefaultCounterparty =
    counterpartyId &&
    defaultCounterpartyId &&
    String(counterpartyId) === String(defaultCounterpartyId);

  if (!isDefaultCounterparty) {
    return PROFILE_CODES.EXTERNAL;
  }

  return isRuOrByCitizenship(citizenship)
    ? PROFILE_CODES.DEFAULT_RU_BY
    : PROFILE_CODES.DEFAULT_FOREIGN;
};

const toUniqueCodes = (values = []) => {
  const unique = [];
  const seen = new Set();

  (Array.isArray(values) ? values : []).forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });

  return unique;
};

const ensureRequiredByProfile = (profileCode, codes = []) => {
  const requiredCodes = REQUIRED_PROFILE_CODES[profileCode] || [];
  if (!requiredCodes.length) {
    return codes;
  }

  const result = [...codes];
  requiredCodes.forEach((code) => {
    if (!result.includes(code)) {
      result.push(code);
    }
  });
  return result;
};

const filterCodesByAllowed = (codes = [], allowedCodeSet = null) => {
  if (!allowedCodeSet || allowedCodeSet.size === 0) {
    return codes;
  }
  return codes.filter((code) => allowedCodeSet.has(code));
};

export const normalizeDocumentProfilesConfig = ({
  profilesConfig,
  availableDocumentTypeCodes = null,
} = {}) => {
  const allowedCodeSet =
    Array.isArray(availableDocumentTypeCodes) &&
    availableDocumentTypeCodes.length > 0
      ? new Set(availableDocumentTypeCodes.map((code) => String(code).trim()))
      : null;

  const input =
    profilesConfig &&
    typeof profilesConfig === "object" &&
    !Array.isArray(profilesConfig)
      ? profilesConfig
      : {};

  return Object.values(PROFILE_CODES).reduce((accumulator, code) => {
    const defaultCodes = filterCodesByAllowed(
      ensureRequiredByProfile(code, DEFAULT_DOCUMENT_PROFILES[code] || []),
      allowedCodeSet,
    );
    const inputCodes = filterCodesByAllowed(
      ensureRequiredByProfile(code, toUniqueCodes(input[code])),
      allowedCodeSet,
    );
    const hasExplicitProfile = Array.isArray(input[code]);
    accumulator[code] = hasExplicitProfile
      ? inputCodes
      : inputCodes.length > 0
        ? inputCodes
        : defaultCodes;
    return accumulator;
  }, {});
};

export const getDocumentTypeCodesForProfile = (
  profileCode,
  profilesConfig = null,
  availableDocumentTypeCodes = null,
) => {
  const profiles = normalizeDocumentProfilesConfig({
    profilesConfig,
    availableDocumentTypeCodes,
  });

  return (
    profiles[profileCode] ||
    profiles[PROFILE_CODES.EXTERNAL] ||
    DEFAULT_DOCUMENT_PROFILES[PROFILE_CODES.EXTERNAL]
  );
};

export const applyDocumentTypeProfile = ({
  documentTypes = [],
  profileCode = PROFILE_CODES.EXTERNAL,
  profilesConfig = null,
}) => {
  const availableCodes = (Array.isArray(documentTypes) ? documentTypes : [])
    .map((item) => String(item?.value || "").trim())
    .filter(Boolean);
  const allowedCodes = getDocumentTypeCodesForProfile(
    profileCode,
    profilesConfig,
    availableCodes,
  );
  const availableMap = new Map(
    (Array.isArray(documentTypes) ? documentTypes : []).map((item) => [
      item.value,
      item,
    ]),
  );

  return allowedCodes.map((code, index) => {
    const fromApi = availableMap.get(code);
    if (fromApi) {
      return fromApi;
    }
    return {
      value: code,
      label: DOCUMENT_TYPE_LABELS[code] || code,
      description: "",
      sampleUrl: "",
      sampleMimeType: "",
      sampleHighlightedFields: [],
      sortOrder: index,
    };
  });
};

export const profileCodes = PROFILE_CODES;
export const profileDocumentTypeLabels = DOCUMENT_TYPE_LABELS;
