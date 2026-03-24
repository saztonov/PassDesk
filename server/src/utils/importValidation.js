/**
 * Утилиты для валидации при импорте сотрудников из Excel
 */

import {
  Counterparty,
  Citizenship,
  CitizenshipSynonym,
  Position,
  Employee,
} from "../models/index.js";
import { Op } from "sequelize";
import {
  ENCRYPTED_EMPLOYEE_FIELDS,
  hashForSearch,
  isFieldEncryptionEnabled,
} from "../services/encryptionService.js";

const normalizeCitizenshipLookupValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const CITIZENSHIP_LOOKUP_ALIASES = {
  россия: "российская федерация",
  рф: "российская федерация",
};

const NON_PATENT_CITIZENSHIPS = new Set([
  "российская федерация",
  "россия",
  "рф",
  "армения",
  "беларусь",
  "казахстан",
  "киргизия",
  "кыргызстан",
]);

const toTitleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/(^|[\s-])([a-zа-яё])/giu, (_, prefix, char) =>
      `${prefix}${char.toUpperCase()}`,
    );

const formatCitizenshipDisplayName = (value) =>
  String(value || "")
    .trim()
    .split(",")
    .map((part) => toTitleCase(part.trim()))
    .join(", ");

const inferCitizenshipRequiresPatent = (citizenshipName) =>
  !NON_PATENT_CITIZENSHIPS.has(
    CITIZENSHIP_LOOKUP_ALIASES[normalizeCitizenshipLookupValue(citizenshipName)] ||
      normalizeCitizenshipLookupValue(citizenshipName),
  );

const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

const shouldSkipPatentValidation = (employeeData) =>
  employeeData?.isClosedBrigade === true ||
  String(employeeData?.employmentStatus || "").trim().toLowerCase() === "fired";

const buildLastNameHash = (lastName) => {
  if (!lastName || !isFieldEncryptionEnabled()) {
    return null;
  }

  try {
    return hashForSearch(ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME, lastName);
  } catch {
    return null;
  }
};

/**
 * Валидирует ИНН (10 или 12 цифр)
 * Форматы: 1234567890, 1234-56789-0, 1234567890, 1234-567890-12
 * Автоматически убирает точки, пробелы, тире
 */
export const validateInn = (inn) => {
  if (!inn) return { valid: false, error: "ИНН обязателен" };

  // Убираем ВСЕ нецифровые символы (включая точки, пробелы, тире)
  const cleaned = String(inn).trim().replace(/[^\d]/g, "");

  if (cleaned.length !== 10 && cleaned.length !== 12) {
    return {
      valid: false,
      error: `ИНН: должен быть 10 или 12 цифр, получено ${cleaned.length}`,
    };
  }

  return { valid: true, normalizedInn: cleaned };
};

/**
 * Валидирует СНИЛС (11 цифр)
 * Форматы: 123-456-789 10, 12345678910
 * Автоматически убирает точки, пробелы, тире
 */
export const validateSnils = (snils) => {
  if (!snils) return { valid: false, error: "СНИЛС обязателен" };

  // Убираем ВСЕ нецифровые символы (включая точки, пробелы, тире)
  const cleaned = String(snils).trim().replace(/[^\d]/g, "");

  if (cleaned.length !== 11) {
    return {
      valid: false,
      error: `СНИЛС: должен быть 11 цифр, получено ${cleaned.length}`,
    };
  }

  return { valid: true, normalizedSnils: cleaned };
};

/**
 * Валидирует дату (формат YYYY-MM-DD или DD.MM.YYYY)
 */
export const validateDate = (dateString, fieldName = "Дата") => {
  if (!dateString) return { valid: true, normalizedDate: null };

  const str = String(dateString).trim();

  // Проверяем формат YYYY-MM-DD
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (isoRegex.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return { valid: true, normalizedDate: str };
    }
  }

  // Проверяем формат DD.MM.YYYY
  const ruRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = str.match(ruRegex);
  if (match) {
    const [, day, month, year] = match;
    const isoDate = `${year}-${month}-${day}`;
    const date = new Date(isoDate);
    if (!isNaN(date.getTime())) {
      return { valid: true, normalizedDate: isoDate };
    }
  }

  return {
    valid: false,
    error: `${fieldName}: неверный формат даты (ожидается YYYY-MM-DD или DD.MM.YYYY)`,
  };
};

