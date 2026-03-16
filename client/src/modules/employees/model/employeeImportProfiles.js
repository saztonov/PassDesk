export const EMPLOYEE_IMPORT_PROFILE_DEFAULT = "default";
export const EMPLOYEE_IMPORT_PROFILE_1C_ZUP = "zup_1c";

const DEFAULT_PROFILE = {
  id: EMPLOYEE_IMPORT_PROFILE_DEFAULT,
  actionTitle: "Загрузка сотрудников из Excel",
  baseModalTitle: "Загрузка сотрудников из Excel",
  successMessage: "Сотрудники успешно импортированы",
  uploadTitle: "Структура файла",
  uploadDescription: "Файл должен содержать следующие столбцы:",
  schemaLines: [
    "№, Фамилия, Имя, Отчество, КИГ, Срок окончания КИГ, Гражданство,",
    "Дата рождения, СНИЛС, Должность, ИНН сотрудника,",
    "Организация, ИНН организации, КПП организации",
  ],
  templateUrl:
    "https://docs.google.com/spreadsheets/d/1oho6qSjuhuq524-RZXmvN8XJh6-lSXSjAyYaRunzTP8/edit?usp=sharing",
  notes: [
    {
      title: "Примечание",
      text: "Столбец № пропускается. Столбцы, не указанные выше, игнорируются.",
    },
    {
      title: "Контрагенты",
      text: "ИНН организации и КПП организации: контрагент должен быть вашей организацией или вашим субподрядчиком.",
    },
  ],
};

const ZUP_1C_PROFILE = {
  id: EMPLOYEE_IMPORT_PROFILE_1C_ZUP,
  actionTitle: "Загрузка файла 1С (Excel)",
  baseModalTitle: "Загрузка сотрудников из 1С (Excel)",
  successMessage: "Файл 1С успешно импортирован",
  uploadTitle: "Структура файла 1С",
  uploadDescription: "Ожидается выгрузка 1С ЗУП в текущем формате со следующими колонками:",
  schemaLines: [
    "ФизЛицо, Физлицо_id_all, ИНН, СтраховойНомерПФР, Отдел, Должность,",
    "НомерПропуска, Паспорт_Вид, Паспорт_Серия, Паспорт_Номер,",
    "Паспорт_ДатаВыдачи, Паспорт_КемВыдан, Гражданство,",
    "АдресПоПрописке, ТелефонФЛ, ТелефонСлужебный",
  ],
  templateUrl: null,
  notes: [
    {
      title: "Контрагент",
      text: "Строки с Физлицо_id_all загружаются в контрагента по умолчанию СУ-10.",
    },
    {
      title: "Статусы",
      text: "Признак /закр в Отделе трактуется как закрытая бригада, такие сотрудники импортируются как уволенные.",
    },
    {
      title: "Пропуска",
      text: "НомерПропуска сохраняется в таблицу пропусков PassDesk при основном импорте сотрудников.",
    },
  ],
};

export const EMPLOYEE_IMPORT_PROFILES = {
  [EMPLOYEE_IMPORT_PROFILE_DEFAULT]: DEFAULT_PROFILE,
  [EMPLOYEE_IMPORT_PROFILE_1C_ZUP]: ZUP_1C_PROFILE,
};

export const getEmployeeImportProfile = (profileId) =>
  EMPLOYEE_IMPORT_PROFILES[profileId] || DEFAULT_PROFILE;
