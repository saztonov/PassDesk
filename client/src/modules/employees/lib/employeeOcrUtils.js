import dayjs from "dayjs";

export const OCR_FIELD_LABELS = {
  lastName: "Фамилия",
  firstName: "Имя",
  middleName: "Отчество",
  birthDate: "Дата рождения",
  gender: "Пол",
  citizenshipId: "Гражданство",
  passportNumber: "№ паспорта",
  passportDate: "Дата выдачи паспорта",
  passportIssuer: "Кем выдан паспорт",
  passportExpiryDate: "Дата окончания паспорта",
  inn: "ИНН",
  snils: "СНИЛС",
  kig: "КИГ",
  kigEndDate: "Срок окончания КИГ",
  patentNumber: "Номер патента",
  patentIssueDate: "Дата выдачи патента",
  blankNumber: "Номер бланка",
  bankAccountNumber: "Номер банковского счета",
};

const DATE_FORMAT = "YYYY-MM-DD";

export const normalizeString = (value) => String(value || "").trim();

const capitalizeFirstLetter = (value = "") =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const toDisplayName = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .split(/(\s|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      return capitalizeFirstLetter(part);
    })
    .join("");
};

const toDigits = (value, maxLength = 64) =>
  normalizeString(value).replace(/[^\d]/g, "").slice(0, maxLength);

const toAlphaNumeric = (value, maxLength = 64) =>
  normalizeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);

const LOOKALIKE_CYRILLIC_TO_LATIN = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
};

const normalizePassportIdentifier = (value, maxLength = 16) => {
  const normalized = normalizeString(value)
    .toUpperCase()
    .replace(/[АВЕКМНОРСТУХ]/g, (symbol) => LOOKALIKE_CYRILLIC_TO_LATIN[symbol] || symbol)
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);

  return normalized || "";
};

const formatSnils = (value) => {
  const digits = toDigits(value, 11);
  if (!digits) return null;
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length < 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9, 11)}`;
};

const formatInn = (value) => {
  const digits = toDigits(value, 12);
  if (!digits) return null;

  if (digits.length <= 4) return digits;
  if (digits.length <= 9) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 10) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 12)}`;
};

const formatPatentNumber = (value) => {
  const digits = toDigits(value, 12);
  if (!digits) return null;
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} №${digits.slice(2)}`;
};

const formatBlankNumber = (value) => {
  const raw = normalizeString(value).toUpperCase();
  if (!raw) return null;

  const letters = raw.replace(/[^A-ZА-ЯЁ]/g, "").slice(0, 2);
  const digits = raw.replace(/[^\d]/g, "").slice(0, 7);
  const formatted = `${letters}${digits}`;
  return formatted || null;
};

const normalizeGenderForCompare = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (["male", "m", "м", "муж", "мужской"].includes(normalized)) {
    return "male";
  }
  if (["female", "f", "ж", "жен", "женский"].includes(normalized)) {
    return "female";
  }
  return normalized;
};

const mapOcrSexToFormGender = (ocrValue) => {
  const normalized = normalizeString(ocrValue).toUpperCase();
  if (normalized === "M") return "male";
  if (normalized === "F") return "female";
  return null;
};

const resolveCitizenshipIdByOcrCode = (citizenships = [], ocrValue = "") => {
  const normalized = normalizeString(ocrValue).toUpperCase();
  if (!normalized) return null;

  const byCode = citizenships.find((item) => {
    const code = normalizeString(item.code).toUpperCase();
    if (!code) return false;

    return (
      code === normalized ||
      (normalized === "RUS" && code === "RU") ||
      (normalized === "RU" && code === "RUS")
    );
  });

  if (byCode) return byCode.id;

  if (normalized === "RU" || normalized === "RUS") {
    const byName = citizenships.find((item) =>
      normalizeString(item.name).toLowerCase().includes("рос"),
    );
    return byName?.id || null;
  }

  return null;
};

const toIsoDateStringFromLooseInput = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  const toIso = (yearValue, monthValue, dayValue) => {
    const yearNumber = Number(yearValue);
    const monthNumber = Number(monthValue);
    const dayNumber = Number(dayValue);

    if (
      !Number.isInteger(yearNumber) ||
      !Number.isInteger(monthNumber) ||
      !Number.isInteger(dayNumber)
    ) {
      return null;
    }

    if (
      yearNumber < 1900 ||
      yearNumber > 2100 ||
      monthNumber < 1 ||
      monthNumber > 12 ||
      dayNumber < 1 ||
      dayNumber > 31
    ) {
      return null;
    }

    return `${String(yearNumber).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
  };

  const ymdMatch = normalized.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return toIso(year, month, day);
  }

  const dmyMatch = normalized.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmyMatch) {
    let [, day, month, year] = dmyMatch;
    if (year.length === 2) {
      const twoDigitYear = Number(year);
      year = String(twoDigitYear >= 70 ? 1900 + twoDigitYear : 2000 + twoDigitYear);
    }
    return toIso(year, month, day);
  }

  return null;
};

