/**
 * Утилиты для форматирования данных сотрудников
 *
 * Эти функции используются для отображения данных в соответствии с масками ввода
 */

/**
 * Форматирование телефона: +7 (999) 123-45-67
 */
export const formatPhone = (phone) => {
  if (!phone) return "-";

  // Если телефон уже отформатирован, возвращаем как есть
  if (phone.includes("(") && phone.includes(")")) {
    return phone;
  }

  // Убираем все символы кроме цифр
  const phoneNumber = phone.replace(/[^\d]/g, "");

  // Форматируем: +7 (123) 456-78-90
  if (phoneNumber.length === 11 && phoneNumber.startsWith("7")) {
    return `+7 (${phoneNumber.slice(1, 4)}) ${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7, 9)}-${phoneNumber.slice(9, 11)}`;
  }

  // Если формат не подходит, возвращаем как есть
  return phone;
};

/**
 * Форматирование СНИЛС: 123-456-789 00
 */
export const formatSnils = (snils) => {
  if (!snils) return "-";

  // Если СНИЛС уже отформатирован, возвращаем как есть
  if (snils.includes("-")) {
    return snils;
  }

  // Убираем все символы кроме цифр
  const snilsNumber = snils.replace(/[^\d]/g, "");

  // Форматируем: 123-456-789 00
  if (snilsNumber.length === 11) {
    return `${snilsNumber.slice(0, 3)}-${snilsNumber.slice(3, 6)}-${snilsNumber.slice(6, 9)} ${snilsNumber.slice(9, 11)}`;
  }

  // Если формат не подходит, возвращаем как есть
  return snils;
};

/**
 * Форматирование КИГ: АА 1234567 (латинские буквы)
 */
export const formatKig = (kig) => {
  if (!kig) return "-";

  // Если КИГ уже отформатирован (содержит пробел), возвращаем как есть
  if (kig.includes(" ")) {
    return kig;
  }

  // Убираем все символы кроме букв и цифр
  const kigClean = kig.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  if (/^\d{10,16}$/.test(kigClean)) {
    return kigClean;
  }

  // Форматируем: АА 1234567
  if (kigClean.length === 9) {
    return `${kigClean.slice(0, 2)} ${kigClean.slice(2)}`;
  }

  // Если формат не подходит, возвращаем как есть
  return kig;
};

/**
 * Форматирование ИНН: XXXX-XXXXX-X (10 цифр) или XXXX-XXXXXX-XX (12 цифр)
 */
export const formatInn = (inn) => {
  if (!inn) return "-";

  // Если ИНН уже отформатирован, возвращаем как есть
  if (inn.includes("-")) {
    return inn;
  }

  // Убираем все символы кроме цифр
  const innNumber = inn.replace(/[^\d]/g, "");

  // Форматируем 10-значный ИНН: XXXX-XXXXX-X
  if (innNumber.length === 10) {
    return `${innNumber.slice(0, 4)}-${innNumber.slice(4, 9)}-${innNumber.slice(9)}`;
  }

  // Форматируем 12-значный ИНН: XXXX-XXXXXX-XX
  if (innNumber.length === 12) {
    return `${innNumber.slice(0, 4)}-${innNumber.slice(4, 10)}-${innNumber.slice(10)}`;
  }

  // Если формат не подходит, возвращаем как есть
  return inn;
};

/**
 * Форматирование номера патента: XX №1234567890
 */
export const formatPatentNumber = (patentNumber) => {
  if (!patentNumber) return "-";

  // Если номер патента уже отформатирован, возвращаем как есть
  if (patentNumber.includes("№")) {
    return patentNumber;
  }

  // Убираем все символы кроме цифр
  const numbersOnly = patentNumber.replace(/[^\d]/g, "");

  // Форматируем: XX №1234567890
  if (numbersOnly.length === 12) {
    return `${numbersOnly.slice(0, 2)} №${numbersOnly.slice(2)}`;
  }

  // Если формат не подходит, возвращаем как есть
  return patentNumber;
};

/**
 * Форматирование номера бланка: ПР1234567 (кириллица, без пробелов)
 */
export const formatBlankNumber = (blankNumber) => {
  if (!blankNumber) return "-";

  // Номер бланка сохраняется и выводится без пробелов: ПР1234567
  // Преобразуем в верхний регистр для единообразия
  return blankNumber.toUpperCase();
};

/**
 * Фильтрация текста - оставляет только кириллицу и пробелы
 * Удаляет все латинские буквы и спецсимволы (кроме пробелов)
 *
 * Примеры:
 * "Иван123" → "Иван"
 * "Ivan Петров" → " Петров"
 * "сИДОР-ТЕСТ" → "сИДОР"
 */
export const filterCyrillicOnly = (value) => {
  if (!value) return value;

  // Оставляем только кириллицу (а-я, А-Я) и пробелы
  // Удаляем все остальное: латиницу, цифры, спецсимволы
  return String(value).replace(/[^а-яА-ЯёЁ\s]/g, "");
};

/**
 * Капитализация первой буквы ФИО (Фамилия, Имя, Отчество)
 * Автоматически делает первую букву заглавной, остальное в нижнем регистре
 * Также фильтрует латиницу - оставляет только кириллицу
 *
 * Примеры:
 * "иван" → "Иван"
 * "ПЕТР" → "Петр"
 * "сИДОР" → "Сидор"
 * "Ivan" → "" (латиница отфильтрована)
 * "Иван123" → "Иван" (цифры удалены)
 */
export const capitalizeFirstLetter = (value) => {
  if (!value) return value;

  // Сначала фильтруем - оставляем только кириллицу
  const filtered = filterCyrillicOnly(value);

  const source = String(filtered);
  const hasTrailingSpace = /\s$/.test(source);
  const collapsed = source.replace(/\s+/g, " ").trim();

  if (collapsed.length === 0) return "";

  const capitalized = collapsed
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

  return hasTrailingSpace ? `${capitalized} ` : capitalized;
};
