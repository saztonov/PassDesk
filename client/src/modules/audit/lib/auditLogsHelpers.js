import dayjs from "dayjs";

export const FETCH_LIMIT = 500;

export const EVENT_CATEGORY_OPTIONS = [
  { value: "employee_data", label: "Реквизиты / карточка", color: "blue" },
  { value: "transfer", label: "Перевод", color: "purple" },
  { value: "status", label: "Статусы / ЗУП", color: "gold" },
  { value: "files", label: "Файлы", color: "cyan" },
  { value: "skud", label: "СКУД", color: "green" },
];

export const EVENT_CATEGORY_META = Object.fromEntries(
  EVENT_CATEGORY_OPTIONS.map((option) => [option.value, option]),
);

const FIELD_LABELS = {
  bankAccountNumber: "Расчётный счёт",
  bankBik: "БИК",
  birthCity: "Город рождения",
  birthCountryId: "Страна рождения",
  birthDate: "Дата рождения",
  birthRegion: "Регион рождения",
  blankNumber: "Номер бланка",
  citizenshipId: "Гражданство",
  constructionSiteId: "Объект",
  email: "Email",
  firstName: "Имя",
  gender: "Пол",
  insurancePolicyDate: "Дата полиса",
  insurancePolicyNumber: "Полис",
  inn: "ИНН",
  kig: "КИГ",
  kigEndDate: "Срок КИГ",
  lastName: "Фамилия",
  middleName: "Отчество",
  notes: "Комментарий",
  passportDate: "Дата паспорта",
  passportExpiryDate: "Срок паспорта",
  passportIssuer: "Кем выдан паспорт",
  passportDepartmentCode: "Код подразделения паспорта",
  passportNumber: "Номер паспорта",
  passportType: "Тип паспорта",
  patentIssueDate: "Дата патента",
  patentNumber: "Номер патента",
  phone: "Телефон",
  positionId: "Должность",
  registrationAddress: "Адрес регистрации",
  snils: "СНИЛС",
};

export const STATUS_LABELS = {
  employee_transferred: "Перевод сотрудника",
  employee_updated: "Изменены данные сотрудника",
  file_deleted: "Удалён файл",
  file_uploaded: "Загружен файл",
  pass_assigned: "Выдан пропуск",
  pass_unbound: "Пропуск отвязан",
  status_changed: "Изменён статус",
  zup_flag_changed: "Изменён статус выгрузки в ЗУП",
};

export const EVENT_TYPE_OPTIONS = [
  { value: "employee_updated", category: "employee_data" },
  { value: "employee_transferred", category: "transfer" },
  { value: "status_changed", category: "status" },
  { value: "zup_flag_changed", category: "status" },
  { value: "file_uploaded", category: "files" },
  { value: "file_deleted", category: "files" },
  { value: "pass_assigned", category: "skud" },
  { value: "pass_unbound", category: "skud" },
].map((option) => ({
  ...option,
  label: STATUS_LABELS[option.value] || option.value,
}));

export const EVENT_TYPE_META = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [option.value, option]),
);

const STATUS_NAME_LABELS = {
  status_new: "Новый",
  status_draft: "Черновик",
  status_processed: "Обработан",
  status_tb_passed: "ТБ пройден",
  status_card_draft: "Карточка не заполнена",
  status_card_completed: "Карточка заполнена",
  status_card_processed: "Карточка обработана",
  status_active_employed: "Действующий",
  status_active_fired: "Уволен",
  status_active_fired_compl: "Уволен",
  status_active_inactive: "Неактивен",
  status_hr_new_compl: "Новый для ЗУП",
  status_hr_edited: "Редактирован",
  status_hr_fired_off: "Повторно принят",
  status_secure_allow: "Доступ разрешён",
  status_secure_block: "Доступ заблокирован",
  status_secure_block_compl: "Доступ заблокирован",
};

const STATUS_GROUP_LABELS = {
  status: "Основной статус",
  draft: "Основной статус",
  status_card: "Карточка",
  "card draft": "Карточка",
  status_active: "Активность",
  status_hr: "ЗУП",
  status_secure: "СКУД",
};

const humanizeFieldName = (fieldName) => FIELD_LABELS[fieldName] || fieldName;

const humanizeStatusName = (statusName) => {
  if (!statusName) {
    return "не задан";
  }

  if (STATUS_NAME_LABELS[statusName]) {
    return STATUS_NAME_LABELS[statusName];
  }

  if (!String(statusName).startsWith("status_")) {
    return statusName;
  }

  return String(statusName)
    .replace(/^status_/, "")
    .split("_")
    .join(" ");
};

