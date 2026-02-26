export const noAutoFillProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
  onFocus: (e) => {
    if (e.target.hasAttribute("readonly")) {
      setTimeout(() => {
        e.target.removeAttribute("readonly");
      }, 120);
    }
  },
  readOnly: true,
};

export const createAntiAutofillIds = () => ({
  lastName: `desktop_last_${Math.random().toString(36).slice(2, 9)}`,
  firstName: `desktop_first_${Math.random().toString(36).slice(2, 9)}`,
  middleName: `desktop_middle_${Math.random().toString(36).slice(2, 9)}`,
  phone: `desktop_phone_${Math.random().toString(36).slice(2, 9)}`,
  registrationAddress: `desktop_reg_addr_${Math.random().toString(36).slice(2, 9)}`,
});

export const formatPhoneNumber = (value) => {
  if (!value) return "";

  const phoneNumber = String(value).replace(/[^\d]/g, "");
  if (!phoneNumber) return "";

  let normalized = phoneNumber;
  if (normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  } else if (!normalized.startsWith("7")) {
    normalized = `7${normalized}`;
  }

  normalized = normalized.slice(0, 11);
  const local = normalized.slice(1);

  if (local.length === 0) {
    return "+7";
  }
  if (local.length <= 3) {
    return `+7 (${local}`;
  }
  if (local.length <= 6) {
    return `+7 (${local.slice(0, 3)}) ${local.slice(3)}`;
  }
  if (local.length <= 8) {
    return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8, 10)}`;
};

export const normalizePhoneNumber = (value) => {
  if (!value) return value;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

export const formatSnils = (value) => {
  if (!value) return value;
  const snils = value.replace(/[^\d]/g, "");
  const snilsLength = snils.length;

  if (snilsLength < 4) {
    return snils;
  }
  if (snilsLength < 7) {
    return `${snils.slice(0, 3)}-${snils.slice(3)}`;
  }
  if (snilsLength < 10) {
    return `${snils.slice(0, 3)}-${snils.slice(3, 6)}-${snils.slice(6)}`;
  }
  return `${snils.slice(0, 3)}-${snils.slice(3, 6)}-${snils.slice(6, 9)} ${snils.slice(9, 11)}`;
};

export const formatKig = (value) => {
  if (!value) return value;
  return value.replace(/[^\d]/g, "").slice(0, 7);
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

export const formatInn = (value) => {
  if (!value) return value;
  const inn = value.replace(/[^\d]/g, "");
  const innLength = inn.length;

  if (innLength <= 4) {
    return inn;
  }
  if (innLength <= 9) {
    return `${inn.slice(0, 4)}-${inn.slice(4)}`;
  }
  if (innLength === 10) {
    return `${inn.slice(0, 4)}-${inn.slice(4, 9)}-${inn.slice(9)}`;
  }
  if (innLength <= 10) {
    return `${inn.slice(0, 4)}-${inn.slice(4, 10)}`;
  }
  return `${inn.slice(0, 4)}-${inn.slice(4, 10)}-${inn.slice(10, 12)}`;
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

export const formatRussianPassportNumber = (value) => {
  if (!value) return value;

  const cleaned = value.replace(/[^\d№]/g, "");
  const numbersOnly = cleaned.replace(/№/g, "");
  const limited = numbersOnly.slice(0, 10);

  if (limited.length <= 4) {
    return limited;
  }

  return `${limited.slice(0, 4)} №${limited.slice(4)}`;
};

export const normalizeRussianPassportNumber = (value) => {
  if (!value) return value;
  return value.replace(/[\s№]/g, "");
};

export const formatBlankNumber = (value) => {
  if (!value) return value;

  let blank = value.toUpperCase();
  blank = blank.replace(/[^А-ЯЁ0-9]/g, "");

  const letters = blank.replace(/[^А-ЯЁ]/g, "");
  const numbers = blank.replace(/[^0-9]/g, "");

  const limitedLetters = letters.slice(0, 2);
  const limitedNumbers = numbers.slice(0, 7);

  return `${limitedLetters}${limitedNumbers}`;
};
