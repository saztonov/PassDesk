/**
 * Конфигурация полей формы сотрудника для сервера
 * Соответствует клиентской конфигурации в client/src/shared/config/employeeFields.js
 */

// Все возможные поля формы сотрудника
export const EMPLOYEE_FIELDS = [
  // Личные данные
  { key: 'inn', defaultRequired: true, defaultVisible: true },
  { key: 'gender', defaultRequired: true, defaultVisible: true },
  { key: 'lastName', defaultRequired: true, defaultVisible: true },
  { key: 'firstName', defaultRequired: true, defaultVisible: true },
  { key: 'middleName', defaultRequired: false, defaultVisible: true },
  { key: 'positionId', defaultRequired: true, defaultVisible: true },
  { key: 'citizenshipId', defaultRequired: true, defaultVisible: true },
  { key: 'birthDate', defaultRequired: true, defaultVisible: true },
  { key: 'birthCountryId', defaultRequired: true, defaultVisible: true },
  { key: 'registrationAddress', defaultRequired: true, defaultVisible: true },
  
  // Контакты
  { key: 'email', defaultRequired: false, defaultVisible: true },
  { key: 'phone', defaultRequired: true, defaultVisible: true },
  
  // Документы
  { key: 'snils', defaultRequired: true, defaultVisible: true },
  { key: 'passportType', defaultRequired: true, defaultVisible: true },
  { key: 'passportNumber', defaultRequired: true, defaultVisible: true },
  { key: 'passportDate', defaultRequired: true, defaultVisible: true },
  { key: 'passportIssuer', defaultRequired: true, defaultVisible: true },
  { key: 'passportExpiryDate', defaultRequired: false, defaultVisible: true },
  { key: 'bankAccountNumber', defaultRequired: false, defaultVisible: true },
  
  // Патент и КИГ
  { key: 'kig', defaultRequired: true, defaultVisible: true },
  { key: 'kigEndDate', defaultRequired: true, defaultVisible: true },
  { key: 'patentNumber', defaultRequired: true, defaultVisible: true },
  { key: 'patentIssueDate', defaultRequired: true, defaultVisible: true },
  { key: 'blankNumber', defaultRequired: true, defaultVisible: true },
  
  // Примечания
  { key: 'notes', defaultRequired: false, defaultVisible: true },
];

// Дефолтная конфигурация (если в БД нет настроек)
export const DEFAULT_FORM_CONFIG = EMPLOYEE_FIELDS.reduce((acc, field) => {
  acc[field.key] = {
    visible: field.defaultVisible,
    required: field.defaultRequired,
  };
  return acc;
}, {});

// Поля, временно скрытые на фронте. Они не должны влиять на статус заполненности карточки.
const TEMP_HIDDEN_FIELDS = new Set([
  "birthCountryId",
  "passportType",
  "passportExpiryDate",
  "kigEndDate",
  "gender",
  "email",
]);

/**
 * Проверить, заполнены ли все обязательные поля сотрудника согласно конфигурации
 * @param {Object} employee - объект сотрудника
 * @param {Object} formConfig - конфигурация полей (default или external)
 * @param {boolean} debug - выводить отладочную информацию
 * @returns {boolean} - true если все обязательные поля заполнены
 */
export const isEmployeeCardComplete = (employee, formConfig = DEFAULT_FORM_CONFIG, debug = false) => {
  // Определяем условия для специальных полей
  const requiresPatent = employee.citizenship?.requiresPatent !== false;
  const isForeignPassport = employee.passportType === 'foreign';

  const missingFields = [];

  // Проходим по всем полям конфигурации
  for (const fieldKey in formConfig) {
    const fieldConfig = formConfig[fieldKey];

    // Если поле временно скрыто в UI, исключаем его из проверки completeness.
    if (TEMP_HIDDEN_FIELDS.has(fieldKey)) {
      continue;
    }
    
    // Пропускаем скрытые или необязательные поля
    if (!fieldConfig.visible || !fieldConfig.required) {
      continue;
    }

    // Специальная логика для условных полей
    
    // Поля патента/КИГ - только для иностранцев с патентом
    if (['kig', 'kigEndDate', 'patentNumber', 'patentIssueDate', 'blankNumber'].includes(fieldKey)) {
      if (!requiresPatent) {
        continue; // Пропускаем, если патент не требуется
      }
    }
    
    // Дата окончания паспорта - только для иностранных паспортов
    if (fieldKey === 'passportExpiryDate') {
      if (!isForeignPassport) {
        continue; // Пропускаем для российских паспортов
      }
    }

    // Проверяем заполненность поля
    const fieldValue = employee[fieldKey];
    
    // Поле считается незаполненным если:
    // - null
    // - undefined
    // - пустая строка (после trim)
    if (fieldValue === null || fieldValue === undefined) {
      missingFields.push(fieldKey);
      continue;
    }
    
    if (typeof fieldValue === 'string' && fieldValue.trim() === '') {
      missingFields.push(fieldKey);
    }
  }

  // Если есть незаполненные поля и включен debug
  if (debug && missingFields.length > 0) {
    console.log(`❌ Employee ${employee.lastName}: missing ${missingFields.length} fields: ${missingFields.join(', ')}`);
  }

  // Все обязательные поля заполнены
  return missingFields.length === 0;
};

/**
 * Получить список незаполненных обязательных полей
 * (для отладки и сообщений об ошибках)
 * @param {Object} employee - объект сотрудника
 * @param {Object} formConfig - конфигурация полей
 * @returns {Array<string>} - список незаполненных полей
 */
export const getMissingRequiredFields = (employee, formConfig = DEFAULT_FORM_CONFIG) => {
  const missing = [];
  const requiresPatent = employee.citizenship?.requiresPatent !== false;
  const isForeignPassport = employee.passportType === 'foreign';

  for (const fieldKey in formConfig) {
    const fieldConfig = formConfig[fieldKey];

    if (TEMP_HIDDEN_FIELDS.has(fieldKey)) {
      continue;
    }
    
    if (!fieldConfig.visible || !fieldConfig.required) {
      continue;
    }

    // Условные поля
    if (['kig', 'kigEndDate', 'patentNumber', 'patentIssueDate', 'blankNumber'].includes(fieldKey)) {
      if (!requiresPatent) continue;
    }
    
    if (fieldKey === 'passportExpiryDate') {
      if (!isForeignPassport) continue;
    }

    const fieldValue = employee[fieldKey];
    
    if (fieldValue === null || fieldValue === undefined || 
        (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
      missing.push(fieldKey);
    }
  }

  return missing;
};
