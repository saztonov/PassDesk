import axios from "axios";
import { AppError } from "../../middleware/errorHandler.js";

const DEFAULT_OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "qwen/qwen3.5-35b-a3b";

const DEFAULT_PROMPTS = {
  passport_rf:
    "Распознай паспорт РФ на фото, даже при плохом качестве, шуме, перспективных искажениях и частичных засветах. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, " +
    "passportSeries, passportNumber, issueDate, authority, departmentCode, birthPlace, expiryDate.",
  foreign_passport:
    "Распознай иностранный паспорт на фото, включая кривую перспективу и шум. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, " +
    "passportNumber, issueDate, authority, expiryDate, birthPlace.",
  patent:
    "Распознай патент на работу на фото (включая сложные условия съемки). " +
    "Если это оборотная сторона и виден номер бланка вида 2 буквы + 7 цифр, верни его в поле blankNumber и НЕ записывай его в patentNumber. " +
    "Верни строго JSON без markdown и пояснений. Поля: patentNumber, issueDate, expiryDate, surname, givenNames, middleName, birthDate, nationality, blankNumber.",
  kig:
    "Распознай карту иностранного гражданина (КИГ) на фото. " +
    "Верни ПОЛНЫЙ номер карты в поле kigNumber, не сокращай его до 7 цифр и не обрезай хвост. " +
    "Верни строго JSON без markdown и пояснений. Поля: kigNumber, expiryDate, surname, givenNames, middleName, birthDate, nationality.",
  inn:
    "Распознай свидетельство ИНН на фото. " +
    "Верни строго JSON без markdown и пояснений. Поля: inn, surname, givenNames, middleName, birthDate.",
  snils:
    "Распознай карточку СНИЛС на фото. " +
    "Верни строго JSON без markdown и пояснений. Поля: snils, surname, givenNames, middleName, birthDate.",
  bank_details:
    "Распознай реквизиты банковского счета на фото документа. " +
    "Верни строго JSON без markdown и пояснений. Поля: bankAccountNumber, bankName, bik, corrAccount, inn.",
  visa:
    "Распознай визу на фото. " +
    "Верни строго JSON без markdown и пояснений. Поля: visaNumber, issueDate, expiryDate, surname, givenNames, nationality, birthDate.",
};

const SUPPORTED_DOCUMENT_TYPES = new Set([
  "passport_rf",
  "foreign_passport",
  "patent",
  "kig",
  "inn",
  "snils",
  "bank_details",
  "visa",
]);

const MALE_VALUES = new Set(["m", "male", "м", "муж", "мужской"]);
const FEMALE_VALUES = new Set(["f", "female", "ж", "жен", "женский"]);

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

export const normalizeDocumentType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (normalized === "passport") return "passport_rf";
  if (normalized === "passport_translation") return "foreign_passport";
  if (
    normalized === "foreignpassport" ||
    normalized === "foreign-passport" ||
    normalized === "passport_foreign"
  ) {
    return "foreign_passport";
  }
  if (
    normalized === "patent_front" ||
    normalized === "patent_back" ||
    normalized === "patent_payment_receipt"
  ) {
    return "patent";
  }
  if (normalized === "inn_document") return "inn";
  if (normalized === "snils_card") return "snils";

  return normalized;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const pad2 = (part) => String(part).padStart(2, "0");
  const toIsoDate = (year, month, day) => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);

    if (
      !Number.isInteger(numericYear) ||
      !Number.isInteger(numericMonth) ||
      !Number.isInteger(numericDay)
    ) {
      return null;
    }

    if (
      numericYear < 1900 ||
      numericYear > 2100 ||
      numericMonth < 1 ||
      numericMonth > 12 ||
      numericDay < 1 ||
      numericDay > 31
    ) {
      return null;
    }

    return `${String(numericYear).padStart(4, "0")}-${pad2(numericMonth)}-${pad2(numericDay)}`;
  };

  const ymdMatch = raw.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const iso = toIsoDate(year, month, day);
    if (iso) return iso;
  }

  const dmyMatch = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmyMatch) {
    let [, day, month, year] = dmyMatch;
    if (year.length === 2) {
      const twoDigit = Number(year);
      year = String(twoDigit >= 70 ? 1900 + twoDigit : 2000 + twoDigit);
    }

    const iso = toIsoDate(year, month, day);
    if (iso) return iso;
  }

  return raw;
};

