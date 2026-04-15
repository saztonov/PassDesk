import axios from "axios";
import { AppError } from "../../middleware/errorHandler.js";
import { Setting } from "../../models/index.js";

const DEFAULT_OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "qwen/qwen3.5-35b-a3b";
const DEFAULT_SCAN_MODEL_CHAIN = [
  "mistralai/mistral-small-3.2-24b-instruct-2506",
  "meta-llama/llama-3.2-11b-vision-instruct",
  DEFAULT_OPENROUTER_MODEL,
];

const NAME_CASE_INSTRUCTION =
  "Поля surname, givenNames, middleName пиши строго на кириллице и с заглавной буквы (Titlecase), например: Иванов, Иван, Иванович. " +
  "Если в документе ФИО написано латиницей или есть MRZ-зона — всё равно верни кириллицу, транслитерировав обратно. Не пиши заглавными буквами целиком. ";

const DATE_FORMAT_INSTRUCTION =
  "Все поля с датами (birthDate, issueDate, expiryDate и др.) возвращай строго в формате YYYY-MM-DD (только дата, без времени, без часов, минут и секунд). Пример: 2022-06-15.";

const DEFAULT_PROMPTS = {
  passport_rf:
    "Распознай паспорт РФ на фото, даже при плохом качестве, шуме, перспективных искажениях и частичных засветах. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Поле sex: верни строго 'M' если мужской пол, 'F' если женский. Не используй другие варианты. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, " +
    "passportSeries, passportNumber, issueDate, authority, departmentCode, birthPlace, expiryDate.",
  foreign_passport:
    "Распознай иностранный паспорт на фото, включая кривую перспективу и шум. " +
    "Если в поле имени указаны имя и отчество вместе (например 'БИЛОЛ ТИМУРОВИЧ'), раздели их: в givenNames пиши только имя (Билол), в middleName — только отчество (Тимурович). " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Поле sex: верни строго 'M' если мужской пол, 'F' если женский. Не используй другие варианты. " +
    "Поле expiryDate: срок действия иностранного паспорта обычно составляет 5 или 10 лет от даты выдачи. Если дата окончания явно указана в документе — бери её. " +
    "Поле birthPlace: если указано только название страны без конкретного города или населённого пункта — верни null. Заполняй birthPlace ТОЛЬКО если указан конкретный город или населённый пункт. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, " +
    "passportNumber, issueDate, authority, expiryDate, birthPlace.",
  passport_translation:
    "На фото нотариальный перевод иностранного паспорта на русский язык. " +
    "Это НЕ оригинал паспорта, а его перевод — страницы содержат русские подписи полей ('Фамилия', 'Имя', 'Гражданство', 'Дата рождения', 'Место рождения', 'Место жительства' и т.д.). " +
    "В шапке документа может быть написано название страны выдачи паспорта (например 'РЕСПУБЛИКА МОЛДОВА', 'АРМЕНИЯ') — НЕ используй это как гражданство и НЕ путай с данными полей. " +
    "Гражданство бери ТОЛЬКО из поля с подписью 'Гражданство' или 'Гражданин(ка)'. " +
    "Место жительства или регистрации бери ТОЛЬКО из поля с подписью 'Место жительства', 'Место проживания', 'Адрес регистрации' или 'Зарегистрирован(а)' — если такого поля нет, верни null для registrationAddress. " +
    "Поле birthPlace: бери ТОЛЬКО из поля с подписью 'Место рождения'. " +
    "ВАЖНО: если в поле 'Место рождения' указано только название страны или республики (например 'РЕСПУБЛИКА МОЛДОВА', 'АРМЕНИЯ', 'УКРАИНА') без конкретного города или населённого пункта — верни null для birthPlace. Заполняй birthPlace ТОЛЬКО если указан конкретный город, район или населённый пункт. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Поле sex: верни строго 'M' если мужской пол, 'F' если женский. Не используй другие варианты. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, " +
    "passportNumber, issueDate, authority, expiryDate, birthPlace, registrationAddress.",
  patent:
    "Распознай патент на работу на фото (включая сложные условия съемки). " +
    "Если это оборотная сторона и виден номер бланка вида 2 буквы + 7 цифр, верни его в поле blankNumber и НЕ записывай его в patentNumber. " +
    "Для blankNumber префикс используй на кириллице: ориентируйся на формат ПР + 7 цифр. Если распозналось ПП, но это номер бланка, исправь на ПР. Не используй латиницу. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: patentNumber, issueDate, expiryDate, surname, givenNames, middleName, birthDate, nationality, blankNumber.",
  kig:
    "На фото карта иностранного гражданина (КИГ). Это может быть как лицевая, так и оборотная сторона. " +
    "Сначала определи сторону документа по содержимому. " +
    "Если это лицевая сторона, на ней есть только номер карты (2 буквы + 7 цифр, например AB0339982). В этом случае верни kigNumber и не придумывай остальные поля. " +
    "Если это оборотная сторона, извлеки ФИО, дату рождения, пол, гражданство, номер карты и срок действия. " +
    "На оборотной стороне может встречаться длинный внутренний числовой идентификатор. НЕ записывай такой номер в kigNumber. Поле kigNumber заполняй только если явно виден карточный номер формата 2 буквы + 7 цифр. " +
    "Для оборотной стороны бери ФИО из кириллической области карты, а не из латинской MRZ-строки. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Верни ПОЛНЫЙ номер карты в поле kigNumber, не сокращай. " +
    "Если какого-то поля на конкретной стороне нет, верни null или не указывай его. " +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, kigNumber, expiryDate.",
  kig_back:
    "На фото оборотная сторона карты иностранного гражданина (КИГ). " +
    "На ней есть ФИО, дата рождения, пол, гражданство, номер карты (77...) и срок действия. " +
    "Бери ФИО из кириллической области карты (НЕ из MRZ-строки внизу с латиницей). ФИО пиши строго на кириллице. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: surname, givenNames, middleName, birthDate, sex, nationality, kigNumber, expiryDate.",
  inn:
    "Распознай свидетельство ИНН на фото. " +
    "Поле ИНН на документе содержит ровно 12 цифр и обычно напечатано крупно в верхней части бланка, отдельной большой строкой. " +
    "Ищи именно основной номер свидетельства рядом с заголовком документа, а не числа из печатей, QR-кодов, штрихкодов, электронной подписи или служебных блоков внизу. " +
    "Обязательно верни эти 12 цифр в поле inn без пробелов и других символов. " +
    "Не подставляй null, если номер читается хотя бы с умеренной уверенностью: выбери наиболее вероятную 12-значную последовательность на документе. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: inn, surname, givenNames, middleName, birthDate.",
  snils:
    "Распознай карточку СНИЛС на фото. " +
    "Номер СНИЛС содержит ровно 11 цифр и часто записан как XXX-XXX-XXX XX. " +
    "Ищи именно строку рядом с подписью 'Страховой номер индивидуального лицевого счета (СНИЛС)' или короткой подписью 'СНИЛС' в верхней части документа. " +
    "Игнорируй любые другие длинные номера из штампов, регистрационных блоков, электронной подписи, QR-кодов и служебных полей внизу документа. " +
    "Обязательно верни номер в поле snils, сохранив все 11 цифр; можно без дефисов и пробелов. " +
    "Не подставляй null, если номер читается хотя бы с умеренной уверенностью: выбери наиболее вероятный номер СНИЛС на документе. " +
    NAME_CASE_INSTRUCTION +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: snils, surname, givenNames, middleName, birthDate.",
  bank_details:
    "Распознай реквизиты банковского счета на фото документа. " +
    "Если на документе указаны ФИО владельца счета, тоже обязательно верни их. " +
    NAME_CASE_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: bankAccountNumber, bankName, bik, corrAccount, inn, surname, givenNames, middleName.",
  visa:
    "Распознай визу на фото. " +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: visaNumber, issueDate, expiryDate, surname, givenNames, nationality, birthDate.",
  insurance_policy:
    "Распознай страховой полис на фото. " +
    "Найди номер полиса (обычно написано 'Серия' и 'Номер' или просто длинный номер в шапке документа) и дату начала действия полиса (поле 'с' в разделе 'Срок страхования'). " +
    DATE_FORMAT_INSTRUCTION +
    "Верни строго JSON без markdown и пояснений. Поля: policyNumber, issueDate.",
  registration_amina:
    "На изображении экран приложения или скриншот с данными регистрации сотрудника. " +
    "Найди блоки с адресом проживания/регистрации и номером телефона. " +
    "Если на экране есть поля 'Населенный пункт', 'Улица', 'Дом', 'Квартира', извлеки их отдельно и собери полный адрес в поле registrationAddress. " +
    "registrationAddress пиши по-русски, в человекочитаемом виде, без лишних комментариев. " +
    "Телефон верни в поле phone в том виде, как он указан на экране, сохранив все цифры. " +
    "Верни строго JSON без markdown и пояснений. Поля: registrationAddress, locality, street, house, apartment, phone.",
};

