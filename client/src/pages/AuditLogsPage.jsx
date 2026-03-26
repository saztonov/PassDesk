import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  DatePicker,
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

const humanizeFieldName = (fieldName) => FIELD_LABELS[fieldName] || fieldName;

const humanizeStatusName = (statusName) => {
  if (!statusName) {
    return "не задан";
  }

  if (!String(statusName).startsWith("status_")) {
    return statusName;
  }

  return String(statusName)
    .replace(/^status_/, "")
    .split("_")
    .join(" ");
};

const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—";

const getEmployeeName = (employee) => employee?.fullName || "—";

const getUserName = (user) => user?.fullName || user?.email || "Система";

const buildNameMap = (items = []) =>
  new Map(
    items
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item.name || item.shortName || item.fullName || String(item.id)]),
  );

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
        ? details.changedFields.map(humanizeFieldName)
        : [];

      return changedFields.length > 0
        ? `Изменены поля: ${changedFields.join(", ")}`
        : "Изменены данные карточки сотрудника";
    }

    case "employee_transferred": {
      const fromNames = Array.isArray(details.fromCounterparties)
        ? details.fromCounterparties.map((item) => item?.name).filter(Boolean)
        : [];
      const toName = details.toCounterparty?.name || details.counterpartyName;

      if (fromNames.length > 0 && toName) {
        return `Перевод: ${fromNames.join(", ")} -> ${toName}`;
      }

      return toName ? `Перевод в ${toName}` : "Перевод между контрагентами";
    }

    case "status_changed": {
      const fromStatus = humanizeStatusName(details.from);
      const toStatus = humanizeStatusName(details.to);
      const groupName = details.statusGroup || "status";
      return `Группа ${groupName}: ${fromStatus} -> ${toStatus}`;
    }

    case "zup_flag_changed": {
      const scope =
        details.scope === "single_status"
          ? "по одному статусу"
          : "по активным статусам";
      return details.to
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
      const fieldChanges = Object.entries(details.fieldChanges || {});
      const constructionSiteChange = details.constructionSiteChange;

      return [
        ...fieldChanges.map(([fieldName, value]) => ({
          label: humanizeFieldName(fieldName),
          value: `${resolveAuditFieldValue(fieldName, value?.from, lookups)} -> ${resolveAuditFieldValue(fieldName, value?.to, lookups)}`,
        })),
        ...(constructionSiteChange
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
          value: details.toCounterparty?.name || details.counterpartyName || "—",
        },
      ];

    case "status_changed":
      return [
        {
          label: "Группа",
          value: details.statusGroup || "—",
        },
        {
          label: "Статус",
          value: `${humanizeStatusName(details.from)} -> ${humanizeStatusName(details.to)}`,
        },
      ];

    case "zup_flag_changed":
      return [
        {
          label: "Выгрузка в ЗУП",
          value: `${details.from ? "Да" : "Нет"} -> ${details.to ? "Да" : "Нет"}`,
        },
      ];

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
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState(null);
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

      if (selectedCounterpartyId) {
        params.counterpartyId = selectedCounterpartyId;
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
  }, [dateRange, message, selectedCategory, selectedCounterpartyId]);

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

  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      total: groupedLogs.length,
      current:
        prev.current > Math.max(1, Math.ceil(groupedLogs.length / prev.pageSize))
          ? 1
          : prev.current,
    }));
  }, [groupedLogs]);

  const paginatedGroups = useMemo(() => {
    const start = (paginationCurrent - 1) * paginationPageSize;
    return groupedLogs.slice(start, start + paginationPageSize);
  }, [groupedLogs, paginationCurrent, paginationPageSize]);

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
    setSelectedCounterpartyId(null);
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
            gap: 8,
            alignItems: "center",
            flex: 1,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <RangePicker
            value={dateRange}
            onChange={(value) => {
              setDateRange(value);
              setPagination((prev) => ({ ...prev, current: 1 }));
            }}
            format="DD.MM.YYYY"
            allowEmpty={[true, true]}
          />
          <Select
            placeholder="Тип изменения"
            style={{ width: 220 }}
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
          <Select
            placeholder="Контрагент"
            style={{ width: 260 }}
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
          <Button icon={<ReloadOutlined />} onClick={handleResetFilters}>
            Сбросить
          </Button>
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