const normalizeSex = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (MALE_VALUES.has(normalized)) return "M";
  if (FEMALE_VALUES.has(normalized)) return "F";
  return null;
};

const normalizeCitizenship = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes("рос") || normalized === "ru" || normalized === "rus") {
    return "RUS";
  }
  return String(value).trim().toUpperCase();
};

const normalizeDigits = (value, maxLength = 64) => {
  if (!value) return null;
  const normalized = String(value).replace(/[^\d]/g, "").slice(0, maxLength);
  return normalized || null;
};

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
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[АВЕКМНОРСТУХ]/g, (symbol) => LOOKALIKE_CYRILLIC_TO_LATIN[symbol] || symbol)
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);

  return normalized || null;
};

const normalizeAlphaNumeric = (value, maxLength = 64) => {
  if (!value) return null;

  return normalizePassportIdentifier(value, maxLength);
};

const normalizeKigNumber = (value) => {
  if (!value) return null;
  const raw = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = raw.replace(/[^A-Z]/g, "");
  const digits = raw.replace(/[^\d]/g, "");

  if (!letters && digits) {
    return digits.slice(0, 16) || null;
  }

  const result = `${letters.slice(0, 2)}${digits.slice(0, 7)}`.slice(0, 9);
  return result || null;
};

const normalizeBlankIdentifier = (value) => {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");

  const match = normalized.match(/[A-ZА-ЯЁ]{2}\d{6,8}/);
  return match ? match[0] : null;
};

const normalizeLookupKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/g, "");

const valueFrom = (obj, aliases = []) => {
  if (!obj || typeof obj !== "object") return null;

  for (const key of aliases) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const value = String(obj[key]).trim();
      if (value) return value;
    }
  }

  const entries = Object.entries(obj);
  const normalizedAliases = aliases
    .map((alias) => normalizeLookupKey(alias))
    .filter(Boolean);

  for (const alias of normalizedAliases) {
    for (const [objKey, objValue] of entries) {
      if (objValue === undefined || objValue === null) {
        continue;
      }

      const normalizedObjKey = normalizeLookupKey(objKey);
      if (normalizedObjKey === alias) {
        const value = String(objValue).trim();
        if (value) return value;
      }
    }
  }

  for (const alias of normalizedAliases) {
    if (alias.length < 7) {
      continue;
    }

    for (const [objKey, objValue] of entries) {
      if (objValue === undefined || objValue === null) {
        continue;
      }

      const normalizedObjKey = normalizeLookupKey(objKey);
      if (normalizedObjKey && normalizedObjKey.includes(alias)) {
        const value = String(objValue).trim();
        if (value) return value;
      }
    }
  }

  return null;
};

const splitPassportNumber = (combinedValue) => {
  if (!combinedValue) {
    return { series: null, number: null };
  }

  const digitsOnly = combinedValue.replace(/\D/g, "");
  if (digitsOnly.length >= 10) {
    return {
      series: digitsOnly.slice(0, 4),
      number: digitsOnly.slice(4, 10),
    };
  }

  if (digitsOnly.length > 0 && digitsOnly.length <= 6) {
    return { series: null, number: digitsOnly };
  }

  const parts = combinedValue.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      series: parts[0].replace(/\D/g, "") || null,
      number: parts.slice(1).join("").replace(/\D/g, "") || null,
    };
  }

  return { series: null, number: digitsOnly || null };
};