export const PROMPT_KEYS = [
  "passport_rf",
  "foreign_passport",
  "passport_translation",
  "patent",
  "kig",
  "kig_back",
  "inn",
  "snils",
  "bank_details",
  "visa",
  "insurance_policy",
  "registration_amina",
];

export const FALLBACK_PROMPT_KEYS = ["fallback_inn", "fallback_snils"];

const PROMPTS_SETTING_KEY = "ocr_prompts";
const PROMPTS_CACHE_TTL_MS = 60_000;

let promptsCache = { value: null, expiresAt: 0 };

export const invalidatePromptsCache = () => {
  promptsCache = { value: null, expiresAt: 0 };
};

const loadPromptsFromSettings = async () => {
  if (promptsCache.value !== null && Date.now() < promptsCache.expiresAt) {
    return promptsCache.value;
  }
  try {
    const raw = await Setting.getSetting(PROMPTS_SETTING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const value = parsed && typeof parsed === "object" ? parsed : {};
    promptsCache = { value, expiresAt: Date.now() + PROMPTS_CACHE_TTL_MS };
    return value;
  } catch (error) {
    return promptsCache.value ?? {};
  }
};

export const getOcrPromptsState = async () => {
  let overrides = {};
  let updatedAt = null;
  const setting = await Setting.findOne({ where: { key: PROMPTS_SETTING_KEY } });
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value);
      if (parsed && typeof parsed === "object") {
        overrides = parsed;
      }
    } catch {
      overrides = {};
    }
  }
  if (setting?.updatedAt) {
    updatedAt = setting.updatedAt.toISOString();
  }

  const prompts = {};

  for (const key of PROMPT_KEYS) {
    prompts[key] = String(overrides?.[key] || DEFAULT_PROMPTS[key] || "");
  }
  prompts.scan = String(overrides?.scan || DEFAULT_SCAN_PROMPT || "");
  for (const key of FALLBACK_PROMPT_KEYS) {
    prompts[key] = String(overrides?.[key] || "");
  }

  return {
    storage: "settings",
    settingKey: PROMPTS_SETTING_KEY,
    updatedAt,
    prompts,
    overrides,
  };
};