const humanizeStatusGroupName = (groupName) => {
  if (!groupName) {
    return "—";
  }

  return STATUS_GROUP_LABELS[groupName] || groupName;
};

export const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—";

export const getEmployeeName = (employee) => employee?.fullName || "—";

export const normalizeSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const getUserName = (user) =>
  user?.fullName || user?.email || "Система";

export const buildNameMap = (items = []) =>
  new Map(
    items
      .filter((item) => item?.id)
      .map((item) => [
        String(item.id),
        item.name || item.shortName || item.fullName || String(item.id),
      ]),
  );

const hasOwn = (value, key) =>
  Boolean(value) &&
  typeof value === "object" &&
  Object.prototype.hasOwnProperty.call(value, key);

const resolveChangePair = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      from: null,
      to: null,
    };
  }

  const from =
    (hasOwn(value, "from") ? value.from : undefined) ??
    (hasOwn(value, "old") ? value.old : undefined) ??
    (hasOwn(value, "previous") ? value.previous : undefined) ??
    (hasOwn(value, "oldValue") ? value.oldValue : undefined) ??
    null;
  const to =
    (hasOwn(value, "to") ? value.to : undefined) ??
    (hasOwn(value, "new") ? value.new : undefined) ??
    (hasOwn(value, "next") ? value.next : undefined) ??
    (hasOwn(value, "newValue") ? value.newValue : undefined) ??
    null;

  return { from, to };
};

const collectEmployeeFieldChanges = (details = {}) => {
  const normalizedFieldChanges = new Map();

  Object.entries(details.fieldChanges || {}).forEach(([fieldName, change]) => {
    normalizedFieldChanges.set(fieldName, resolveChangePair(change));
  });

  const oldValues =
    details.oldValues && typeof details.oldValues === "object"
      ? details.oldValues
      : {};
  const newValues =
    details.newValues && typeof details.newValues === "object"
      ? details.newValues
      : {};
  Object.keys({ ...oldValues, ...newValues }).forEach((fieldName) => {
    if (!normalizedFieldChanges.has(fieldName)) {
      normalizedFieldChanges.set(fieldName, {
        from: oldValues[fieldName] ?? null,
        to: newValues[fieldName] ?? null,
      });
    }
  });

  if (Array.isArray(details.changes)) {
    details.changes.forEach((change) => {
      const fieldName = change?.fieldName || change?.field || change?.name;
      if (!fieldName || normalizedFieldChanges.has(fieldName)) {
        return;
      }

      normalizedFieldChanges.set(fieldName, resolveChangePair(change));
    });
  }

  return normalizedFieldChanges;
};

const resolveAuditFieldValue = (fieldName, value, lookups) => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const stringValue = String(value);

  if (fieldName === "citizenshipId" || fieldName === "birthCountryId") {
    return lookups.citizenships.get(stringValue) || stringValue;
  }

  if (fieldName === "positionId") {
    return lookups.positions.get(stringValue) || stringValue;
  }

  if (fieldName === "constructionSiteId") {
    return lookups.constructionSites.get(stringValue) || stringValue;
  }

  return stringValue;
};

export const describeAuditEvent = (record) => {
  const details = record?.details || {};

  switch (record?.eventType) {
    case "employee_updated": {
      const changedFields = Array.isArray(details.changedFields)
        ? details.changedFields
        : [...collectEmployeeFieldChanges(details).keys()];
      const normalizedChangedFields = [...new Set(changedFields)].map(
        humanizeFieldName,
      );

      return normalizedChangedFields.length > 0
        ? `Изменены поля: ${normalizedChangedFields.join(", ")}`
        : "Изменены данные карточки сотрудника";
    }

    case "employee_transferred": {
      const fromNames = Array.isArray(details.fromCounterparties)
        ? details.fromCounterparties.map((item) => item?.name).filter(Boolean)
        : [];
      const toName =
        details.toCounterparty?.name ||
        details.to?.name ||
        details.counterpartyName;

      if (fromNames.length > 0 && toName) {
        return `Перевод: ${fromNames.join(", ")} -> ${toName}`;
      }

      return toName ? `Перевод в ${toName}` : "Перевод между контрагентами";
    }

    case "status_changed": {
      const statusChange = resolveChangePair(details);
      const fromStatus = humanizeStatusName(statusChange.from);
      const toStatus = humanizeStatusName(statusChange.to);
      const groupName = humanizeStatusGroupName(details.statusGroup || "status");
      return `Группа ${groupName}: ${fromStatus} -> ${toStatus}`;
    }

    case "zup_flag_changed": {
      const zupChange = resolveChangePair(details);
      const scope =
        details.scope === "single_status"
          ? "по одному статусу"
          : "по активным статусам";
      return zupChange.to
        ? `Сотрудник выгружен в ЗУП (${scope})`
        : `Сброшен флаг выгрузки в ЗУП (${scope})`;
    }

    case "file_uploaded": {
      const fileNames = Array.isArray(details.files)
        ? details.files
            .map(
              (file) =>
                file?.documentType || file?.fileName || file?.originalName,
            )
            .filter(Boolean)
        : [];

      return fileNames.length > 0
        ? `Загружены файлы: ${fileNames.join(", ")}`
        : "Загружены файлы сотрудника";
    }

    case "file_deleted":
      return details.fileName
        ? `Удалён файл: ${details.fileName}`
        : "Удалён файл сотрудника";

    case "pass_assigned":
      return details.cardNumber
        ? `Выдан пропуск №${details.cardNumber}`
        : "Выдан пропуск";

    case "pass_unbound":
      return details.cardNumber
        ? `Пропуск №${details.cardNumber} отвязан`
        : "Пропуск отвязан";

    default:
      return STATUS_LABELS[record?.eventType] || record?.action || "Событие журнала";
  }
};