const normalizePassportRf = (parsedJson = {}) => {
  const rawSeries = valueFrom(parsedJson, [
    "passportSeries",
    "passport_series",
    "series",
  ]);
  const rawNumberOnly = valueFrom(parsedJson, [
    "passportNumberOnly",
    "passport_number_only",
    "numberOnly",
    "number_only",
  ]);
  const passportNumberCombined = valueFrom(parsedJson, [
    "passportNumber",
    "passport_number",
    "number",
    "seriesNumber",
    "series_number",
  ]);
  const hasLettersInNumber = /[A-Za-zА-Яа-яЁё]/.test(
    `${rawSeries || ""}${rawNumberOnly || ""}${passportNumberCombined || ""}`,
  );
  const nonRfPassportNumber = normalizePassportIdentifier(
    rawNumberOnly || passportNumberCombined || rawSeries,
    16,
  );

  const split = splitPassportNumber(passportNumberCombined || "");

  return {
    lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
    firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
    middleName: valueFrom(parsedJson, [
      "middleName",
      "middle_name",
      "patronymic",
    ]),
    birthDate: normalizeDate(
      valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
    ),
    sex: normalizeSex(valueFrom(parsedJson, ["sex", "gender"])),
    citizenship: normalizeCitizenship(
      valueFrom(parsedJson, ["nationality", "citizenship"]),
    ),
    passportSeries: hasLettersInNumber
      ? null
      : normalizeDigits(rawSeries, 4) || split.series,
    passportNumber: hasLettersInNumber
      ? nonRfPassportNumber
      : normalizeDigits(rawNumberOnly, 6) || normalizeDigits(split.number, 6),
    passportIssuedAt: normalizeDate(
      valueFrom(parsedJson, ["issueDate", "issue_date", "passportIssueDate"]),
    ),
    passportIssuedBy: valueFrom(parsedJson, [
      "authority",
      "issuedBy",
      "passportIssuedBy",
    ]),
    passportDepartmentCode: valueFrom(parsedJson, [
      "departmentCode",
      "department_code",
      "passportDepartmentCode",
    ]),
    birthPlace: valueFrom(parsedJson, ["birthPlace", "birth_place"]),
    passportExpiryDate: normalizeDate(
      valueFrom(parsedJson, [
        "expiryDate",
        "expiry_date",
        "passportExpiryDate",
      ]),
    ),
  };
};

const normalizeForeignPassport = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
  birthDate: normalizeDate(
    valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
  ),
  sex: normalizeSex(valueFrom(parsedJson, ["sex", "gender"])),
  citizenship: normalizeCitizenship(
    valueFrom(parsedJson, ["nationality", "citizenship"]),
  ),
  passportSeries: null,
  passportNumber: normalizeAlphaNumeric(
    valueFrom(parsedJson, [
      "passportNumber",
      "passport_number",
      "number",
      "documentNumber",
      "document_number",
    ]),
    16,
  ),
  passportIssuedAt: normalizeDate(
    valueFrom(parsedJson, ["issueDate", "issue_date", "passportIssueDate"]),
  ),
  passportIssuedBy: valueFrom(parsedJson, [
    "authority",
    "issuedBy",
    "passportIssuedBy",
  ]),
  passportDepartmentCode: valueFrom(parsedJson, [
    "departmentCode",
    "department_code",
    "passportDepartmentCode",
  ]),
  birthPlace: valueFrom(parsedJson, ["birthPlace", "birth_place"]),
  passportExpiryDate: normalizeDate(
    valueFrom(parsedJson, ["expiryDate", "expiry_date", "passportExpiryDate"]),
  ),
});