export const saveOcrPromptsState = async (nextPrompts = {}) => {
  const payload = {};
  const source = nextPrompts && typeof nextPrompts === "object" ? nextPrompts : {};

  for (const key of PROMPT_KEYS) {
    if (key in source) {
      payload[key] = String(source[key] || "");
    }
  }
  if ("scan" in source) {
    payload.scan = String(source.scan || "");
  }
  for (const key of FALLBACK_PROMPT_KEYS) {
    if (key in source) {
      payload[key] = String(source[key] || "");
    }
  }

  await Setting.setSetting(
    PROMPTS_SETTING_KEY,
    JSON.stringify(payload),
    "OCR prompts overrides",
  );
  invalidatePromptsCache();
  const setting = await Setting.findOne({ where: { key: PROMPTS_SETTING_KEY } });
  return {
    storage: "settings",
    settingKey: PROMPTS_SETTING_KEY,
    prompts: payload,
    updatedAt: setting?.updatedAt?.toISOString?.() || null,
  };
};

const DEFAULT_SCAN_PROMPT =
  "На фото документ, снятый камерой телефона. " +
  "Найди внешний контур основного документа в центре кадра и верни строго JSON без markdown. " +
  'Формат ответа: {"detected":true,"confidence":0.0-1.0,"corners":[{"x":0-1000,"y":0-1000},{"x":0-1000,"y":0-1000},{"x":0-1000,"y":0-1000},{"x":0-1000,"y":0-1000}]}. ' +
  "Координаты corners должны быть в порядке: top-left, top-right, bottom-right, bottom-left. " +
  "Используй нормализованные координаты, где 0..1000 соответствуют ширине и высоте изображения. " +
  "Игнорируй стол, ноутбук, руки, тени, блики и фон вокруг документа. " +
  'Если документ не найден уверенно, верни {"detected":false,"confidence":0,"corners":[]}.';

const FALLBACK_IDENTIFIER_PROMPTS = {
  inn:
    "Что видишь на изображении, ответь строго JSON без markdown. " +
    "Если это документ ИНН, обязательно верни основной 12-значный номер документа в одном из ключей inn, documentNumber или document_number. " +
    "Если видны ФИО и дата рождения, тоже верни их в JSON.",
  snils:
    "Что видишь на изображении, ответь строго JSON без markdown. " +
    "Если это документ СНИЛС или АДИ-РЕГ, обязательно верни номер СНИЛС из 11 цифр в одном из ключей snils, documentNumber или document_number. " +
    "Если видны ФИО и дата рождения, тоже верни их в JSON.",
};

const getFallbackPrompt = async (documentType) => {
  const overrides = await loadPromptsFromSettings();
  const filePrompt = String(overrides?.[`fallback_${documentType}`] || "").trim();
  if (filePrompt) {
    return filePrompt;
  }
  return FALLBACK_IDENTIFIER_PROMPTS[documentType];
};

const resolveScanPromptByDocumentType = async (documentType) => {
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const overrides = await loadPromptsFromSettings();
  const filePrompt = String(overrides?.scan || "").trim();
  const basePrompt = filePrompt || DEFAULT_SCAN_PROMPT;

  if (normalizedDocumentType === "passport_rf") {
    return (
      `${basePrompt} ` +
      "Это разворот паспорта РФ. Найди именно внешний контур всего раскрытого паспорта целиком, а не отдельной страницы, фото, печати или текстового блока. " +
      "Даже если паспорт слегка изогнут по сгибу, ориентируйся по внешней границе раскрытого документа. " +
      "Если видна обложка или темная кайма, включай ее в границы документа."
    );
  }

  if (normalizedDocumentType === "foreign_passport") {
    return (
      `${basePrompt} ` +
      "Это паспортный документ. Ищи внешний контур всего документа, а не внутренней страницы или MRZ-зоны."
    );
  }

  return `${basePrompt} Тип документа: ${normalizedDocumentType || "generic_document"}.`;
};

