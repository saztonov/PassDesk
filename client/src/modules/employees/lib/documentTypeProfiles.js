const PROFILE_CODES = {
  EXTERNAL: "external",
  DEFAULT_RU: "default_ru",
  DEFAULT_EAEU: "default_eaeu",
  DEFAULT_MIGRANT: "default_migrant",
};

const LEGACY_PROFILE_CODES = {
  DEFAULT_RU_BY: "default_ru_by",
  DEFAULT_FOREIGN: "default_foreign",
};

export const profileLabels = {
  [PROFILE_CODES.EXTERNAL]: "Все контрагенты (кроме дефолтного)",
  [PROFILE_CODES.DEFAULT_RU]: "Дефолтный контрагент: РФ",
  [PROFILE_CODES.DEFAULT_EAEU]: "Дефолтный контрагент: страны ЕАЭС",
  [PROFILE_CODES.DEFAULT_MIGRANT]: "Дефолтный контрагент: мигранты",
};

const BASE_CONSENTS = [
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
];
const REQUIRED_PROFILE_CODES = {
  [PROFILE_CODES.EXTERNAL]: [],
  [PROFILE_CODES.DEFAULT_RU]: [],
  [PROFILE_CODES.DEFAULT_EAEU]: [],
  [PROFILE_CODES.DEFAULT_MIGRANT]: ["kig"],
};

const BASE_EXTRA_DOCS = [
  "memo_approval",
  "employment_history_stdr",
  "registration_amina",
];

export const DEFAULT_DOCUMENT_PROFILES = {
  [PROFILE_CODES.EXTERNAL]: [...BASE_CONSENTS, "insurance_policy", ...BASE_EXTRA_DOCS],
  [PROFILE_CODES.DEFAULT_RU]: [
    "passport",
    "bank_details",
    ...BASE_CONSENTS,
    "diploma",
    "snils_card",
    "insurance_policy",
    ...BASE_EXTRA_DOCS,
  ],
  [PROFILE_CODES.DEFAULT_EAEU]: [
    "passport",
    "bank_details",
    ...BASE_CONSENTS,
    "diploma",
    "snils_card",
    "insurance_policy",
    ...BASE_EXTRA_DOCS,
  ],
  [PROFILE_CODES.DEFAULT_MIGRANT]: [
    "passport",
    "passport_translation",
    "kig",
    "kig_back",
    "patent_front",
    "patent_back",
    "bank_details",
    ...BASE_CONSENTS,
    "snils_card",
    "visa",
    "arrival_notice",
    "patent_payment_receipt",
    "insurance_policy",
    ...BASE_EXTRA_DOCS,
  ],
};

const DOCUMENT_TYPE_LABELS = {
  passport: "Паспорт",
  passport_translation: "Перевод паспорта",
  inn_document: "ИНН",
  bank_details: "Реквизиты счета",
  kig: "КИГ (лиц.)",
  kig_back: "КИГ (спин.)",
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
  insurance_policy: "Страховой полис",
  memo_approval: "Служебная записка (согласование)",
  employment_history_stdr: "Справка о трудовой деятельности работника (СТДР)",
  registration_amina: "Регистрация (Амина)",
};

const RUSSIAN_CODES = new Set(["ru", "rus", "643"]);
const EAEU_CODES = new Set([
  "by",
  "blr",
  "112",
  "rb",
  "kz",
  "kaz",
  "398",
  "kg",
  "kgz",
  "417",
  "am",
  "arm",
  "051",
]);

const normalizeString = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isRussianName = (nameValue) => {
  const normalized = normalizeString(nameValue);
  if (!normalized) return false;
  return normalized.includes("рос") || normalized.includes("russia");
};

const isEaeuName = (nameValue) => {
  const normalized = normalizeString(nameValue);
  if (!normalized) return false;

  return (
    normalized.includes("беларус") ||
    normalized.includes("belarus") ||
    normalized.includes("белорус") ||
    normalized.includes("казах") ||
    normalized.includes("kazakh") ||
    normalized.includes("киргиз") ||
    normalized.includes("кыргыз") ||
    normalized.includes("kyrgyz") ||
    normalized.includes("армени") ||
    normalized.includes("armenia")
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

export const isRussianCitizenship = (citizenship) => {
  const code = normalizeString(citizenship?.code || citizenship?.countryCode);
  if (RUSSIAN_CODES.has(code)) {
    return true;
  }
  return isRussianName(citizenship?.name);
};

export const isEaeuCitizenship = (citizenship) => {
  if (isRussianCitizenship(citizenship)) {
    return false;
  }

  if (citizenship?.isEaeu === true) {
    return true;
  }

  const code = normalizeString(citizenship?.code || citizenship?.countryCode);
  if (EAEU_CODES.has(code)) {
    return true;
  }

  return isEaeuName(citizenship?.name);
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

  if (isRussianCitizenship(citizenship)) {
    return PROFILE_CODES.DEFAULT_RU;
  }

  if (isEaeuCitizenship(citizenship)) {
    return PROFILE_CODES.DEFAULT_EAEU;
  }

  return PROFILE_CODES.DEFAULT_MIGRANT;
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

const getProfileInputCodes = (input, profileCode) => {
  if (Array.isArray(input[profileCode])) {
    return input[profileCode];
  }

  if (
    profileCode === PROFILE_CODES.DEFAULT_RU ||
    profileCode === PROFILE_CODES.DEFAULT_EAEU
  ) {
    return input[LEGACY_PROFILE_CODES.DEFAULT_RU_BY];
  }

  if (profileCode === PROFILE_CODES.DEFAULT_MIGRANT) {
    return input[LEGACY_PROFILE_CODES.DEFAULT_FOREIGN];
  }

  return input[profileCode];
};

const hasExplicitProfileConfig = (input, profileCode) => {
  if (Array.isArray(input[profileCode])) {
    return true;
  }

  if (
    profileCode === PROFILE_CODES.DEFAULT_RU ||
    profileCode === PROFILE_CODES.DEFAULT_EAEU
  ) {
    return Array.isArray(input[LEGACY_PROFILE_CODES.DEFAULT_RU_BY]);
  }

  if (profileCode === PROFILE_CODES.DEFAULT_MIGRANT) {
    return Array.isArray(input[LEGACY_PROFILE_CODES.DEFAULT_FOREIGN]);
  }

  return false;
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
      ensureRequiredByProfile(code, toUniqueCodes(getProfileInputCodes(input, code))),
      allowedCodeSet,
    );
    const hasExplicitProfile = hasExplicitProfileConfig(input, code);
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