const normalizePatent = (parsedJson = {}) => {
  const rawPatentNumber = valueFrom(parsedJson, [
    "patentNumber",
    "patent_number",
    "number",
    "documentNumber",
    "document_number",
    "patentNo",
    "patent_no",
    "numberPatent",
    "номерПатента",
    "номер патента",
  ]);
  const rawBlankNumber = valueFrom(parsedJson, [
    "blankNumber",
    "blank_number",
    "blankNo",
    "blank_no",
    "blank",
    "номерБланка",
    "номер бланка",
    "бланк",
  ]);

  const normalizedBlankNumber =
    normalizeBlankIdentifier(rawBlankNumber) ||
    normalizeBlankIdentifier(rawPatentNumber);
  const normalizedPatentNumber = normalizeDigits(rawPatentNumber, 12);
  const patentNumber =
    normalizedBlankNumber && normalizedPatentNumber?.length <= 8
      ? null
      : normalizedPatentNumber;

  return {
    lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
    firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
    middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
    birthDate: normalizeDate(
      valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
    ),
    citizenship: normalizeCitizenship(
      valueFrom(parsedJson, ["nationality", "citizenship"]),
    ),
    patentNumber,
    patentIssueDate: normalizeDate(
      valueFrom(parsedJson, [
        "issueDate",
        "issue_date",
        "patentIssueDate",
        "dateIssue",
        "date_issue",
        "issuedAt",
        "issued_at",
        "dateOfIssue",
        "date_of_issue",
        "датаВыдачи",
        "дата выдачи",
      ]),
    ),
    patentExpiryDate: normalizeDate(
      valueFrom(parsedJson, [
        "expiryDate",
        "expiry_date",
        "patentExpiryDate",
        "dateExpiry",
        "date_expiry",
        "validUntil",
        "valid_until",
        "датаОкончания",
        "дата окончания",
        "действителенДо",
        "действителен до",
      ]),
    ),
    blankNumber: normalizedBlankNumber,
  };
};

const normalizeKig = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
  birthDate: normalizeDate(
    valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
  ),
  citizenship: normalizeCitizenship(
    valueFrom(parsedJson, ["nationality", "citizenship"]),
  ),
  kig: normalizeKigNumber(
    valueFrom(parsedJson, ["kigNumber", "kig_number", "number"]),
  ),
  kigEndDate: normalizeDate(
    valueFrom(parsedJson, ["expiryDate", "expiry_date", "kigExpiryDate"]),
  ),
});

const normalizeInn = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
  birthDate: normalizeDate(
    valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
  ),
  inn: normalizeDigits(valueFrom(parsedJson, ["inn", "innNumber", "inn_number"]), 12),
});

const normalizeSnils = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
  birthDate: normalizeDate(
    valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
  ),
  snils: normalizeDigits(
    valueFrom(parsedJson, ["snils", "snilsNumber", "snils_number"]),
    11,
  ),
});

const normalizeBankDetails = (parsedJson = {}) => ({
  bankAccountNumber: normalizeDigits(
    valueFrom(parsedJson, ["bankAccountNumber", "accountNumber", "account", "raschetniySchet"]),
    20,
  ),
  bankName: valueFrom(parsedJson, ["bankName", "bank", "name"]),
  bankInn: normalizeDigits(valueFrom(parsedJson, ["inn", "bankInn", "bank_inn"]), 12),
  bankBik: normalizeDigits(valueFrom(parsedJson, ["bik", "bankBik", "bank_bik"]), 9),
  bankCorrAccount: normalizeDigits(
    valueFrom(parsedJson, ["corrAccount", "correspondentAccount", "ks"]),
    20,
  ),
});

const normalizeVisa = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  birthDate: normalizeDate(
    valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth"]),
  ),
  citizenship: normalizeCitizenship(
    valueFrom(parsedJson, ["nationality", "citizenship"]),
  ),
  visaNumber: normalizeAlphaNumeric(
    valueFrom(parsedJson, ["visaNumber", "visa_number", "number"]),
    16,
  ),
  visaIssueDate: normalizeDate(
    valueFrom(parsedJson, ["issueDate", "issue_date", "visaIssueDate"]),
  ),
  visaExpiryDate: normalizeDate(
    valueFrom(parsedJson, ["expiryDate", "expiry_date", "visaExpiryDate"]),
  ),
});

const normalizeResponseByDocumentType = (documentType, parsedJson) => {
  if (documentType === "passport_rf") return normalizePassportRf(parsedJson);
  if (documentType === "foreign_passport") {
    return normalizeForeignPassport(parsedJson);
  }
  if (documentType === "patent") return normalizePatent(parsedJson);
  if (documentType === "kig") return normalizeKig(parsedJson);
  if (documentType === "inn") return normalizeInn(parsedJson);
  if (documentType === "snils") return normalizeSnils(parsedJson);
  if (documentType === "bank_details") return normalizeBankDetails(parsedJson);
  if (documentType === "visa") return normalizeVisa(parsedJson);
  return {};
};