export const validateUuid = (uuid, fieldName = "UUID") => {
  if (!uuid) return { valid: true, normalizedUuid: null };

  const normalized = String(uuid).trim().toLowerCase();
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(normalized)) {
    return {
      valid: false,
      error: `${fieldName}: неверный формат UUID`,
    };
  }

  return { valid: true, normalizedUuid: normalized };
};

/**
 * Валидирует ФИО (кириллица, первая буква заглавная)
 */
export const validateFio = (firstName, lastName, middleName) => {
  const cyrillicRegex = /^[А-ЯЁ][а-яё]*(?:[-\s]+[А-ЯЁ][а-яё]*)*$/;
  const errors = [];
  const normalizeFioPart = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s*-\s*/g, "-")
      .replace(/(^|[\s-])([а-яё])/g, (_, prefix, char) =>
        `${prefix}${char.toUpperCase()}`,
      )
      .replace(/\s+/g, " ")
      .trim();
  const normalizedLastName = normalizeFioPart(lastName);
  const normalizedFirstName = normalizeFioPart(firstName);
  const normalizedMiddleName = normalizeFioPart(middleName);

  if (!normalizedLastName) {
    errors.push("Фамилия обязательна");
  } else if (!cyrillicRegex.test(normalizedLastName)) {
    errors.push("Фамилия должна быть кириллицей с заглавной буквой");
  }

  if (!normalizedFirstName) {
    errors.push("Имя обязательно");
  } else if (!cyrillicRegex.test(normalizedFirstName)) {
    errors.push("Имя должно быть кириллицей с заглавной буквой");
  }

  // Отчество необязательно, но если указано - проверяем формат
  if (normalizedMiddleName) {
    if (!cyrillicRegex.test(normalizedMiddleName)) {
      errors.push("Отчество должно быть кириллицей с заглавной буквой");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    lastName: normalizedLastName,
    firstName: normalizedFirstName,
    middleName: normalizedMiddleName || null,
  };
};

/**
 * Валидирует КИГ:
 * - legacy: 2 латинские буквы + 7 цифр
 * - новый формат карты: длинный цифровой номер
 * Автоматически убирает пробелы и лишние символы
 */
export const validateKig = (kig) => {
  if (!kig) return { valid: false, error: "КИГ обязателен" };

  const original = String(kig)
    .trim()
    .replace(/[Аа]/g, "A")
    .replace(/[Вв]/g, "B");

  // Проверяем наличие кириллицы
  const hasCyrillic = /[А-Яа-яЁё]/.test(original);
  if (hasCyrillic) {
    return {
      valid: false,
      error:
        "КИГ: в КИГ кириллица - КИГ должен быть в формате: АА1234567 (2 латинские буквы + 7 цифр)",
    };
  }

  // Убираем все кроме латинских букв и цифр
  const cleaned = original.replace(/[^\dA-Za-z]/g, "").toUpperCase();
  const letters = cleaned.replace(/[^A-Z]/g, "");
  const numbers = cleaned.replace(/[^0-9]/g, "");

  if (!letters && numbers.length >= 10 && numbers.length <= 16) {
    return { valid: true, normalizedKig: numbers };
  }

  if (letters.length !== 2 || numbers.length !== 7) {
    return {
      valid: false,
      error:
        "КИГ: должен быть либо в формате АА1234567, либо длинным цифровым номером карты",
    };
  }

  return { valid: true, normalizedKig: `${letters}${numbers}` };
};

/**
 * Находит гражданство по названию с учетом синонимов
 */
export const findCitizenshipByName = async (citizenshipName) => {
  if (!citizenshipName) return null;

  const normalizedName = normalizeCitizenshipLookupValue(citizenshipName);
  const name = CITIZENSHIP_LOOKUP_ALIASES[normalizedName] || normalizedName;

  // Сначала ищем точное совпадение
  let citizenship = await Citizenship.findOne({
    where: { name: { [Op.iLike]: name } },
  });

  if (!citizenship) {
    // Ищем через синонимы
    const synonym = await CitizenshipSynonym.findOne({
      where: { synonym: { [Op.iLike]: name } },
    });

    if (synonym) {
      citizenship = await Citizenship.findByPk(synonym.citizenshipId);
    }
  }

  return citizenship;
};

/**
 * Находит гражданство из загруженных справочников (оптимизированная версия)
 */
