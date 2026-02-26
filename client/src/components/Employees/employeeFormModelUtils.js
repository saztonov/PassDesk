import dayjs from "dayjs";

const FIRED_STATUS_NAMES = new Set([
  "status_active_fired",
  "status_active_fired_compl",
]);

const resolveEmployeeActivityFlags = (statusMappings = []) => {
  let isFired = false;
  let isInactive = false;

  if (!Array.isArray(statusMappings)) {
    return { isFired, isInactive };
  }

  const statusMapping = statusMappings.find((mapping) => {
    const mappingGroup = mapping.statusGroup || mapping.status_group;
    return mappingGroup === "status_active";
  });

  if (!statusMapping) {
    return { isFired, isInactive };
  }

  const statusObj = statusMapping.status || statusMapping.Status;
  const statusName = statusObj?.name;

  if (FIRED_STATUS_NAMES.has(statusName)) {
    isFired = true;
  } else if (statusName === "status_active_inactive") {
    isInactive = true;
  }

  return { isFired, isInactive };
};

const normalizeDateField = (value) => {
  if (!value) return null;
  if (value && value.format) return value.format("YYYY-MM-DD");
  if (typeof value === "string" && value.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    const date = dayjs(value, "DD.MM.YYYY", true);
    return date.isValid() ? date.format("YYYY-MM-DD") : null;
  }
  return null;
};

export const normalizeDigitsOnly = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "");
};

export const buildEmployeeInitialFormData = ({
  employee,
  isMobile = false,
  formatInn,
  formatSnils,
  formatPhoneNumber,
  formatBankAccountNumber,
  formatKig,
  formatPatentNumber,
  formatBlankNumber,
  formatRussianPassportNumber,
}) => {
  if (!employee) {
    return null;
  }

  const mapping = employee.employeeCounterpartyMappings?.[0];
  const { isFired, isInactive } = resolveEmployeeActivityFlags(
    employee.statusMappings,
  );

  const birthDateValue = isMobile
    ? employee.birthDate
      ? dayjs(employee.birthDate).format("DD.MM.YYYY")
      : null
    : employee.birthDate
      ? dayjs(employee.birthDate)
      : null;

  const passportDateValue = isMobile
    ? employee.passportDate
      ? dayjs(employee.passportDate).format("DD.MM.YYYY")
      : null
    : employee.passportDate
      ? dayjs(employee.passportDate)
      : null;

  const patentIssueDateValue = isMobile
    ? employee.patentIssueDate
      ? dayjs(employee.patentIssueDate).format("DD.MM.YYYY")
      : null
    : employee.patentIssueDate
      ? dayjs(employee.patentIssueDate)
      : null;

  const kigEndDateValue = isMobile
    ? employee.kigEndDate
      ? dayjs(employee.kigEndDate).format("DD.MM.YYYY")
      : null
    : employee.kigEndDate
      ? dayjs(employee.kigEndDate)
      : null;

  return {
    ...employee,
    birthDate: birthDateValue,
    passportDate: passportDateValue,
    patentIssueDate: patentIssueDateValue,
    kigEndDate: kigEndDateValue,
    constructionSiteId: mapping?.constructionSiteId || null,
    counterpartyId: mapping?.counterpartyId || null,
    birthCountryId: employee.birthCountryId || null,
    isFired,
    isInactive,
    inn: employee.inn ? formatInn(employee.inn) : null,
    snils: employee.snils ? formatSnils(employee.snils) : null,
    phone: employee.phone ? formatPhoneNumber(employee.phone) : null,
    bankAccountNumber: employee.bankAccountNumber
      ? formatBankAccountNumber(employee.bankAccountNumber)
      : null,
    kig: employee.kig ? formatKig(employee.kig) : null,
    patentNumber: employee.patentNumber
      ? formatPatentNumber(employee.patentNumber)
      : null,
    blankNumber: employee.blankNumber
      ? formatBlankNumber(employee.blankNumber)
      : null,
    passportNumber:
      !isMobile &&
      employee.passportType === "russian" &&
      employee.passportNumber
        ? formatRussianPassportNumber(employee.passportNumber)
        : employee.passportNumber,
  };
};

export const buildSaveNormalizedValues = ({ values, normalizers }) => ({
  ...values,
  birthDate: normalizeDateField(values.birthDate),
  passportDate: normalizeDateField(values.passportDate),
  patentIssueDate: normalizeDateField(values.patentIssueDate),
  kigEndDate: normalizeDateField(values.kigEndDate),
  passportExpiryDate: normalizeDateField(values.passportExpiryDate),
  phone: normalizers.normalizePhoneNumber(values.phone),
  snils: normalizers.normalizeSnils(values.snils),
  inn: normalizers.normalizeInn(values.inn),
  bankAccountNumber: normalizers.normalizeBankAccountNumber(
    values.bankAccountNumber,
  ),
  kig: normalizers.normalizeKig(values.kig),
  patentNumber: normalizers.normalizePatentNumber(values.patentNumber),
  passportNumber:
    values.passportType === "russian"
      ? normalizers.normalizeRussianPassportNumber(values.passportNumber)
      : values.passportNumber,
});

export const buildDraftNormalizedValues = ({ values, normalizers }) => ({
  ...values,
  birthDate: normalizeDateField(values.birthDate),
  passportDate: normalizeDateField(values.passportDate),
  patentIssueDate: normalizeDateField(values.patentIssueDate),
  kigEndDate: normalizeDateField(values.kigEndDate),
  passportExpiryDate: normalizeDateField(values.passportExpiryDate),
  phone: values.phone ? normalizers.normalizePhoneNumber(values.phone) : null,
  snils: values.snils ? normalizers.normalizeSnils(values.snils) : null,
  inn: values.inn ? normalizers.normalizeInn(values.inn) : null,
  bankAccountNumber: values.bankAccountNumber
    ? normalizers.normalizeBankAccountNumber(values.bankAccountNumber)
    : null,
  kig: values.kig ? normalizers.normalizeKig(values.kig) : null,
  patentNumber: values.patentNumber
    ? normalizers.normalizePatentNumber(values.patentNumber)
    : null,
  passportNumber: values.passportNumber
    ? values.passportType === "russian"
      ? normalizers.normalizeRussianPassportNumber(values.passportNumber)
      : values.passportNumber
    : null,
});

export const stripStatusFlags = (values) => {
  const next = { ...values };
  delete next.isFired;
  delete next.isInactive;
  return next;
};