const resolveCloseUpScanPromptByDocumentType = async (documentType) => {
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const overrides = await loadPromptsFromSettings();
  const filePrompt = String(overrides?.scan || "").trim();
  const basePrompt = filePrompt || DEFAULT_SCAN_PROMPT;

  if (normalizedDocumentType === "passport_rf") {
    return (
      `${basePrompt} ` +
      "Это крупный кадр разворота паспорта РФ. Документ может занимать почти весь кадр, вплотную подходить к краям изображения и частично выходить за центральную рамку интерфейса. " +
      "Все равно верни внешний контур всего раскрытого паспорта целиком, если видны его реальные внешние границы. " +
      "Не выбирай только одну страницу, фото, печать, текстовый блок или внутреннюю светлую область страницы. " +
      "Ориентируйся по черной или темной внешней обложке и внешнему прямоугольнику раскрытого документа. " +
      "Если документ крупный и почти заполняет кадр, это нормальный сценарий, его нужно считать найденным."
    );
  }

  if (normalizedDocumentType === "foreign_passport") {
    return (
      `${basePrompt} ` +
      "Это крупный кадр паспортного документа. Документ может занимать почти весь кадр. " +
      "Верни внешний контур всего документа, даже если он расположен очень близко к краям изображения."
    );
  }

  return (
    `${basePrompt} ` +
    `Тип документа: ${normalizedDocumentType || "generic_document"}. ` +
    "Документ может быть снят крупным планом и занимать большую часть кадра. Если внешняя граница видна, верни ее."
  );
};

const SUPPORTED_DOCUMENT_TYPES = new Set([
  "passport_rf",
  "foreign_passport",
  "passport_translation",
  "patent",
  "kig",
  "kig_back",
  "inn",
  "snils",
  "bank_details",
  "visa",
  "insurance_policy",
  "registration_amina",
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
  if (normalized === "passport_translation") return "passport_translation";
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
  if (normalized === "registration_amina") return "registration_amina";

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
  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  if (normalized.includes("рос") || normalized === "ru" || normalized === "rus") {
    return "RUS";
  }
  // Если формат "ТОЧИКИСТОН/TAJIKISTAN" — пробуем вытащить 3-буквенный латинский ISO-код
  const parts = raw.toUpperCase().split(/[/,|\s]+/).filter(Boolean);
  const isoCode = parts.find((p) => /^[A-Z]{3}$/.test(p));
  if (isoCode) return isoCode;
  return raw.toUpperCase();
};

const normalizeDigits = (value, maxLength = 64) => {
  if (!value) return null;
  const normalized = String(value).replace(/[^\d]/g, "").slice(0, maxLength);
  return normalized || null;
};

const normalizePhone = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return raw;
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }

  return raw;
};

const normalizeAddressPart = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const prefixAddressPart = (value, prefixes = []) => {
  const normalized = normalizeAddressPart(value);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (prefixes.some((prefix) => lower.startsWith(prefix))) {
    return normalized;
  }

  return normalized;
};

const buildRegistrationAddress = (parsedJson = {}) => {
  const directAddress = normalizeAddressPart(
    valueFrom(parsedJson, [
      "registrationAddress",
      "registration_address",
      "address",
      "addressLine",
      "address_line",
      "registrationPlace",
      "registration_place",
      "место сна и отдыха",
      "адрес регистрации",
      "адрес",
    ]),
  );
  const locality = normalizeAddressPart(
    valueFrom(parsedJson, [
      "locality",
      "city",
      "settlement",
      "location",
      "place",
      "населенный пункт",
      "населённый пункт",
      "город",
    ]),
  );
  const streetRaw = prefixAddressPart(
    valueFrom(parsedJson, [
      "street",
      "streetName",
      "street_name",
      "улица",
    ]),
    ["ул", "улиц"],
  );
  const houseRaw = normalizeAddressPart(
    valueFrom(parsedJson, ["house", "houseNumber", "house_number", "дом"]),
  );
  const apartmentRaw = normalizeAddressPart(
    valueFrom(parsedJson, [
      "apartment",
      "apartmentNumber",
      "apartment_number",
      "flat",
      "квартира",
      "кв",
    ]),
  );

  const parts = [];
  const baseAddress = directAddress || locality;

  if (baseAddress) {
    parts.push(baseAddress);
  }

  const baseLower = String(baseAddress || "").toLowerCase();
  if (streetRaw) {
    const streetLower = streetRaw.toLowerCase();
    if (!baseLower.includes(streetLower)) {
      parts.push(streetLower.startsWith("ул") ? streetRaw : `ул. ${streetRaw}`);
    }
  }

  if (houseRaw) {
    const houseDigits = houseRaw.replace(/[^\dA-Za-zА-Яа-яЁё/-]/g, "");
    if (houseDigits && !baseLower.includes(houseDigits.toLowerCase())) {
      const houseLower = houseRaw.toLowerCase();
      parts.push(houseLower.startsWith("д") ? houseRaw : `д. ${houseRaw}`);
    }
  }

  if (apartmentRaw) {
    const apartmentDigits = apartmentRaw.replace(/[^\dA-Za-zА-Яа-яЁё/-]/g, "");
    if (apartmentDigits && !baseLower.includes(apartmentDigits.toLowerCase())) {
      const apartmentLower = apartmentRaw.toLowerCase();
      parts.push(
        apartmentLower.startsWith("кв") ? apartmentRaw : `кв. ${apartmentRaw}`,
      );
    }
  }

  return parts.filter(Boolean).join(", ") || null;
};