export const findCitizenshipByNameFromCache = (
  citizenshipName,
  citizenshipsCache,
  synonymsCache,
) => {
  if (!citizenshipName) return null;

  const normalizedName = normalizeCitizenshipLookupValue(citizenshipName);
  const name = CITIZENSHIP_LOOKUP_ALIASES[normalizedName] || normalizedName;

  // Ищем точное совпадение
  let citizenship = citizenshipsCache.find(
    (c) => normalizeCitizenshipLookupValue(c.name) === name,
  );

  if (!citizenship) {
    // Ищем через синонимы
    const synonym = synonymsCache.find(
      (s) => normalizeCitizenshipLookupValue(s.synonym) === name,
    );
    if (synonym) {
      citizenship = citizenshipsCache.find(
        (c) => c.id === synonym.citizenshipId,
      );
    }
  }

  return citizenship || null;
};

const ensureCitizenshipFromCache = async (
  citizenshipName,
  citizenshipsCache,
  synonymsCache,
  newCitizenshipsMap,
) => {
  const existing = findCitizenshipByNameFromCache(
    citizenshipName,
    citizenshipsCache,
    synonymsCache,
  );
  if (existing) {
    return existing;
  }

  const normalizedName = normalizeCitizenshipLookupValue(citizenshipName);
  const aliasedName = CITIZENSHIP_LOOKUP_ALIASES[normalizedName] || normalizedName;

  if (newCitizenshipsMap?.has(aliasedName)) {
    return newCitizenshipsMap.get(aliasedName);
  }

  const citizenship = await Citizenship.create({
    name: formatCitizenshipDisplayName(aliasedName),
    code: null,
    requiresPatent: inferCitizenshipRequiresPatent(aliasedName),
  });

  const plainCitizenship = citizenship.toJSON();
  citizenshipsCache.push(plainCitizenship);
  if (newCitizenshipsMap) {
    newCitizenshipsMap.set(aliasedName, plainCitizenship);
  }

  const originalInput = String(citizenshipName || "").trim();
  if (originalInput && normalizeCitizenshipLookupValue(originalInput) !== aliasedName) {
    const synonym = await CitizenshipSynonym.create({
      citizenshipId: citizenship.id,
      synonym: originalInput,
    });
    synonymsCache.push(synonym.toJSON());
  }

  return plainCitizenship;
};

/**
 * Находит или создает должность
 */
export const findOrCreatePosition = async (positionName, userId) => {
  if (!positionName) return null;

  const name = String(positionName).trim();

  // Капитализуем первую букву
  const capitalizedName =
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  let position = await Position.findOne({
    where: { name: { [Op.iLike]: capitalizedName } },
  });

  if (!position) {
    // Создаем новую должность
    position = await Position.create({
      name: capitalizedName,
      createdBy: userId,
    });
  }

  return position;
};

/**
 * Находит должность из загруженных справочников (оптимизированная версия)
 */
export const findPositionFromCache = (positionName, positionsCache) => {
  if (!positionName) return null;

  const name = String(positionName).trim();
  const capitalizedName =
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  return (
    positionsCache.find(
      (p) => p.name.toLowerCase() === capitalizedName.toLowerCase(),
    ) || null
  );
};

/**
 * Проверяет контрагента и КПП
 */
export const validateCounterpartyAndKpp = async (
  innOrganization,
  kppOrganization,
) => {
  const errors = [];

  if (!innOrganization) {
    errors.push("ИНН организации обязателен");
    return { valid: false, errors };
  }

  const innCleaned = String(innOrganization).replace(/[^\d]/g, "");
  const counterparty = await Counterparty.findOne({
    where: { inn: innCleaned },
  });

  if (!counterparty) {
    errors.push(`Контрагент с ИНН ${innOrganization} не найден`);
    return { valid: false, errors };
  }

  // Проверяем КПП
  const kppCleaned = kppOrganization
    ? String(kppOrganization).replace(/[^\d]/g, "")
    : null;

  if (kppCleaned && counterparty.kpp && counterparty.kpp !== kppCleaned) {
    errors.push(
      `КПП не совпадает. В базе: ${counterparty.kpp}, в файле: ${kppCleaned}`,
    );
    return { valid: false, errors };
  }

  return {
    valid: true,
    counterparty,
    kppToUpdate: kppCleaned && !counterparty.kpp ? kppCleaned : null,
  };
};