const toDayjsOrNull = (value) => {
  if (!value) return null;

  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value : null;
  }

  const normalized = normalizeString(value);
  if (!normalized) return null;

  const normalizedDate = toIsoDateStringFromLooseInput(normalized);
  if (normalizedDate) {
    const parsed = dayjs(normalizedDate, "YYYY-MM-DD", true);
    return parsed.isValid() ? parsed : null;
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) {
    const parsed = dayjs(normalized, "DD.MM.YYYY", true);
    return parsed.isValid() ? parsed : null;
  }

  const parsed = dayjs(normalized);
  return parsed.isValid() ? parsed : null;
};

const toDateOutputValue = (value, dateOutputMode = "dayjs") => {
  const parsed = toDayjsOrNull(value);
  if (!parsed) return null;
  if (dateOutputMode === "string") {
    return parsed.format("DD.MM.YYYY");
  }
  return parsed;
};

const formatPassportNumber = ({ series, number }) => {
  const seriesRaw = normalizeString(series);
  const numberRaw = normalizeString(number);
  const rawCandidates = [seriesRaw, numberRaw].filter(Boolean);

  if (rawCandidates.length > 0) {
    const rawWithLetters = rawCandidates.find((candidate) =>
      /[A-Za-zА-Яа-яЁё]/.test(candidate),
    );
    if (rawWithLetters) {
      const mergedRaw =
        seriesRaw && numberRaw && seriesRaw !== numberRaw
          ? numberRaw.includes(seriesRaw)
            ? numberRaw
            : seriesRaw.includes(numberRaw)
              ? seriesRaw
              : `${seriesRaw}${numberRaw}`
          : rawWithLetters;
      const identifier = normalizePassportIdentifier(mergedRaw, 16);
      return identifier || null;
    }
  }

  const seriesDigits = toDigits(seriesRaw, 4);
  const numberDigits = toDigits(numberRaw, 16);

  if (!seriesDigits && !numberDigits) return null;
  if (!seriesDigits) return numberDigits || null;
  if (!numberDigits) return seriesDigits || null;

  return `${seriesDigits} №${numberDigits.slice(0, 6)}`;
};

const normalizeKig = (value) => {
  const raw = normalizeString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return null;

  const letters = raw.replace(/[^A-Z]/g, "").slice(0, 2);
  const digits = raw.replace(/[^\d]/g, "").slice(0, 7);

  return `${letters}${digits}`.slice(0, 9) || null;
};

export const resolveOcrDocumentTypeByFile = (
  fileDocumentType,
  passportTypeValue,
) => {
  const normalized = normalizeString(fileDocumentType).toLowerCase();
  if (!normalized) return null;

  if (normalized === "passport") {
    return passportTypeValue === "foreign" ? "foreign_passport" : "passport_rf";
  }
  if (normalized === "passport_translation") {
    return "foreign_passport";
  }
  if (
    normalized === "patent" ||
    normalized === "patent_front" ||
    normalized === "patent_back" ||
    normalized === "patent_payment_receipt"
  ) {
    return "patent";
  }
  if (normalized === "kig") return "kig";
  if (normalized === "visa") return "visa";
  if (normalized === "inn_document" || normalized === "inn") return "inn";
  if (normalized === "snils_card") return "snils";
  if (normalized === "bank_details") return "bank_details";

  return null;
};

export const isAutoOcrSupportedFileType = (fileDocumentType) =>
  Boolean(resolveOcrDocumentTypeByFile(fileDocumentType, "russian"));