const extractJsonText = (raw) => {
  if (!raw) return null;

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return raw.slice(firstBrace, lastBrace + 1);
};

const stripInvalidControlChars = (value = "") =>
  String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const tryParseKeyValuePairs = (jsonLikeText = "") => {
  const parsed = {};
  const pairRegex =
    /"?([A-Za-zА-Яа-яЁё0-9_.\-\s]+)"?\s*[:=]\s*("(?:[^"\\]|\\.)*"|null|true|false|-?\d+(?:\.\d+)?)/g;

  let match;
  while ((match = pairRegex.exec(jsonLikeText)) !== null) {
    const key = String(match[1] || "").trim();
    const rawValue = String(match[2] || "").trim();
    if (!key) {
      continue;
    }

    if (rawValue === "null") {
      parsed[key] = null;
      continue;
    }
    if (rawValue === "true") {
      parsed[key] = true;
      continue;
    }
    if (rawValue === "false") {
      parsed[key] = false;
      continue;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      parsed[key] = Number(rawValue);
      continue;
    }

    try {
      parsed[key] = JSON.parse(rawValue);
    } catch {
      parsed[key] = rawValue.replace(/^"|"$/g, "");
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
};

const tryParseLineKeyValuePairs = (text = "") => {
  const parsed = {};
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /^["']?(.+?)["']?\s*(?::|=|\s[-–—]\s)\s*(.+?)\s*,?$/,
    );
    if (!match) {
      continue;
    }

    const key = String(match[1] || "").trim();
    let rawValue = String(match[2] || "").trim();
    if (!key || !rawValue) {
      continue;
    }

    if (rawValue.endsWith(",")) {
      rawValue = rawValue.slice(0, -1).trim();
    }

    if (rawValue === "null") {
      parsed[key] = null;
      continue;
    }
    if (rawValue === "true") {
      parsed[key] = true;
      continue;
    }
    if (rawValue === "false") {
      parsed[key] = false;
      continue;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      parsed[key] = Number(rawValue);
      continue;
    }

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      const unquoted = rawValue.slice(1, -1);
      try {
        parsed[key] = JSON.parse(`"${unquoted.replace(/"/g, '\\"')}"`);
      } catch {
        parsed[key] = unquoted;
      }
      continue;
    }

    parsed[key] = rawValue;
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
};

const parseStructuredJson = (content) => {
  const jsonText = extractJsonText(content);
  if (!jsonText) {
    return tryParseLineKeyValuePairs(content);
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    const sanitized = stripInvalidControlChars(jsonText)
      .replace(/,\s*([}\]])/g, "$1")
      .trim();

    try {
      return JSON.parse(sanitized);
    } catch {
      return (
        tryParseKeyValuePairs(sanitized) || tryParseLineKeyValuePairs(sanitized)
      );
    }
  }
};

const extractResponseContent = (responseData) => {
  const messageContent = responseData?.choices?.[0]?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  const textContent = responseData?.choices?.[0]?.text;
  return typeof textContent === "string" ? textContent : "";
};

const ensureOcrEnabled = () => {
  const enabled = parseBoolean(process.env.OCR_ENABLED, true);
  if (!enabled) {
    throw new AppError("OCR отключен в конфигурации сервера", 503);
  }
};

const getOcrConfig = () => {
  const provider = (process.env.OCR_PROVIDER || "openrouter")
    .trim()
    .toLowerCase();
  const apiKey = process.env.OCR_API_KEY || process.env.OCR_OPENROUTER_API_KEY;
  const endpoint =
    process.env.OCR_OPENROUTER_ENDPOINT || DEFAULT_OPENROUTER_ENDPOINT;
  const defaultModel =
    process.env.OCR_MODEL ||
    process.env.OCR_OPENROUTER_MODEL ||
    DEFAULT_OPENROUTER_MODEL;
  const timeoutMs = Number(process.env.OCR_REQUEST_TIMEOUT_MS || 60000);
  const referer = process.env.OCR_OPENROUTER_HTTP_REFERER || "";
  const appTitle = process.env.OCR_OPENROUTER_APP_TITLE || "";

  if (provider !== "openrouter") {
    throw new AppError(`Неподдерживаемый OCR_PROVIDER: ${provider}`, 500);
  }

  if (!apiKey) {
    throw new AppError("На сервере не задан OCR_API_KEY", 500);
  }

  return {
    provider,
    apiKey,
    endpoint,
    defaultModel,
    timeoutMs,
    referer,
    appTitle,
  };
};