/**
 * Проверяет контрагента из загруженных справочников (оптимизированная версия)
 */
export const validateCounterpartyAndKppFromCache = (
  innOrganization,
  kppOrganization,
  counterpartiesCache,
) => {
  const errors = [];

  if (!innOrganization) {
    errors.push("ИНН организации обязателен");
    return { valid: false, errors };
  }

  const innCleaned = String(innOrganization).replace(/[^\d]/g, "");
  const counterparty = counterpartiesCache.find((c) => c.inn === innCleaned);

  if (!counterparty) {
    errors.push(`Контрагент с ИНН ${innOrganization} не найден`);
    return { valid: false, errors };
  }

  // Проверяем КПП
  const kppCleaned = kppOrganization
    ? String(kppOrganization).replace(/[^\d]/g, "")
    : null;

  if (kppCleaned && counterparty.kpp && counterparty.kpp !== kppCleaned) {
    errors.push(
      `КПП не совпадает. В базе: ${counterparty.kpp}, в файле: ${kppCleaned}`,
    );
    return { valid: false, errors };
  }

  return {
    valid: true,
    counterparty,
    kppToUpdate: kppCleaned && !counterparty.kpp ? kppCleaned : null,
  };
};

/**
 * Валидирует все поля сотрудника для импорта
 */
