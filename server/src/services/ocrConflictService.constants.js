export const normalizeString = (value) => String(value || "").trim();

export const isMissingRelationError = (error, relationName) => {
  const message = String(error?.original?.message || error?.message || "");
  if (!message) {
    return false;
  }

  return (
    message.includes(`relation "${relationName}" does not exist`) ||
    message.includes(`relation '${relationName}' does not exist`)
  );
};

export const DOCUMENT_TYPE_LABELS = {
  passport: "Паспорт",
  passport_translation: "Перевод паспорта",
  inn_document: "ИНН",
  bank_details: "Реквизиты счета",
  snils_card: "СНИЛС",
  patent_front: "Патент (лицевая)",
  patent_back: "Патент (оборот)",
  visa: "Виза",
  kig: "КИГ",
};

export const EMPLOYEE_CARD_SOURCE = "employee_card";
export const EMPLOYEE_CARD_LABEL = "Карточка сотрудника";

export const getEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Сотрудник";

export const getCounterpartyName = (employee) =>
  employee?.employeeCounterpartyMappings?.[0]?.counterparty?.name || "Без контрагента";

export const getCounterpartyIds = (employee) => [
  ...new Set(
    (employee?.employeeCounterpartyMappings || [])
      .map((mapping) => normalizeString(mapping?.counterparty?.id || mapping?.counterpartyId))
      .filter(Boolean),
  ),
];

export const DATE_FIELDS = new Set([
  "birthDate",
  "passportDate",
  "passportExpiryDate",
  "kigEndDate",
  "patentIssueDate",
  "insurancePolicyDate",
]);

export const DIGITS_ONLY_FIELDS = new Map([
  ["inn", 12],
  ["snils", 11],
  ["bankAccountNumber", 20],
]);

export const FIO_FIELDS = [
  { fieldName: "lastName", fieldLabel: "Фамилия" },
  { fieldName: "firstName", fieldLabel: "Имя" },
  { fieldName: "middleName", fieldLabel: "Отчество" },
];
export const FIO_FIELD_NAMES = new Set(FIO_FIELDS.map((item) => item.fieldName));

export const OCR_FIO_DOCUMENT_TYPES = new Set([
  "passport",
  "passport_translation",
  "inn_document",
  "snils_card",
  "kig",
  "patent_front",
  "patent_back",
  "patent_payment_receipt",
  "bank_details",
]);

export const PASSPORT_DOCUMENT_TYPES = new Set(["passport"]);
export const PASSPORT_TRANSLATION_DOCUMENT_TYPE = "passport_translation";

export const normalizeComparableText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");

export const getTimestampValue = (value) => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const parseDateValue = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split(".");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

export const normalizePassportDepartmentCode = (value) => {
  const digits = normalizeString(value).replace(/[^\d]/g, "").slice(0, 6);
  if (!digits) {
    return null;
  }
  if (digits.length <= 3) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};