export const buildFormPatchFromOcr = ({
  normalized = {},
  citizenships = [],
  dateOutputMode = "dayjs",
}) => {
  const patch = {};

  const lastName = toDisplayName(normalized.lastName);
  const firstName = toDisplayName(normalized.firstName);
  const middleName = toDisplayName(normalized.middleName);
  const birthDate = toDateOutputValue(normalized.birthDate, dateOutputMode);
  const gender = mapOcrSexToFormGender(normalized.sex);
  const citizenshipId = resolveCitizenshipIdByOcrCode(
    citizenships,
    normalized.citizenship,
  );

  if (lastName) patch.lastName = lastName;
  if (firstName) patch.firstName = firstName;
  if (middleName) patch.middleName = middleName;
  if (birthDate) patch.birthDate = birthDate;
  if (gender) patch.gender = gender;
  if (citizenshipId) patch.citizenshipId = citizenshipId;

  const passportNumber = formatPassportNumber({
    series: normalized.passportSeries,
    number: normalized.passportNumber,
  });

  const fallbackPassportNumber =
    !passportNumber && normalized.passportNumber
      ? normalizeString(normalized.passportNumber)
      : null;

  if (passportNumber || fallbackPassportNumber) {
    patch.passportNumber = passportNumber || fallbackPassportNumber;
  }

  const passportDate = toDateOutputValue(
    normalized.passportIssuedAt,
    dateOutputMode,
  );
  const passportExpiryDate = toDateOutputValue(
    normalized.passportExpiryDate,
    dateOutputMode,
  );

  if (passportDate) patch.passportDate = passportDate;
  if (passportExpiryDate) patch.passportExpiryDate = passportExpiryDate;

  if (normalizeString(normalized.passportIssuedBy)) {
    patch.passportIssuer = normalizeString(normalized.passportIssuedBy);
  }

  const inn = formatInn(normalized.inn);
  if (inn) patch.inn = inn;

  const snils = formatSnils(normalized.snils);
  if (snils) patch.snils = snils;

  const kig = normalizeKig(normalized.kig);
  if (kig) patch.kig = kig;

  const kigEndDate = toDateOutputValue(normalized.kigEndDate, dateOutputMode);
  if (kigEndDate) patch.kigEndDate = kigEndDate;

  const patentNumber = formatPatentNumber(normalized.patentNumber);
  if (patentNumber) patch.patentNumber = patentNumber;

  const patentIssueDate = toDateOutputValue(
    normalized.patentIssueDate,
    dateOutputMode,
  );
  if (patentIssueDate) patch.patentIssueDate = patentIssueDate;

  const blankNumber = formatBlankNumber(normalized.blankNumber);
  if (blankNumber) patch.blankNumber = blankNumber;

  const bankAccountNumber = toDigits(normalized.bankAccountNumber, 20);
  if (bankAccountNumber) patch.bankAccountNumber = bankAccountNumber;

  return patch;
};

const normalizeDateForCompare = (value) => {
  if (!value) return "";
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value.format(DATE_FORMAT) : "";
  }

  const parsed = toDayjsOrNull(value);
  return parsed ? parsed.format(DATE_FORMAT) : normalizeString(value);
};

export const isEmptyFormValue = (value) => {
  if (value === null || value === undefined) return true;
  if (dayjs.isDayjs(value)) return !value.isValid();
  return normalizeString(value) === "";
};

export const normalizeFormValueForCompare = (fieldName, value) => {
  if (isEmptyFormValue(value)) {
    return "";
  }

  if (
    fieldName === "birthDate" ||
    fieldName === "passportDate" ||
    fieldName === "passportExpiryDate" ||
    fieldName === "kigEndDate" ||
    fieldName === "patentIssueDate"
  ) {
    return normalizeDateForCompare(value);
  }

  if (fieldName === "gender") {
    return normalizeGenderForCompare(value);
  }

  if (fieldName === "passportNumber") {
    const normalizedPassport = normalizePassportIdentifier(value, 32);
    return normalizedPassport || toDigits(value, 16);
  }

  if (fieldName === "inn") {
    return toDigits(value, 12);
  }

  if (fieldName === "snils") {
    return toDigits(value, 11);
  }

  if (fieldName === "kig") {
    return normalizeKig(value) || "";
  }

  if (fieldName === "patentNumber") {
    return toDigits(value, 12);
  }

  if (fieldName === "blankNumber") {
    return normalizeString(value).toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "");
  }

  if (fieldName === "bankAccountNumber") {
    return toDigits(value, 20);
  }

  return normalizeString(value).toLowerCase();
};

export const buildOcrApplyPlan = ({ currentValues = {}, ocrPatch = {} }) => {
  const autoFillPatch = {};
  const conflicts = {};

  Object.entries(ocrPatch).forEach(([fieldName, ocrValue]) => {
    if (isEmptyFormValue(ocrValue)) {
      return;
    }

    const currentValue = currentValues[fieldName];
    if (isEmptyFormValue(currentValue)) {
      autoFillPatch[fieldName] = ocrValue;
      return;
    }

    const currentNormalized = normalizeFormValueForCompare(
      fieldName,
      currentValue,
    );
    const ocrNormalized = normalizeFormValueForCompare(fieldName, ocrValue);

    if (currentNormalized !== ocrNormalized) {
      conflicts[fieldName] = {
        fieldName,
        fieldLabel: OCR_FIELD_LABELS[fieldName] || fieldName,
        currentValue,
        ocrValue,
      };
    }
  });

  return {
    autoFillPatch,
    conflicts,
  };
};