export const validateEmployeeForImport = async (employeeData, rowIndex) => {
  const errors = [];
  const warnings = [];

  // ФИО
  const fioValidation = validateFio(
    employeeData.firstName,
    employeeData.lastName,
    employeeData.middleName,
  );

  if (!fioValidation.valid) {
    errors.push(...fioValidation.errors);
  } else {
    // Сохраняем валидированное ФИО
    employeeData.firstName = fioValidation.firstName;
    employeeData.lastName = fioValidation.lastName;
    employeeData.middleName = fioValidation.middleName;
  }

  // ИНН сотрудника
  let innNormalized = null;
  if (employeeData.inn) {
    const innValidation = validateInn(employeeData.inn);
    if (!innValidation.valid) {
      errors.push(`ИНН сотрудника: ${innValidation.error}`);
    } else {
      innNormalized = innValidation.normalizedInn;
    }
  } else {
    warnings.push("ИНН сотрудника не указан");
  }

  // СНИЛС
  let snilsNormalized = null;
  if (employeeData.snils) {
    const snilsValidation = validateSnils(employeeData.snils);
    if (!snilsValidation.valid) {
      errors.push(`СНИЛС: ${snilsValidation.error}`);
    } else {
      snilsNormalized = snilsValidation.normalizedSnils;
    }
  } else {
    warnings.push("СНИЛС не указан");
  }

  // КИГ и гражданство
  let kigNormalized = null;
  let citizenship = null;

  if (employeeData.citizenship) {
    citizenship = await findCitizenshipByName(employeeData.citizenship);
    if (!citizenship) {
      errors.push(`Гражданство "${employeeData.citizenship}" не найдено`);
    } else if (
      doesCitizenshipRequirePatent(citizenship) &&
      !shouldSkipPatentValidation(employeeData)
    ) {
      // Проверяем КИГ если требуется патент
      if (!employeeData.kig) {
        warnings.push(`КИГ не указан для граждан ${employeeData.citizenship}`);
      } else {
        const kigValidation = validateKig(employeeData.kig);
        if (!kigValidation.valid) {
          errors.push(`КИГ: ${kigValidation.error}`);
        } else {
          kigNormalized = kigValidation.normalizedKig;
        }
      }
    }
  }

  // Контрагент и КПП
  const counterpartyValidation = await validateCounterpartyAndKpp(
    employeeData.counterpartyInn,
    employeeData.counterpartyKpp,
  );

  if (!counterpartyValidation.valid) {
    errors.push(...counterpartyValidation.errors);
  }

  // Должность
  let position = null;
  if (employeeData.position) {
    position = await findOrCreatePosition(
      employeeData.position,
      employeeData.userId,
    );
    if (!position) {
      errors.push("Ошибка при создании должности");
    }
  }

  // Дата рождения
  let birthDateNormalized = null;
  if (employeeData.birthDate) {
    const birthDateValidation = validateDate(
      employeeData.birthDate,
      "Дата рождения",
    );
    if (!birthDateValidation.valid) {
      errors.push(birthDateValidation.error);
    } else {
      birthDateNormalized = birthDateValidation.normalizedDate;
    }
  }

  let dismissalDateNormalized = null;
  if (employeeData.dismissalDate) {
    const dismissalDateValidation = validateDate(
      employeeData.dismissalDate,
      "Дата увольнения",
    );
    if (!dismissalDateValidation.valid) {
      errors.push(dismissalDateValidation.error);
    } else {
      dismissalDateNormalized = dismissalDateValidation.normalizedDate;
    }
  }

  // Срок окончания КИГ
  let kigEndDateNormalized = null;
  if (employeeData.kigEndDate) {
    const kigEndDateValidation = validateDate(
      employeeData.kigEndDate,
      "Срок окончания КИГ",
    );
    if (!kigEndDateValidation.valid) {
      errors.push(kigEndDateValidation.error);
    } else {
      kigEndDateNormalized = kigEndDateValidation.normalizedDate;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validated: {
      firstName: employeeData.firstName,
      lastName: employeeData.lastName,
      middleName: employeeData.middleName,
      inn: innNormalized,
      snils: snilsNormalized,
      kig: kigNormalized,
      birthDate: birthDateNormalized,
      kigEndDate: kigEndDateNormalized,
      citizenship,
      counterparty: counterpartyValidation.counterparty,
      kppToUpdate: counterpartyValidation.kppToUpdate,
      position,
      dismissalDate: dismissalDateNormalized,
    },
  };
};

/**
 * Валидирует все поля сотрудника для импорта (оптимизированная версия со справочниками)
 */
export const validateEmployeeForImportOptimized = async (
  employeeData,
  userId,
  caches,
  newPositionsMap,
  options = {},
) => {
  const errors = [];
  const warnings = [];
  const defaultCounterparty = options.defaultCounterparty || null;
  const newCitizenshipsMap = options.newCitizenshipsMap || null;
  const useDefaultCounterparty = Boolean(employeeData.idAll && defaultCounterparty);

  // ФИО
  const fioValidation = validateFio(
    employeeData.firstName,
    employeeData.lastName,
    employeeData.middleName,
  );

  if (!fioValidation.valid) {
    errors.push(...fioValidation.errors);
  } else {
    // Сохраняем валидированное ФИО
    employeeData.firstName = fioValidation.firstName;
    employeeData.lastName = fioValidation.lastName;
    employeeData.middleName = fioValidation.middleName;
  }

  // ИНН сотрудника
  let innNormalized = null;
  if (employeeData.inn) {
    const innValidation = validateInn(employeeData.inn);
    if (!innValidation.valid) {
      errors.push(`ИНН сотрудника: ${innValidation.error}`);
    } else {
      innNormalized = innValidation.normalizedInn;
    }
  } else {
    warnings.push("ИНН сотрудника не указан");
  }

  // СНИЛС
  let snilsNormalized = null;
  if (employeeData.snils) {
    const snilsValidation = validateSnils(employeeData.snils);
    if (!snilsValidation.valid) {
      errors.push(`СНИЛС: ${snilsValidation.error}`);
    } else {
      snilsNormalized = snilsValidation.normalizedSnils;
    }
  } else {
    warnings.push("СНИЛС не указан");
  }

  let idAllNormalized = null;
  if (employeeData.idAll) {
    const idAllValidation = validateUuid(
      employeeData.idAll,
      "ID из внешней системы",
    );
    if (!idAllValidation.valid) {
      errors.push(idAllValidation.error);
    } else {
      idAllNormalized = idAllValidation.normalizedUuid;
    }
  }

  // КИГ и гражданство
  let kigNormalized = null;
  let citizenship = null;

  if (employeeData.citizenship) {
    citizenship = await ensureCitizenshipFromCache(
      employeeData.citizenship,
      caches.citizenships,
      caches.citizenshipSynonyms,
      newCitizenshipsMap,
    );

    if (!citizenship) {
      errors.push(`Гражданство "${employeeData.citizenship}" не найдено`);
    } else if (
      doesCitizenshipRequirePatent(citizenship) &&
      !shouldSkipPatentValidation(employeeData)
    ) {
      // Проверяем КИГ если требуется патент
      if (!employeeData.kig) {
        warnings.push(`КИГ не указан для граждан ${employeeData.citizenship}`);
      } else {
        const kigValidation = validateKig(employeeData.kig);
        if (!kigValidation.valid) {
          errors.push(`КИГ: ${kigValidation.error}`);
        } else {
          kigNormalized = kigValidation.normalizedKig;
        }
      }
    }
  }

  // Контрагент и КПП
  const counterpartyValidation = useDefaultCounterparty
    ? {
        valid: true,
        counterparty: defaultCounterparty,
        kppToUpdate: null,
      }
    : validateCounterpartyAndKppFromCache(
        employeeData.counterpartyInn,
        employeeData.counterpartyKpp,
        caches.counterparties,
      );

  if (!counterpartyValidation.valid) {
    errors.push(...counterpartyValidation.errors);
  }

  // Должность - сначала ищем в кэше, потом создаем если нужно
  let position = null;
  if (employeeData.position) {
    const positionName = String(employeeData.position).trim();
    const capitalizedName =
      positionName.charAt(0).toUpperCase() +
      positionName.slice(1).toLowerCase();

    // Ищем в загруженных должностях
    position = findPositionFromCache(positionName, caches.positions);

    // Если не найдено - проверяем в мапе новых должностей
    if (!position && newPositionsMap.has(capitalizedName)) {
      position = newPositionsMap.get(capitalizedName);
    }

    // Если все еще не найдено - создаем новую
    if (!position) {
      try {
        position = await Position.create({
          name: capitalizedName,
          createdBy: userId,
        });
        // Сохраняем в мапу для последующих записей
        newPositionsMap.set(capitalizedName, position);
        console.log(`   ✨ Создана новая должность: ${capitalizedName}`);
      } catch (error) {
        console.error(`   ❌ Ошибка при создании должности: ${error.message}`);
        errors.push("Ошибка при создании должности");
      }
    }
  }

  // Дата рождения
  let birthDateNormalized = null;
  if (employeeData.birthDate) {
    const birthDateValidation = validateDate(
      employeeData.birthDate,
      "Дата рождения",
    );
    if (!birthDateValidation.valid) {
      errors.push(birthDateValidation.error);
    } else {
      birthDateNormalized = birthDateValidation.normalizedDate;
    }
  }

  let dismissalDateNormalized = null;
  if (employeeData.dismissalDate) {
    const dismissalDateValidation = validateDate(
      employeeData.dismissalDate,
      "Дата увольнения",
    );
    if (!dismissalDateValidation.valid) {
      errors.push(dismissalDateValidation.error);
    } else {
      dismissalDateNormalized = dismissalDateValidation.normalizedDate;
    }
  }

  // Срок окончания КИГ
  let kigEndDateNormalized = null;
  if (employeeData.kigEndDate) {
    const kigEndDateValidation = validateDate(
      employeeData.kigEndDate,
      "Срок окончания КИГ",
    );
    if (!kigEndDateValidation.valid) {
      errors.push(kigEndDateValidation.error);
    } else {
      kigEndDateNormalized = kigEndDateValidation.normalizedDate;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validated: {
      idAll: idAllNormalized,
      firstName: employeeData.firstName,
      lastName: employeeData.lastName,
      middleName: employeeData.middleName,
      inn: innNormalized,
      snils: snilsNormalized,
      kig: kigNormalized,
      birthDate: birthDateNormalized,
      kigEndDate: kigEndDateNormalized,
      citizenship,
      counterparty: counterpartyValidation.counterparty,
      kppToUpdate: counterpartyValidation.kppToUpdate,
      position,
      department: employeeData.department || null,
      isClosedBrigade: employeeData.isClosedBrigade === true,
      employmentStatus: employeeData.employmentStatus || null,
      dismissalDate: dismissalDateNormalized,
      phone: employeeData.phone || null,
      personalPhone: employeeData.personalPhone || null,
      workPhone: employeeData.workPhone || null,
      bankAccountNumber: employeeData.bankAccountNumber || null,
      passportType: employeeData.passportType || null,
      passportNumber: employeeData.passportNumber || null,
      passportDate: employeeData.passportDate || null,
      passportIssuer: employeeData.passportIssuer || null,
      passportExpiryDate: employeeData.passportExpiryDate || null,
      registrationAddress: employeeData.registrationAddress || null,
      patentIssueDate: employeeData.patentIssueDate || null,
      patentNumber: employeeData.patentNumber || null,
      blankNumber: employeeData.blankNumber || null,
      passNumber: employeeData.passNumber || null,
    },
  };
};

/**
 * Проверяет конфликты для одного сотрудника (ФИО, ИНН, СНИЛС)
 */
export const checkEmployeeConflict = async (validatedEmployee) => {
  const conflicts = [];
  const lastNameHash = buildLastNameHash(validatedEmployee.lastName);

  // Проверяем ИНН
  if (validatedEmployee.inn) {
    const existing = await Employee.findOne({
      where: { inn: validatedEmployee.inn },
      attributes: ["id", "firstName", "lastName", "middleName", "inn", "snils"],
    });

    if (existing) {
      conflicts.push({
        type: "inn",
        existingEmployee: existing,
        newEmployee: validatedEmployee,
      });
    }
  }

  // Проверяем СНИЛС
  if (validatedEmployee.snils) {
    const existing = await Employee.findOne({
      where: { snils: validatedEmployee.snils },
      attributes: ["id", "firstName", "lastName", "middleName", "inn", "snils"],
    });

    if (existing) {
      conflicts.push({
        type: "snils",
        existingEmployee: existing,
        newEmployee: validatedEmployee,
      });
    }
  }

  // Проверяем ФИО (точное совпадение)
  const fioWhere = {
    firstName: validatedEmployee.firstName,
    middleName: validatedEmployee.middleName,
  };
  fioWhere[Op.or] = [{ lastName: validatedEmployee.lastName }];
  if (lastNameHash) {
    fioWhere[Op.or].push({ lastNameHash });
  }

  const existingByFio = await Employee.findOne({
    where: fioWhere,
    attributes: ["id", "firstName", "lastName", "middleName", "inn", "snils"],
  });

  if (existingByFio) {
    conflicts.push({
      type: "fio",
      existingEmployee: existingByFio,
      newEmployee: validatedEmployee,
    });
  }

  return conflicts;
};

/**
 * Проверяет конфликты для сотрудника из загруженных данных (оптимизированная версия)
 */
export const checkEmployeeConflictFromCache = (
  validatedEmployee,
  existingEmployeesCache,
) => {
  const conflicts = [];
  const lastNameHash = buildLastNameHash(validatedEmployee.lastName);
  const existingByIdAll = validatedEmployee.idAll
    ? existingEmployeesCache.find((e) => e.idAll === validatedEmployee.idAll)
    : null;
  const isSameEmployee = (existing) =>
    !!existingByIdAll && String(existing?.id || "") === String(existingByIdAll?.id || "");

  // Проверяем ИНН
  if (validatedEmployee.inn) {
    const existing = existingEmployeesCache.find(
      (e) => e.inn === validatedEmployee.inn,
    );
    if (existing && !isSameEmployee(existing)) {
      conflicts.push({
        type: "inn",
        existingEmployee: existing,
        newEmployee: validatedEmployee,
      });
    }
  }

  // Проверяем СНИЛС
  if (validatedEmployee.snils) {
    const existing = existingEmployeesCache.find(
      (e) => e.snils === validatedEmployee.snils,
    );
    if (existing && !isSameEmployee(existing)) {
      conflicts.push({
        type: "snils",
        existingEmployee: existing,
        newEmployee: validatedEmployee,
      });
    }
  }

  // Проверяем ФИО (точное совпадение)
  const existingByFio = existingEmployeesCache.find(
    (e) =>
      e.firstName === validatedEmployee.firstName &&
      (e.lastName === validatedEmployee.lastName ||
        (lastNameHash && e.lastNameHash === lastNameHash)) &&
      e.middleName === validatedEmployee.middleName,
  );

  if (existingByFio && !isSameEmployee(existingByFio)) {
    conflicts.push({
      type: "fio",
      existingEmployee: existingByFio,
      newEmployee: validatedEmployee,
    });
  }

  return conflicts;
};

/**
 * Проверяет что для одного ИНН организации все КПП совпадают
 */
export const validateKppConsistency = (employees) => {
  const kppByInn = {};
  const errors = [];

  employees.forEach((emp, index) => {
    const inn = emp.counterpartyInn;
    const kpp = emp.counterpartyKpp;

    if (!kppByInn[inn]) {
      kppByInn[inn] = kpp;
    } else if (kppByInn[inn] !== kpp) {
      errors.push({
        rowIndex: index + 1,
        error: `Разные КПП для одного ИНН организации ${inn}: "${kppByInn[inn]}" и "${kpp}"`,
      });
    }
  });

  return errors;
};