export const buildEventDetails = (record, lookups) => {
  const details = record?.details || {};

  switch (record?.eventType) {
    case "employee_updated": {
      const fieldChanges = [...collectEmployeeFieldChanges(details).entries()];
      const constructionSiteChange = resolveChangePair(
        details.constructionSiteChange,
      );

      return [
        ...fieldChanges.map(([fieldName, value]) => ({
          label: humanizeFieldName(fieldName),
          value: `${resolveAuditFieldValue(fieldName, value?.from, lookups)} -> ${resolveAuditFieldValue(fieldName, value?.to, lookups)}`,
        })),
        ...(details.constructionSiteChange
          ? [
              {
                label: "Объект",
                value: `${resolveAuditFieldValue("constructionSiteId", constructionSiteChange.from, lookups)} -> ${resolveAuditFieldValue("constructionSiteId", constructionSiteChange.to, lookups)}`,
              },
            ]
          : []),
      ];
    }

    case "employee_transferred":
      return [
        {
          label: "Откуда",
          value:
            details.fromCounterparties
              ?.map((item) => item?.name)
              .filter(Boolean)
              .join(", ") || "—",
        },
        {
          label: "Куда",
          value:
            details.toCounterparty?.name ||
            details.to?.name ||
            details.counterpartyName ||
            "—",
        },
      ];

    case "status_changed": {
      const statusChange = resolveChangePair(details);
      return [
        {
          label: "Группа",
          value: humanizeStatusGroupName(details.statusGroup),
        },
        {
          label: "Статус",
          value: `${humanizeStatusName(statusChange.from)} -> ${humanizeStatusName(statusChange.to)}`,
        },
      ];
    }

    case "zup_flag_changed": {
      const zupChange = resolveChangePair(details);
      return [
        {
          label: "Выгрузка в ЗУП",
          value: `${zupChange.from ? "Да" : "Нет"} -> ${zupChange.to ? "Да" : "Нет"}`,
        },
      ];
    }

    case "file_uploaded":
      return (details.files || []).map((file) => ({
        label: "Файл",
        value: file?.documentType || file?.fileName || file?.originalName || "—",
      }));

    case "file_deleted":
      return [
        {
          label: "Файл",
          value: details.fileName || details.originalName || "—",
        },
      ];

    case "pass_assigned":
    case "pass_unbound":
      return [
        {
          label: "Пропуск",
          value: details.cardNumber || "—",
        },
      ];

    default:
      return [];
  }
};

export const buildAuditGroups = (logs = []) => {
  const grouped = new Map();

  logs.forEach((log) => {
    const employeeId = log.employee?.id || null;
    const key = employeeId || `service:${log.id}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.events.push(log);
      if (dayjs(log.createdAt).isAfter(dayjs(existing.lastChangedAt))) {
        existing.lastChangedAt = log.createdAt;
        existing.latestEvent = log;
        existing.counterparty = log.counterparty || existing.counterparty;
        existing.user = log.user || existing.user;
      }
      return;
    }

    grouped.set(key, {
      id: key,
      employee: log.employee,
      counterparty: log.counterparty || null,
      user: log.user || null,
      latestEvent: log,
      lastChangedAt: log.createdAt,
      events: [log],
    });
  });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      events: [...group.events].sort(
        (left, right) =>
          dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf(),
      ),
    }))
    .sort(
      (left, right) =>
        dayjs(right.lastChangedAt).valueOf() - dayjs(left.lastChangedAt).valueOf(),
    );
};
