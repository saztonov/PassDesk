export const formatKig = (value) => {
  if (!value) return value;
  const normalized = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = normalized.replace(/[^A-Z]/g, "");
  const digits = normalized.replace(/[^\d]/g, "");

  if (!letters && digits) {
    return digits.slice(0, 16);
  }

  return `${letters.slice(0, 2)}${digits.slice(0, 7)}`.slice(0, 9);
};

export const normalizePhoneNumber = (value) => {
  if (!value) return value;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

export const normalizeKig = (value) => {
  if (!value) return value;
  const normalized = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = normalized.replace(/[^A-Z]/g, "");
  const digits = normalized.replace(/[^\d]/g, "");

  if (!letters && digits) {
    return digits.slice(0, 16);
  }

  return `${letters.slice(0, 2)}${digits.slice(0, 7)}`.slice(0, 9);
};

export const formatBankAccountNumber = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "").slice(0, 20);
};

export const normalizeBankAccountNumber = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "");
};

export const formatPatentNumber = (value) => {
  if (!value) return value;

  const cleaned = value.replace(/[^\d№]/g, "");
  const numbersOnly = cleaned.replace(/№/g, "");
  const limited = numbersOnly.slice(0, 12);

  if (limited.length === 0) {
    return "";
  }
  if (limited.length <= 2) {
    return limited;
  }

  return `${limited.slice(0, 2)} №${limited.slice(2)}`;
};

export const normalizePatentNumber = (value) => {
  if (!value) return value;
  return value.replace(/\s/g, "");
};

export const normalizeRussianPassportNumber = (value) => {
  if (!value) return value;
  return value.replace(/[\s№]/g, "");
};

export const formatPassportDepartmentCode = (value) => {
  if (!value) return value;

  const digits = String(value).replace(/[^\d]/g, "").slice(0, 6);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

export const normalizePassportDepartmentCode = (value) => {
  if (!value) return value;
  return formatPassportDepartmentCode(value);
};