const normalizeExactDigits = (value, exactLength) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (digitsOnly.length === exactLength) {
    return digitsOnly;
  }

  const groupedPattern = new RegExp(
    `(^|[^\\d])((?:\\d[\\s-]?){${exactLength}})(?=[^\\d]|$)`,
    "g",
  );
  const groupedMatches = [...raw.matchAll(groupedPattern)];
  for (const match of groupedMatches) {
    const normalizedCandidate = String(match[2] || "").replace(/[^\d]/g, "");
    if (normalizedCandidate.length === exactLength) {
      return normalizedCandidate;
    }
  }

  return null;
};

const normalizeNameToken = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token
        .split("-")
        .map((part) =>
          part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}` : "",
        )
        .join("-"),
    )
    .join(" ");
};

const splitFullName = (value) => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => normalizeNameToken(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      lastName: null,
      firstName: null,
      middleName: null,
    };
  }

  if (parts.length === 1) {
    return {
      lastName: parts[0],
      firstName: null,
      middleName: null,
    };
  }

  if (parts.length === 2) {
    return {
      lastName: parts[0],
      firstName: parts[1],
      middleName: null,
    };
  }

  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  };
};

const resolvePersonNameParts = (parsedJson = {}) => {
  const explicitLastName = normalizeNameToken(
    valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  );
  const explicitFirstName = normalizeNameToken(
    valueFrom(parsedJson, ["givenNames", "firstName", "first_name", "name"]),
  );
  const explicitMiddleName = normalizeNameToken(
    valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
  );
  const fullNameValue = valueFrom(parsedJson, ["fullName", "full_name", "fio"]);
  const fullNameParts = splitFullName(fullNameValue);

  return {
    lastName: explicitLastName || fullNameParts.lastName,
    firstName: explicitFirstName || fullNameParts.firstName,
    middleName: explicitMiddleName || fullNameParts.middleName,
  };
};

const mergeMissingNormalizedFields = (primary = {}, secondary = {}) => {
  const merged = { ...primary };

  for (const [key, value] of Object.entries(secondary)) {
    const currentValue = merged[key];
    const hasCurrentValue =
      currentValue !== null &&
      currentValue !== undefined &&
      (!(typeof currentValue === "string") || currentValue.trim() !== "");

    if (!hasCurrentValue && value !== null && value !== undefined && String(value).trim() !== "") {
      merged[key] = value;
    }
  }

  return merged;
};

const shouldRunIdentifierFallback = (documentType, normalized = {}) => {
  if (documentType === "inn") {
    return !normalized.inn;
  }

  if (documentType === "snils") {
    return !normalized.snils;
  }

  return false;
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

  if (letters.length < 2 || digits.length < 7) {
    return null;
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

const normalizePassportTranslation = (parsedJson = {}) => ({
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
  passportDepartmentCode: null,
  birthPlace: valueFrom(parsedJson, ["birthPlace", "birth_place"]),
  passportExpiryDate: normalizeDate(
    valueFrom(parsedJson, ["expiryDate", "expiry_date", "passportExpiryDate"]),
  ),
  registrationAddress: valueFrom(parsedJson, [
    "registrationAddress",
    "registration_address",
    "residenceAddress",
    "residence_address",
    "placeOfResidence",
    "place_of_residence",
  ]),
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
  sex: normalizeSex(valueFrom(parsedJson, ["sex", "gender"])),
  citizenship: normalizeCitizenship(
    valueFrom(parsedJson, ["nationality", "citizenship"]),
  ),
  kig: normalizeKigNumber(
    valueFrom(parsedJson, ["kigNumber", "kig_number", "number"]),
  ),
  kigEndDate: normalizeDate(
    valueFrom(parsedJson, [
      "expiryDate",
      "expiry_date",
      "kigExpiryDate",
      "validUntil",
      "valid_until",
    ]),
  ),
});

const normalizeKigBack = (parsedJson = {}) => ({
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
  kig: normalizeKigNumber(
    valueFrom(parsedJson, ["kigNumber", "kig_number", "number"]),
  ),
  kigEndDate: normalizeDate(
    valueFrom(parsedJson, ["expiryDate", "expiry_date", "kigExpiryDate", "validUntil"]),
  ),
});

const normalizeInn = (parsedJson = {}) => {
  const names = resolvePersonNameParts(parsedJson);

  return {
    lastName: names.lastName,
    firstName: names.firstName,
    middleName: names.middleName,
    birthDate: normalizeDate(
      valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth", "date_of_birth"]),
    ),
    inn: normalizeExactDigits(
      valueFrom(parsedJson, [
        "inn",
        "innNumber",
        "inn_number",
        "documentNumber",
        "document_number",
        "number",
        "certificateNumber",
        "certificate_number",
      ]),
      12,
    ),
  };
};

const normalizeSnils = (parsedJson = {}) => {
  const names = resolvePersonNameParts(parsedJson);

  return {
    lastName: names.lastName,
    firstName: names.firstName,
    middleName: names.middleName,
    birthDate: normalizeDate(
      valueFrom(parsedJson, ["birthDate", "birth_date", "dateOfBirth", "date_of_birth"]),
    ),
    snils: normalizeExactDigits(
      valueFrom(parsedJson, [
        "snils",
        "snilsNumber",
        "snils_number",
        "documentNumber",
        "document_number",
        "number",
      ]),
      11,
    ),
  };
};

const normalizeBankDetails = (parsedJson = {}) => ({
  lastName: valueFrom(parsedJson, ["surname", "lastName", "last_name"]),
  firstName: valueFrom(parsedJson, ["givenNames", "firstName", "first_name"]),
  middleName: valueFrom(parsedJson, ["middleName", "middle_name", "patronymic"]),
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

const normalizeInsurancePolicy = (parsedJson = {}) => ({
  insurancePolicyNumber: valueFrom(parsedJson, ["policyNumber", "policy_number", "number", "seriesNumber"]),
  insurancePolicyDate: normalizeDate(
    valueFrom(parsedJson, ["issueDate", "issue_date", "startDate", "validFrom"]),
  ),
});

const normalizeRegistrationAmina = (parsedJson = {}) => ({
  registrationAddress: buildRegistrationAddress(parsedJson),
  phone: normalizePhone(
    valueFrom(parsedJson, [
      "phone",
      "phoneNumber",
      "phone_number",
      "mobilePhone",
      "mobile_phone",
      "номер телефона",
      "телефон",
    ]),
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
  if (documentType === "passport_translation") {
    return normalizePassportTranslation(parsedJson);
  }
  if (documentType === "patent") return normalizePatent(parsedJson);
  if (documentType === "kig") return normalizeKig(parsedJson);
  if (documentType === "kig_back") return normalizeKigBack(parsedJson);
  if (documentType === "inn") return normalizeInn(parsedJson);
  if (documentType === "snils") return normalizeSnils(parsedJson);
  if (documentType === "bank_details") return normalizeBankDetails(parsedJson);
  if (documentType === "visa") return normalizeVisa(parsedJson);
  if (documentType === "insurance_policy") return normalizeInsurancePolicy(parsedJson);
  if (documentType === "registration_amina") {
    return normalizeRegistrationAmina(parsedJson);
  }
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

const hasMeaningfulNormalizedData = (normalized = {}) =>
  Object.values(normalized).some((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    if (typeof value === "boolean") {
      return true;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return false;
  });

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
  const fallbackModel =
    process.env.OCR_FALLBACK_MODEL ||
    process.env.OCR_OPENROUTER_FALLBACK_MODEL ||
    "";
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
    fallbackModel: String(fallbackModel || "").trim(),
    timeoutMs,
    referer,
    appTitle,
  };
};

const getScanTimeoutMs = (defaultTimeoutMs) => {
  const override = Number(process.env.OCR_SCAN_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  return Math.max(defaultTimeoutMs, 180000);
};

const getScanModels = ({ model, config }) => {
  const explicitModel = String(model || "").trim();
  const configuredModels = String(process.env.OCR_SCAN_MODELS || "")
    .split(",")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const fallbackModel = String(config?.fallbackModel || "").trim();

  const orderedCandidates = [
    explicitModel,
    ...configuredModels,
    ...DEFAULT_SCAN_MODEL_CHAIN,
    fallbackModel,
  ].filter(Boolean);

  return [...new Set(orderedCandidates)];
};

const resolvePromptByDocumentType = async (
  documentType,
  promptOverride = "",
) => {
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
    registration_amina: process.env.OCR_REGISTRATION_AMINA_PROMPT,
  };

  const envPrompt = String(envPromptMap[documentType] || "").trim();
  if (envPrompt) {
    return envPrompt;
  }

  const overrides = await loadPromptsFromSettings();
  const filePrompt = String(overrides?.[documentType] || "").trim();
  if (filePrompt) {
    return filePrompt;
  }

  return DEFAULT_PROMPTS[documentType] || DEFAULT_PROMPTS.passport_rf;
};

const buildOpenRouterPayload = ({
  model,
  prompt,
  imageDataUrl,
  systemPrompt = "Ты извлекаешь структурированные данные из документов. Если поле не найдено, верни null.",
  maxTokens = 1500,
  enforceJson = true,
}) => {
  const payload = {
    model,
    temperature: 0.1,
    max_tokens: maxTokens,
    reasoning: {
      effort: "none",
      exclude: true,
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
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
  };

  if (enforceJson) {
    payload.response_format = {
      type: "json_object",
    };
  }

  return payload;
};

const buildProviderErrorMeta = (error) => {
  const upstreamStatus = Number(error?.response?.status) || null;
  const upstreamData = error?.response?.data || null;
  const providerMessage =
    upstreamData?.error?.message ||
    upstreamData?.message ||
    error?.message ||
    "Неизвестная ошибка OCR-провайдера";
  const errorCode = String(error?.code || "").trim().toUpperCase();

  return {
    upstreamStatus,
    upstreamData,
    providerMessage,
    errorCode,
  };
};

const isTransientProviderFailure = ({
  upstreamStatus,
  errorCode,
}) => {
  if (
    errorCode === "ECONNABORTED" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNRESET"
  ) {
    return true;
  }

  return (
    upstreamStatus === 408 ||
    upstreamStatus === 409 ||
    upstreamStatus === 425 ||
    upstreamStatus === 429 ||
    upstreamStatus >= 500
  );
};

const postOpenRouterPayload = async ({
  config,
  payload,
  headers,
  errorLabel = "OCR",
}) => {
  try {
    return await axios.post(config.endpoint, payload, {
      headers,
      timeout: config.timeoutMs,
    });
  } catch (error) {
    const { upstreamStatus, providerMessage, errorCode } =
      buildProviderErrorMeta(error);
    const transient = isTransientProviderFailure({
      upstreamStatus,
      errorCode,
    });

    let message = `Ошибка ${errorLabel} провайдера`;
    if (upstreamStatus) {
      message += ` (${upstreamStatus})`;
    }
    message += `: ${providerMessage}`;

    const appError = new AppError(
      message,
      transient ? 503 : 502,
    );
    appError.upstreamStatus = upstreamStatus;
    appError.providerMessage = providerMessage;
    appError.providerErrorCode = errorCode || null;
    appError.isTransientProviderFailure = transient;
    throw appError;
  }
};

const clampNormalizedCoordinate = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(1000, Math.max(0, Math.round(numeric)));
};

const resolveScanCorners = (parsedJson = {}) => {
  const cornersCandidate =
    parsedJson?.corners ||
    parsedJson?.points ||
    parsedJson?.quad ||
    parsedJson?.documentCorners ||
    [];

  if (!Array.isArray(cornersCandidate) || cornersCandidate.length < 4) {
    return [];
  }

  const points = cornersCandidate
    .slice(0, 4)
    .map((point) => {
      if (!point || typeof point !== "object") {
        return null;
      }

      const x = clampNormalizedCoordinate(
        point.x ?? point.left ?? point.X ?? point.cx,
      );
      const y = clampNormalizedCoordinate(
        point.y ?? point.top ?? point.Y ?? point.cy,
      );

      if (x === null || y === null) {
        return null;
      }

      return { x, y };
    })
    .filter(Boolean);

  if (points.length !== 4) {
    return [];
  }

  const topLeft = points.reduce((best, point) =>
    point.x + point.y < best.x + best.y ? point : best,
  );
  const bottomRight = points.reduce((best, point) =>
    point.x + point.y > best.x + best.y ? point : best,
  );
  const topRight = points.reduce((best, point) =>
    point.x - point.y > best.x - best.y ? point : best,
  );
  const bottomLeft = points.reduce((best, point) =>
    point.x - point.y < best.x - best.y ? point : best,
  );

  const uniqueKeys = new Set(
    [topLeft, topRight, bottomRight, bottomLeft].map((point) => `${point.x}:${point.y}`),
  );

  if (uniqueKeys.size !== 4) {
    return [];
  }

  return [topLeft, topRight, bottomRight, bottomLeft];
};

const normalizeScanResponse = (parsedJson = {}) => {
  const corners = resolveScanCorners(parsedJson);
  const confidence = Number(parsedJson?.confidence);
  const detected =
    parsedJson?.detected === true ||
    parsedJson?.found === true ||
    corners.length === 4;

  return {
    detected: Boolean(detected && corners.length === 4),
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : corners.length === 4
        ? 0.8
        : 0,
    corners,
  };
};

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
  const selectedPrompt = await resolvePromptByDocumentType(
    normalizedDocumentType,
    prompt,
  );

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

  const attempts = [
    {
      label: "strict-json",
      model: selectedModel,
      enforceJson: true,
    },
    {
      label: "loose-json",
      model: selectedModel,
      enforceJson: false,
    },
  ];

  if (config.fallbackModel && config.fallbackModel !== selectedModel) {
    attempts.push({
      label: "fallback-model",
      model: config.fallbackModel,
      enforceJson: false,
    });
  }

  let lastEmptyResponseMeta = null;
  let lastNoDataMeta = null;
  let lastProviderError = null;

  for (const attempt of attempts) {
    const payload = buildOpenRouterPayload({
      model: attempt.model,
      prompt: selectedPrompt,
      imageDataUrl,
      enforceJson: attempt.enforceJson,
      maxTokens: attempt.enforceJson ? 700 : 900,
    });

    let response;
    try {
      response = await postOpenRouterPayload({
        config,
        payload,
        headers,
        errorLabel: "OCR",
      });
    } catch (error) {
      lastProviderError = {
        documentType: normalizedDocumentType,
        model: attempt.model,
        attempt: attempt.label,
        provider: config.provider,
        message: error?.message || "Ошибка OCR провайдера",
        upstreamStatus: error?.upstreamStatus || null,
        providerErrorCode: error?.providerErrorCode || null,
        isTransientProviderFailure: Boolean(error?.isTransientProviderFailure),
      };
      console.warn("[ocr] provider request failed", lastProviderError);

      if (error?.isTransientProviderFailure) {
        continue;
      }

      throw error;
    }

    const content = extractResponseContent(response.data);
    if (!String(content || "").trim()) {
      lastEmptyResponseMeta = {
        documentType: normalizedDocumentType,
        model: attempt.model,
        attempt: attempt.label,
        provider: config.provider,
        finishReason: response?.data?.choices?.[0]?.finish_reason || null,
        usage: response?.data?.usage || null,
      };
      console.warn("[ocr] empty provider response", lastEmptyResponseMeta);
      continue;
    }

    const parsedJson = parseStructuredJson(content) || {};
    let normalized = normalizeResponseByDocumentType(
      normalizedDocumentType,
      parsedJson,
    );
    let fallbackRaw = null;

    if (shouldRunIdentifierFallback(normalizedDocumentType, normalized)) {
      const fallbackPrompt = await getFallbackPrompt(normalizedDocumentType);

      if (fallbackPrompt) {
        try {
          const fallbackPayload = buildOpenRouterPayload({
            model: attempt.model,
            prompt: fallbackPrompt,
            imageDataUrl,
            enforceJson: true,
            maxTokens: 1200,
          });

          const fallbackResponse = await postOpenRouterPayload({
            config,
            payload: fallbackPayload,
            headers,
            errorLabel: "OCR fallback",
          });

          const fallbackContent = extractResponseContent(fallbackResponse.data);
          const fallbackParsedJson = parseStructuredJson(fallbackContent) || {};
          const fallbackNormalized = normalizeResponseByDocumentType(
            normalizedDocumentType,
            fallbackParsedJson,
          );

          normalized = mergeMissingNormalizedFields(normalized, fallbackNormalized);
          fallbackRaw = {
            content: fallbackContent,
            json: fallbackParsedJson,
          };
        } catch (error) {
          console.warn("[ocr] identifier fallback failed", {
            documentType: normalizedDocumentType,
            model: attempt.model,
            message: error?.message || "unknown fallback error",
          });
        }
      }
    }

    if (!hasMeaningfulNormalizedData(normalized)) {
      lastNoDataMeta = {
        documentType: normalizedDocumentType,
        model: attempt.model,
        attempt: attempt.label,
        provider: config.provider,
        rawContentPreview: String(content).slice(0, 500),
      };
      console.warn("[ocr] no structured fields extracted", lastNoDataMeta);
      continue;
    }

    return {
      documentType: normalizedDocumentType,
      provider: config.provider,
      model: attempt.model,
      normalized,
      raw: {
        content,
        json: parsedJson,
        fallback: fallbackRaw,
      },
    };
  }

  if (lastEmptyResponseMeta) {
    throw new AppError(
      "OCR провайдер вернул пустой ответ. Попробуйте еще раз или загрузите более четкое фото.",
      502,
    );
  }

  if (lastProviderError) {
    throw new AppError(
      "OCR провайдер временно недоступен. Попробуйте еще раз через минуту.",
      503,
    );
  }

  throw new AppError(
    "OCR не смог извлечь данные из документа. Попробуйте другое фото или scan-копию.",
    422,
  );
};

export const detectDocumentScan = async ({
  imageDataUrl,
  documentType,
  model,
  prompt,
}) => {
  ensureOcrEnabled();

  if (!imageDataUrl || !String(imageDataUrl).startsWith("data:image/")) {
    throw new AppError("AI scan поддерживает только изображения", 400);
  }

  const config = getOcrConfig();
  const scanTimeoutMs = getScanTimeoutMs(config.timeoutMs);
  const scanModels = getScanModels({ model, config });
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const customPrompt = String(prompt || "").trim();
  const baseScanPrompt =
    customPrompt || (await resolveScanPromptByDocumentType(normalizedDocumentType));
  const closeUpScanPrompt =
    customPrompt ||
    (await resolveCloseUpScanPromptByDocumentType(normalizedDocumentType));

  const attempts = [
    {
      label: "default",
      model: scanModels[0] || config.defaultModel,
      prompt: baseScanPrompt,
      enforceJson: true,
    },
    {
      label: "close-up",
      model: scanModels[0] || config.defaultModel,
      prompt: closeUpScanPrompt,
      enforceJson: false,
    },
  ];

  for (const fallbackScanModel of scanModels.slice(1)) {
    attempts.push({
      label: `fallback-${fallbackScanModel}`,
      model: fallbackScanModel,
      prompt: closeUpScanPrompt,
      enforceJson: false,
    });
  }

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

  let lastResult = null;

  for (const attempt of attempts) {
    const payload = buildOpenRouterPayload({
      model: attempt.model,
      prompt: attempt.prompt,
      imageDataUrl,
      systemPrompt:
        "Ты определяешь контур документа на фото. Возвращай только JSON с координатами и уверенностью.",
      maxTokens: 900,
      enforceJson: attempt.enforceJson,
    });

    const response = await postOpenRouterPayload({
      config: { ...config, timeoutMs: scanTimeoutMs },
      payload,
      headers,
      errorLabel: "AI scan",
    });

    const content = extractResponseContent(response.data);
    const parsedJson = parseStructuredJson(content) || {};
    const normalized = normalizeScanResponse(parsedJson);

    lastResult = {
      provider: config.provider,
      model: attempt.model,
      normalized,
      raw: {
        content,
        json: parsedJson,
        attempt: attempt.label,
      },
    };

    if (normalized.detected && normalized.corners.length === 4) {
      return lastResult;
    }
  }

  return (
    lastResult || {
      provider: config.provider,
      model: scanModels[0] || config.defaultModel,
      normalized: {
        detected: false,
        confidence: 0,
        corners: [],
      },
      raw: {
        content: "",
        json: {},
        attempt: null,
      },
    }
  );
};

export const isOcrSupportedDocumentType = (documentType) =>
  SUPPORTED_DOCUMENT_TYPES.has(normalizeDocumentType(documentType));
