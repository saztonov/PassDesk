import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from "antd";
import {
  EyeOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import auditService from "@/services/auditService";
import { counterpartyService } from "@/services/counterpartyService";
import { citizenshipService } from "@/services/citizenshipService";
import positionService from "@/services/positionService";
import { constructionSiteService } from "@/services/constructionSiteService";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;
const FETCH_LIMIT = 500;

const EVENT_CATEGORY_OPTIONS = [
  { value: "employee_data", label: "Реквизиты / карточка", color: "blue" },
  { value: "transfer", label: "Перевод", color: "purple" },
  { value: "status", label: "Статусы / ЗУП", color: "gold" },
  { value: "files", label: "Файлы", color: "cyan" },
  { value: "skud", label: "СКУД", color: "green" },
];

const EVENT_CATEGORY_META = Object.fromEntries(
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

const STATUS_LABELS = {
  employee_transferred: "Перевод сотрудника",
  employee_updated: "Изменены данные сотрудника",
  file_deleted: "Удалён файл",
  file_uploaded: "Загружен файл",
  pass_assigned: "Выдан пропуск",
  pass_unbound: "Пропуск отвязан",
  status_changed: "Изменён статус",
  zup_flag_changed: "Изменён статус выгрузки в ЗУП",
};

const EVENT_TYPE_OPTIONS = [
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

const EVENT_TYPE_META = Object.fromEntries(
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

const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—";

const getEmployeeName = (employee) => employee?.fullName || "—";
const normalizeSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const getUserName = (user) => user?.fullName || user?.email || "Система";

const buildNameMap = (items = []) =>
  new Map(
    items
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item.name || item.shortName || item.fullName || String(item.id)]),
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

const describeAuditEvent = (record) => {
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
              (file) => file?.documentType || file?.fileName || file?.originalName,
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

const buildEventDetails = (record, lookups) => {
  const details = record?.details || {};

  switch (record?.eventType) {
    case "employee_updated": {
      const fieldChanges = [...collectEmployeeFieldChanges(details).entries()];
      const constructionSiteChange = resolveChangePair(details.constructionSiteChange);

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
            details.fromCounterparties?.map((item) => item?.name).filter(Boolean).join(", ") ||
            "—",
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
        value:
          file?.documentType || file?.fileName || file?.originalName || "—",
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

const renderEventDetailsRows = (record) => {
  const detailRows = buildEventDetails(record, record.__lookups);

  if (detailRows.length === 0) {
    return <Text style={{ fontSize: 13 }}>—</Text>;
  }

  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }}>
      {detailRows.map((row, index) => (
        <Text key={`${record?.id || "event"}-${row.label}-${index}`} style={{ fontSize: 13 }}>
          {row.label}: {row.value || "—"}
        </Text>
      ))}
    </Space>
  );
};

const buildAuditGroups = (logs = []) => {
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
        (left, right) => dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf(),
      ),
    }))
    .sort(
      (left, right) =>
        dayjs(right.lastChangedAt).valueOf() - dayjs(left.lastChangedAt).valueOf(),
    );
};

