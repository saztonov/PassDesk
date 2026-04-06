import {
  normalizeKig,
  normalizePassportDepartmentCode,
  normalizePatentNumber,
  normalizePhoneNumber,
  normalizeRussianPassportNumber,
} from "@/modules/employees/lib/employeeFormFormatters";

const DATE_FIELDS = new Set([
  "birthDate",
  "passportDate",
  "patentIssueDate",
  "kigEndDate",
  "passportExpiryDate",
  "insurancePolicyDate",
  "plannedExitDate",
]);

const UUID_FIELDS = new Set(["positionId", "citizenshipId", "birthCountryId"]);
const BOOLEAN_FIELDS = new Set(["isFired", "isInactive"]);

export const formatEmployeeFormPayload = (
  values = {},
  { isDraft = false, includeCounterpartyId = false } = {},
) => {
  const formatted = {};

  Object.keys(values).forEach((key) => {
    if (key === "constructionSiteId") {
      return;
    }

    if (key === "counterpartyId" && !includeCounterpartyId) {
      return;
    }

    const value = values[key];

    if (BOOLEAN_FIELDS.has(key)) {
      formatted[key] = !!value;
      return;
    }

    if (value === "" || value === undefined || value === null) {
      formatted[key] = null;
      return;
    }

    if (DATE_FIELDS.has(key)) {
      formatted[key] =
        value && value.format ? value.format("YYYY-MM-DD") : null;
      return;
    }

    if (key === "phone") {
      formatted[key] = normalizePhoneNumber(value);
      return;
    }

    if (key === "kig") {
      formatted[key] = normalizeKig(value);
      return;
    }

    if (key === "bankAccountNumber") {
      formatted[key] = value ? value.replace(/[^\d]/g, "") : null;
      return;
    }

    if (key === "bankBik") {
      formatted[key] = value ? value.replace(/[^\d]/g, "") : null;
      return;
    }

    if (key === "patentNumber") {
      formatted[key] = normalizePatentNumber(value);
      return;
    }

    if (key === "inn" || key === "snils") {
      formatted[key] = value ? value.replace(/[^\d]/g, "") : null;
      return;
    }

    if (key === "passportNumber") {
      formatted[key] =
        values.passportType === "russian"
          ? normalizeRussianPassportNumber(value)
          : value;
      return;
    }

    if (key === "passportDepartmentCode") {
      formatted[key] = normalizePassportDepartmentCode(value);
      return;
    }

    if (UUID_FIELDS.has(key)) {
      formatted[key] = value && String(value).trim() ? value : null;
      return;
    }

    formatted[key] = value;
  });

  formatted.isDraft = isDraft;
  return formatted;
};
