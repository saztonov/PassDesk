// Конфигурация всех возможных полей формы сотрудника
// Используется для настройки видимости и обязательности полей через админку

export const EMPLOYEE_FIELDS = [
  // Личные данные
  { key: 'inn', label: 'ИНН', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'gender', label: 'Пол', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'lastName', label: 'Фамилия', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'firstName', label: 'Имя', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'middleName', label: 'Отчество', group: 'personal', defaultRequired: false, defaultVisible: true },
  { key: 'positionId', label: 'Должность', group: 'personal', defaultRequired: false, defaultVisible: true },
  { key: 'citizenshipId', label: 'Гражданство', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'birthDate', label: 'Дата рождения', group: 'personal', defaultRequired: true, defaultVisible: true },
  { key: 'birthCountryId', label: 'Страна рождения', group: 'personal', defaultRequired: false, defaultVisible: true },
  { key: 'birthRegion', label: 'Область рождения', group: 'personal', defaultRequired: false, defaultVisible: true },
  { key: 'birthCity', label: 'Населённый пункт рождения', group: 'personal', defaultRequired: false, defaultVisible: true },
  { key: 'registrationAddress', label: 'Адрес регистрации', group: 'personal', defaultRequired: true, defaultVisible: true },
  
  // Контакты
  { key: 'email', label: 'Email', group: 'contacts', defaultRequired: false, defaultVisible: true },
  { key: 'phone', label: 'Телефон', group: 'contacts', defaultRequired: true, defaultVisible: true },
  
  // Документы
  { key: 'snils', label: 'СНИЛС', group: 'documents', defaultRequired: true, defaultVisible: true },
  { key: 'passportType', label: 'Тип паспорта', group: 'documents', defaultRequired: true, defaultVisible: true },
  { key: 'passportNumber', label: 'Серия и номер паспорта', group: 'documents', defaultRequired: true, defaultVisible: true },
  { key: 'passportDate', label: 'Дата выдачи паспорта', group: 'documents', defaultRequired: true, defaultVisible: true },
  { key: 'passportIssuer', label: 'Кем выдан паспорт', group: 'documents', defaultRequired: true, defaultVisible: true },
  { key: 'passportDepartmentCode', label: 'Код подразделения', group: 'documents', defaultRequired: false, defaultVisible: true },
  { key: 'passportExpiryDate', label: 'Дата окончания паспорта', group: 'documents', defaultRequired: false, defaultVisible: true }, // Только для иностранцев
  { key: 'bankAccountNumber', label: 'Номер банковского счета', group: 'documents', defaultRequired: false, defaultVisible: true },
  { key: 'bankBik', label: 'БИК', group: 'documents', defaultRequired: false, defaultVisible: true },
  { key: 'insurancePolicyNumber', label: 'Номер страхового полиса', group: 'documents', defaultRequired: false, defaultVisible: true },
  { key: 'insurancePolicyDate', label: 'Дата выдачи полиса', group: 'documents', defaultRequired: false, defaultVisible: true },
  
  // Патент и КИГ (видимость зависит от гражданства, но глобально можно отключить)
  { key: 'kig', label: 'КИГ (Карта иностранного гражданина)', group: 'patent', defaultRequired: false, defaultVisible: true },
  { key: 'kigEndDate', label: 'Дата окончания КИГ', group: 'patent', defaultRequired: false, defaultVisible: true },
  { key: 'patentNumber', label: 'Номер патента', group: 'patent', defaultRequired: true, defaultVisible: true },
  { key: 'patentIssueDate', label: 'Дата выдачи патента', group: 'patent', defaultRequired: true, defaultVisible: true },
  { key: 'blankNumber', label: 'Номер бланка патента', group: 'patent', defaultRequired: true, defaultVisible: true },
  
  // Примечания
  { key: 'plannedExitDate', label: 'Планируемая дата выхода', group: 'other', defaultRequired: false, defaultVisible: true },
  { key: 'notes', label: 'Примечания', group: 'other', defaultRequired: false, defaultVisible: true },
];

export const FIELD_GROUPS = {
  personal: 'Личные данные',
  contacts: 'Контакты',
  documents: 'Документы',
  patent: 'Патент и КИГ',
  other: 'Прочее',
};

// Дефолтные настройки (если в БД ничего нет)
export const DEFAULT_FORM_CONFIG = EMPLOYEE_FIELDS.reduce((acc, field) => {
  acc[field.key] = {
    visible: field.defaultVisible,
    required: field.defaultRequired,
  };
  return acc;
}, {});
