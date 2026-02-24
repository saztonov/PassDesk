export const formatKig = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "").slice(0, 7);
};

export const normalizePhoneNumber = (value) => {
  if (!value) return value;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

export const normalizeKig = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "");
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
