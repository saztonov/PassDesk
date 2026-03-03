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

/**
 * Валидирует ФИО (кириллица, первая буква заглавная)
 */
export const validateFio = (firstName, lastName, middleName) => {
  const cyrillicRegex = /^[А-ЯЁ][а-яё]*(?:\s+[А-ЯЁ][а-яё]*)*$/;
  const errors = [];
  const normalizeFioPart = (value) =>
    String(value || "")
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

  const original = String(kig).trim();

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

  const name = String(citizenshipName).trim();

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

  const name = String(citizenshipName).trim().toLowerCase();

  // Ищем точное совпадение
  let citizenship = citizenshipsCache.find(
    (c) => c.name.toLowerCase() === name,
  );

  if (!citizenship) {
    // Ищем через синонимы
    const synonym = synonymsCache.find((s) => s.synonym.toLowerCase() === name);
    if (synonym) {
      citizenship = citizenshipsCache.find(
        (c) => c.id === synonym.citizenshipId,
      );
    }
  }

  return citizenship || null;
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
    } else if (citizenship.requiresPatent !== false) {
      // Проверяем КИГ если требуется патент
      if (!employeeData.kig) {
        errors.push(`КИГ обязателен для граждан ${employeeData.citizenship}`);
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
) => {
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
    citizenship = findCitizenshipByNameFromCache(
      employeeData.citizenship,
      caches.citizenships,
      caches.citizenshipSynonyms,
    );

    if (!citizenship) {
      errors.push(`Гражданство "${employeeData.citizenship}" не найдено`);
    } else if (citizenship.requiresPatent !== false) {
      // Проверяем КИГ если требуется патент
      if (!employeeData.kig) {
        errors.push(`КИГ обязателен для граждан ${employeeData.citizenship}`);
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
  const counterpartyValidation = validateCounterpartyAndKppFromCache(
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

  // Проверяем ИНН
  if (validatedEmployee.inn) {
    const existing = existingEmployeesCache.find(
      (e) => e.inn === validatedEmployee.inn,
    );
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
    const existing = existingEmployeesCache.find(
      (e) => e.snils === validatedEmployee.snils,
    );
    if (existing) {
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