const resolvePromptByDocumentType = (documentType, promptOverride = "") => {
  const normalizedOverride = String(promptOverride || "").trim();
  if (normalizedOverride) {
    return normalizedOverride;
  }

  const envPromptMap = {
    passport_rf: process.env.OCR_PASSPORT_RF_PROMPT,
    foreign_passport: process.env.OCR_FOREIGN_PASSPORT_PROMPT,
    patent: process.env.OCR_PATENT_PROMPT,
    kig: process.env.OCR_KIG_PROMPT,
    inn: process.env.OCR_INN_PROMPT,
    snils: process.env.OCR_SNILS_PROMPT,
    bank_details: process.env.OCR_BANK_DETAILS_PROMPT,
    visa: process.env.OCR_VISA_PROMPT,
  };

  const envPrompt = String(envPromptMap[documentType] || "").trim();
  if (envPrompt) {
    return envPrompt;
  }

  return DEFAULT_PROMPTS[documentType] || DEFAULT_PROMPTS.passport_rf;
};

const buildOpenRouterPayload = ({ model, prompt, imageDataUrl }) => ({
  model,
  temperature: 0.1,
  max_tokens: 1500,
  response_format: {
    type: "json_object",
  },
  messages: [
    {
      role: "system",
      content:
        "Ты извлекаешь структурированные данные из документов. Если поле не найдено, верни null.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt,
        },
        {
          type: "image_url",
          image_url: {
            url: imageDataUrl,
          },
        },
      ],
    },
  ],
});

export const recognizeDocument = async ({
  documentType,
  imageDataUrl,
  model,
  prompt,
}) => {
  ensureOcrEnabled();

  const normalizedDocumentType = normalizeDocumentType(documentType);
  if (!SUPPORTED_DOCUMENT_TYPES.has(normalizedDocumentType)) {
    throw new AppError(
      `Неподдерживаемый тип документа для OCR: ${documentType}`,
      400,
    );
  }

  if (!imageDataUrl || !String(imageDataUrl).startsWith("data:image/")) {
    throw new AppError("OCR поддерживает только изображения", 400);
  }

  const config = getOcrConfig();
  const selectedModel = String(model || "").trim() || config.defaultModel;
  const selectedPrompt = resolvePromptByDocumentType(
    normalizedDocumentType,
    prompt,
  );

  const payload = buildOpenRouterPayload({
    model: selectedModel,
    prompt: selectedPrompt,
    imageDataUrl,
  });

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  if (config.referer) {
    headers["HTTP-Referer"] = config.referer;
  }
  if (config.appTitle) {
    headers["X-Title"] = config.appTitle;
  }

  let response;
  try {
    response = await axios.post(config.endpoint, payload, {
      headers,
      timeout: config.timeoutMs,
    });
  } catch (error) {
    const status = error?.response?.status;
    const providerMessage =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error.message;

    throw new AppError(
      `Ошибка OCR провайдера${status ? ` (${status})` : ""}: ${providerMessage}`,
      502,
    );
  }

  const content = extractResponseContent(response.data);
  const parsedJson = parseStructuredJson(content) || {};
  const normalized = normalizeResponseByDocumentType(
    normalizedDocumentType,
    parsedJson,
  );

  return {
    documentType: normalizedDocumentType,
    provider: config.provider,
    model: selectedModel,
    normalized,
    raw: {
      content,
      json: parsedJson,
    },
  };
};

export const isOcrSupportedDocumentType = (documentType) =>
  SUPPORTED_DOCUMENT_TYPES.has(normalizeDocumentType(documentType));
