/**
 * Таблица транслитерации русских символов в латиницу
 */
const transliterationMap = {
  // Строчные буквы
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",

  // Заглавные буквы
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "Yo",
  Ж: "Zh",
  З: "Z",
  И: "I",
  Й: "Y",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "Ts",
  Ч: "Ch",
  Ш: "Sh",
  Щ: "Sch",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "Yu",
  Я: "Ya",

  // Специальные символы
  " ": "_",
  "-": "_",
  ".": "_",
  ",": "_",
  "!": "",
  "?": "",
  '"': "",
  "'": "",
  "№": "N",
  "(": "",
  ")": "",
  "[": "",
  "]": "",
  "{": "",
  "}": "",
  "/": "_",
  "\\": "_",
  "|": "_",
  ":": "_",
  ";": "_",
  "<": "",
  ">": "",
  "=": "_",
  "+": "_",
  "*": "_",
  "&": "_",
  "%": "_",
  $: "_",
  "#": "_",
  "@": "_",
  "`": "",
  "~": "_",
};

/**
 * Транслитерация текста из кириллицы в латиницу
 * @param {string} text - Исходный текст
 * @returns {string} - Транслитерированный текст
 */
export const transliterate = (text) => {
  if (!text) return "";

  return text
    .split("")
    .map((char) => transliterationMap[char] || char)
    .join("")
    .replace(/[^a-zA-Z0-9_]/g, "_") // Заменяем оставшиеся нелатинские символы на _
    .replace(/_+/g, "_") // Убираем повторяющиеся подчеркивания
    .replace(/^_|_$/g, ""); // Убираем подчеркивания в начале и конце
};

/**
 * Построение пути для файлов сотрудника
 * @param {string} counterpartyName - Название контрагента
 * @param {string} employeeId - UUID сотрудника
 * @returns {string} - Относительный путь вида /Counterparty_Name/employee_uuid
 */
export const buildEmployeeFilePath = (counterpartyName, employeeId) => {
  const transliteratedCounterparty = transliterate(counterpartyName);

  return `/${transliteratedCounterparty}/${employeeId}`;
};

/**
 * Безопасное имя файла (транслитерация + очистка)
 * @param {string} fileName - Исходное имя файла
 * @returns {string} - Безопасное имя файла
 */
export const sanitizeFileName = (fileName) => {
  if (!fileName) return "file";

  const safeBaseName = path.basename(String(fileName));
  const rawExtension = path.extname(safeBaseName).toLowerCase();
  const extension = /^[.][a-z0-9]{1,10}$/.test(rawExtension)
    ? rawExtension
    : "";
  const name = extension
    ? safeBaseName.slice(0, -extension.length)
    : safeBaseName;

  // Транслитерируем только имя файла (БЕЗ расширения)
  // Заменяем точки на подчеркивания только в имени, не в расширении
  const transliteratedName = transliterate(name.replace(/\./g, "_"));

  return `${transliteratedName}${extension}`.toLowerCase();
};

export const getSafeFileExtension = (fileName) => {
  if (!fileName) return "";
  const extension = path.extname(path.basename(String(fileName))).toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : "";
};

/**
 * Маппинг типов документов на русские названия
 */
const documentTypeNames = {
  passport: "паспорт",
  passport_translation: "перевод_паспорта",
  inn_document: "инн",
  consent: "согласие_персональные",
  biometric_consent: "согласие_биометрические_генподряд",
  biometric_consent_developer: "согласие_биометрические_застройщик",
  patent_front: "патент1",
  patent_back: "патент2",
  visa: "виза",
  bank_details: "реквизиты",
  snils_card: "снилс",
  kig: "киг",
  application_scan: "заявка",
  diploma: "диплом",
  med_book: "мед_книжка",
  migration_card: "миграционная_карта",
  arrival_notice: "уведомление_прибытии",
  patent_payment_receipt: "чек_оплата_патента",
  insurance_policy: "страховой_полис",
  memo_approval: "служебная_записка_согласование",
  employment_history_stdr: "стдр",
  registration_amina: "регистрация_амина",
  mvd_notification: "уведомление_мвд",
};

/**
 * Форматирование имени файла сотрудника
 * @param {string} documentType - Тип документа (passport, biometric_consent, biometric_consent_developer и т.д.)
 * @param {string} lastName - Фамилия
 * @param {string} firstName - Имя
 * @param {string} middleName - Отчество
 * @param {string} extension - Расширение файла с точкой (например, .pdf)
 * @returns {string} - Форматированное имя: документ_фамилия_имя_отчество.расширение
 */
export const formatEmployeeFileName = (
  documentType,
  lastName,
  firstName,
  middleName,
  extension,
) => {
  // Получаем русское название документа
  const docName = documentTypeNames[documentType] || documentType;

  // Преобразуем данные в нижний регистр для кириллицы
  const lastNameLower = lastName ? lastName.toLowerCase() : "";
  const firstNameLower = firstName ? firstName.toLowerCase() : "";
  const middleNameLower = middleName ? middleName.toLowerCase() : "";

  // Собираем компоненты имени (пропускаем пустые)
  const nameParts = [lastNameLower, firstNameLower, middleNameLower].filter(
    (p) => p,
  );
  const fullName = nameParts.join("_");

  // Собираем финальное имя
  const finalName = fullName ? `${docName}_${fullName}` : docName;

  return `${finalName}${extension}`.toLowerCase();
};

/**
 * Форматирование имени файла заявки
 * @param {string} applicationNumber - Номер заявки
 * @param {string} counterpartyName - Название контрагента
 * @param {string} createdDate - Дата создания (YYYY-MM-DD)
 * @param {string} extension - Расширение файла с точкой (например, .pdf)
 * @returns {string} - Форматированное имя: заявка_номер_контрагент_дата.расширение
 */
export const formatApplicationFileName = (
  applicationNumber,
  counterpartyName,
  createdDate,
  extension,
) => {
  // Форматируем контрагента (буквы в нижний регистр)
  const counterpartyFormatted = counterpartyName
    ? counterpartyName.toLowerCase()
    : "kontragent";

  // Форматируем дату (берем только дату без времени)
  const dateFormatted = createdDate
    ? createdDate.split("T")[0]
    : new Date().toISOString().split("T")[0];

  const finalName = `заявка_${applicationNumber}_${counterpartyFormatted}_${dateFormatted}`;

  return `${finalName}${extension}`.toLowerCase();
};

import path from "path";