const AuditLogsPage = () => {
  const { message } = App.useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [counterparties, setCounterparties] = useState([]);
  const [citizenships, setCitizenships] = useState([]);
  const [positions, setPositions] = useState([]);
  const [constructionSites, setConstructionSites] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState([]);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState(null);
  const [selectedChangedByUserId, setSelectedChangedByUserId] = useState(null);
  const [employeeSearchText, setEmployeeSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null);
  const [drawerGroup, setDrawerGroup] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const { current: paginationCurrent, pageSize: paginationPageSize } =
    pagination;

  const fetchCounterparties = useCallback(async () => {
    try {
      const response = await counterpartyService.getAll({
        page: 1,
        limit: 10000,
      });
      setCounterparties(response?.data?.data?.counterparties || []);
    } catch (error) {
      console.error("Error fetching counterparties for audit logs:", error);
    }
  }, []);

  const fetchReferenceLookups = useCallback(async () => {
    try {
      const [citizenshipsResponse, positionsResponse, constructionSitesResponse] =
        await Promise.all([
          citizenshipService.getAll(),
          positionService.getAll({ limit: 10000 }),
          constructionSiteService.getAll({ limit: 10000 }),
        ]);

      setCitizenships(citizenshipsResponse?.data?.data?.citizenships || []);
      setPositions(positionsResponse?.data?.data?.positions || []);
      setConstructionSites(
        constructionSitesResponse?.data?.data?.constructionSites || [],
      );
    } catch (error) {
      console.error("Error fetching audit reference lookups:", error);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    try {
      const params = {
        page: 1,
        limit: FETCH_LIMIT,
      };

      if (selectedCategory) {
        params.eventCategory = selectedCategory;
      }

      if (selectedEventTypes.length > 0) {
        params.eventType = selectedEventTypes.join(",");
      }

      if (selectedCounterpartyId) {
        params.counterpartyId = selectedCounterpartyId;
      }

      if (selectedChangedByUserId) {
        params.userId = selectedChangedByUserId;
      }

      if (Array.isArray(dateRange) && dateRange.length === 2) {
        params.dateFrom = dateRange[0]?.startOf("day").toISOString();
        params.dateTo = dateRange[1]?.endOf("day").toISOString();
      }

      const response = await auditService.getAll(params);
      setLogs(response?.data?.data?.logs || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      message.error(
        error?.response?.data?.message || "Ошибка загрузки журнала изменений",
      );
    } finally {
      setLoading(false);
    }
  }, [
    dateRange,
    message,
    selectedCategory,
    selectedCounterpartyId,
    selectedChangedByUserId,
    selectedEventTypes,
  ]);

  useEffect(() => {
    fetchCounterparties();
  }, [fetchCounterparties]);

  useEffect(() => {
    fetchReferenceLookups();
  }, [fetchReferenceLookups]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const auditLookups = useMemo(
    () => ({
      citizenships: buildNameMap(citizenships),
      positions: buildNameMap(positions),
      constructionSites: buildNameMap(constructionSites),
    }),
    [citizenships, constructionSites, positions],
  );

  const logsWithLookups = useMemo(
    () => logs.map((log) => ({ ...log, __lookups: auditLookups })),
    [auditLookups, logs],
  );

  const groupedLogs = useMemo(() => buildAuditGroups(logsWithLookups), [logsWithLookups]);
  const normalizedEmployeeSearchText = useMemo(
    () => normalizeSearchText(employeeSearchText),
    [employeeSearchText],
  );
  const filteredGroupedLogs = useMemo(() => {
    if (!normalizedEmployeeSearchText) {
      return groupedLogs;
    }

    return groupedLogs.filter((group) =>
      normalizeSearchText(getEmployeeName(group.employee)).includes(
        normalizedEmployeeSearchText,
      ),
    );
  }, [groupedLogs, normalizedEmployeeSearchText]);

  const changedByOptions = useMemo(() => {
    const uniqueUsers = new Map();

    logsWithLookups.forEach((log) => {
      if (!log?.user?.id) {
        return;
      }

      uniqueUsers.set(log.user.id, {
        value: log.user.id,
        label: getUserName(log.user),
      });
    });

    return [...uniqueUsers.values()].sort((left, right) =>
      String(left.label).localeCompare(String(right.label), "ru"),
    );
  }, [logsWithLookups]);

  const availableEventTypeOptions = useMemo(
    () =>
      EVENT_TYPE_OPTIONS.filter(
        (option) => !selectedCategory || option.category === selectedCategory,
      ),
    [selectedCategory],
  );

  useEffect(() => {
    if (!selectedCategory) {
      return;
    }

    setSelectedEventTypes((prev) =>
      prev.filter(
        (eventType) => EVENT_TYPE_META[eventType]?.category === selectedCategory,
      ),
    );
  }, [selectedCategory]);

  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      total: filteredGroupedLogs.length,
      current:
        prev.current >
        Math.max(1, Math.ceil(filteredGroupedLogs.length / prev.pageSize))
          ? 1
          : prev.current,
    }));
  }, [filteredGroupedLogs]);

  const paginatedGroups = useMemo(() => {
    const start = (paginationCurrent - 1) * paginationPageSize;
    return filteredGroupedLogs.slice(start, start + paginationPageSize);
  }, [filteredGroupedLogs, paginationCurrent, paginationPageSize]);

  const drawerCategoryFilters = useMemo(() => {
    const uniqueCategories = [
      ...new Set((drawerGroup?.events || []).map((event) => event.eventCategory).filter(Boolean)),
    ];

    return uniqueCategories.map((category) => ({
      text: EVENT_CATEGORY_META[category]?.label || category,
      value: category,
    }));
  }, [drawerGroup]);

  const drawerUserFilters = useMemo(() => {
    const uniqueUsers = [
      ...new Set((drawerGroup?.events || []).map((event) => getUserName(event.user)).filter(Boolean)),
    ];

    return uniqueUsers.map((userName) => ({
      text: userName,
      value: userName,
    }));
  }, [drawerGroup]);

  const handleResetFilters = () => {
    setSelectedCategory(null);
    setSelectedEventTypes([]);
    setSelectedCounterpartyId(null);
    setSelectedChangedByUserId(null);
    setEmployeeSearchText("");
    setDateRange(null);
    setDrawerGroup(null);
    setPagination((prev) => ({
      ...prev,
      current: 1,
    }));
  };

  const columns = [
    {
      title: "Сотрудник",
      key: "employee",
      width: 260,
      render: (_, record) => <Text strong>{getEmployeeName(record.employee)}</Text>,
    },
    {
      title: "Последнее изменение",
      key: "lastChangedAt",
      width: 180,
      render: (_, record) => formatDateTime(record.lastChangedAt),
    },
    {
      title: "Что изменилось",
      key: "latestEvent",
      render: (_, record) => {
        const latestEvent = record.latestEvent;
        const eventCountLabel =
          record.events.length === 1
            ? "1 изменение"
            : `${record.events.length} изменений`;

        return (
          <Space direction="vertical" size={2}>
            <Text strong>
              {STATUS_LABELS[latestEvent?.eventType] || latestEvent?.action}
            </Text>
            <Text type="secondary">{eventCountLabel}</Text>
          </Space>
        );
      },
    },
    {
      title: "Контрагент",
      key: "counterparty",
      width: 220,
      render: (_, record) => record.counterparty?.name || "—",
    },
    {
      title: "Последний изменил",
      key: "user",
      width: 220,
      render: (_, record) => (
        <Tooltip title={record.user?.email || ""}>
          <span>{getUserName(record.user)}</span>
        </Tooltip>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Button
          icon={<EyeOutlined />}
          onClick={() => setDrawerGroup(record)}
        >
          История
        </Button>
      ),
    },
  ];

  const drawerColumns = [
    {
      title: "Дата",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (value) => formatDateTime(value),
      sorter: (left, right) =>
        dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf(),
      defaultSortOrder: "descend",
    },
    {
      title: "Событие",
      key: "event",
      filters: drawerCategoryFilters,
      onFilter: (value, record) => record.eventCategory === value,
      sorter: (left, right) => {
        const leftLabel =
          STATUS_LABELS[left.eventType] ||
          EVENT_CATEGORY_META[left.eventCategory]?.label ||
          left.action ||
          "";
        const rightLabel =
          STATUS_LABELS[right.eventType] ||
          EVENT_CATEGORY_META[right.eventCategory]?.label ||
          right.action ||
          "";

        return String(leftLabel).localeCompare(String(rightLabel), "ru");
      },
      render: (_, record) => {
        const categoryMeta = EVENT_CATEGORY_META[record.eventCategory];

        return (
          <Space direction="vertical" size={2}>
            {categoryMeta ? (
              <Text type="secondary">{categoryMeta.label}</Text>
            ) : null}
            <Text strong>
              {STATUS_LABELS[record.eventType] || record.action}
            </Text>
            <Text type="secondary">{describeAuditEvent(record)}</Text>
          </Space>
        );
      },
    },
    {
      title: "Что изменилось",
      key: "details",
      render: (_, record) => renderEventDetailsRows(record),
    },
    {
      title: "Кто",
      key: "user",
      width: 140,
      filters: drawerUserFilters,
      onFilter: (value, record) => getUserName(record.user) === value,
      sorter: (left, right) =>
        getUserName(left.user).localeCompare(getUserName(right.user), "ru"),
      render: (_, record) => getUserName(record.user),
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          gap: 12,
          flexShrink: 0,
          borderBottom: "1px solid #f0f0f0",
          flexWrap: "wrap",
        }}
      >
        <Space>
          <HistoryOutlined />
          <Title level={3} style={{ margin: 0 }}>
            Журнал изменений
          </Title>
        </Space>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <RangePicker
              style={{ width: "100%" }}
              value={dateRange}
              onChange={(value) => {
                setDateRange(value);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              format="DD.MM.YYYY"
              allowEmpty={[true, true]}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Select
              placeholder="Категория"
              style={{ width: "100%" }}
              value={selectedCategory}
              onChange={(value) => {
                setSelectedCategory(value);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              allowClear
              options={EVENT_CATEGORY_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Select
              mode="multiple"
              placeholder="Тип изменения"
              style={{ width: "100%" }}
              value={selectedEventTypes}
              onChange={(value) => {
                setSelectedEventTypes(value || []);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              allowClear
              maxTagCount="responsive"
              optionFilterProp="label"
              options={availableEventTypeOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Select
              placeholder="Контрагент"
              style={{ width: "100%" }}
              value={selectedCounterpartyId}
              onChange={(value) => {
                setSelectedCounterpartyId(value);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={counterparties.map((counterparty) => ({
                value: counterparty.id,
                label: counterparty.name,
              }))}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Select
              placeholder="Кто изменил"
              style={{ width: "100%" }}
              value={selectedChangedByUserId}
              onChange={(value) => {
                setSelectedChangedByUserId(value);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={changedByOptions}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Input
              placeholder="Поиск по ФИО сотрудника"
              value={employeeSearchText}
              onChange={(event) => {
                setEmployeeSearchText(event.target.value);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
              allowClear
            />
          </div>
          <div style={{ display: "flex", marginLeft: "auto" }}>
            <Button icon={<ReloadOutlined />} onClick={handleResetFilters}>
              Сбросить
            </Button>
          </div>
        </div>
      </div>

      <div
        style={{
          overflow: "visible",
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 24,
          maxWidth: 1800,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Table
          columns={columns}
          dataSource={paginatedGroups}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `Всего сотрудников: ${total}`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({
                ...prev,
                current: page,
                pageSize,
              }));
            },
          }}
          scroll={{ x: 1200 }}
        />
      </div>

      <Modal
        title={
          drawerGroup?.employee?.id
            ? `История изменений: ${getEmployeeName(drawerGroup.employee)}`
            : "История системного события"
        }
        open={Boolean(drawerGroup)}
        onCancel={() => setDrawerGroup(null)}
        footer={null}
        width={1200}
      >
        <Space
          direction="vertical"
          size={8}
          style={{ width: "100%" }}
        >
          {drawerGroup?.counterparty?.name ? (
            <Text type="secondary">
              Контрагент: {drawerGroup.counterparty.name}
            </Text>
          ) : null}

          <Table
            columns={drawerColumns}
            dataSource={drawerGroup?.events || []}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 760 }}
          />
        </Space>
      </Modal>
    </div>
  );
};

export default AuditLogsPage;
