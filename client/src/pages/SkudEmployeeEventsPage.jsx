import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Divider,
  DatePicker,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import skudService from "@/services/skudService";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const EVENT_TYPE_LABELS = {
  PASS_DETECTED: "Проход",
  PASS_GRANTED: "Разрешенный проход",
  PASS_DENIED: "Запрещенный проход",
  AP_ONLINE_STATUS: "Статус контроллера",
};

const getRawEventItem = (record) => {
  const rawItem = record?.rawItem;
  if (rawItem && typeof rawItem === "object") {
    return rawItem;
  }
  const rawPayload = record?.rawPayload;
  if (rawPayload && typeof rawPayload === "object") {
    return rawPayload.rawItem || rawPayload;
  }
  return {};
};

const getSigurPersonName = (record) => {
  const rawItem = getRawEventItem(record);
  const fromAdditionalData = rawItem?.additionalData?.accessObject?.data?.name;
  const fromData =
    rawItem?.data?.employeeName ||
    rawItem?.data?.personName ||
    rawItem?.data?.name ||
    null;
  const value = fromAdditionalData || fromData;
  return value ? String(value).trim() : "";
};

const getLocalEmployeeName = (record) => String(record?.employeeName || "").trim();
const getEmployeeDepartmentName = (record) => String(record?.departmentName || "").trim();

const isLikelyCounterpartyLabel = (value) =>
  /\b(ооо|ао|зао|пао|ип)\b/i.test(String(value || "").trim());

const getAccessPointName = (record) => {
  const explicitLabel = String(record?.accessPointLabel || "").trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const rawItem = getRawEventItem(record);
  const value =
    record?.accessPointName ||
    rawItem?.additionalData?.accessPoint?.name ||
    rawItem?.additionalData?.access_point?.name ||
    rawItem?.data?.accessPointName ||
    rawItem?.data?.access_point_name ||
    null;
  return value ? String(value).trim() : "";
};

const splitHierarchySegments = (value) =>
  String(value || "")
    .split("/")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

const extractSigurCounterpartyFromDepartmentPath = (pathValue) => {
  const segments = Array.isArray(pathValue)
    ? pathValue
        .map((part) => String(part || "").trim())
        .filter(Boolean)
    : splitHierarchySegments(pathValue);
  if (!segments.length) {
    return "";
  }
  const contractorsRootIndex = segments.findIndex((segment) =>
    /^подрядн/i.test(String(segment || "").trim()),
  );
  if (contractorsRootIndex >= 0 && segments[contractorsRootIndex + 1]) {
    return String(segments[contractorsRootIndex + 1] || "").trim();
  }
  return "";
};

const buildSigurCounterpartyOptionsFromDepartments = (departments) => {
  const unique = new Map();
  for (const department of departments || []) {
    const label = extractSigurCounterpartyFromDepartmentPath(
      Array.isArray(department?.path) ? department.path : department?.pathLabel,
    );
    if (!label) {
      continue;
    }
    const token = String(label).toLowerCase().replace(/\s+/g, " ").trim();
    if (!token || unique.has(token)) {
      continue;
    }
    unique.set(token, {
      value: label,
      label,
    });
  }
  return Array.from(unique.values()).sort((left, right) =>
    String(left.label || "").localeCompare(String(right.label || ""), "ru"),
  );
};

const extractSigurConstructionSiteNameFromPath = (pathValue) => {
  const segments = Array.isArray(pathValue)
    ? pathValue
        .map((part) => String(part || "").trim())
        .filter(Boolean)
    : splitHierarchySegments(pathValue);
  if (!segments.length) {
    return "";
  }

  const ignorePatterns = [
    /^\d+\s*структур/i,
    /подрядн/i,
    /^отдел\b/i,
    /^офис$/i,
    /^охрана/i,
    /^автопарк/i,
    /^медперсонал/i,
    /^допуск/i,
    /^гостев/i,
  ];

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = String(segments[index] || "").trim();
    if (!candidate) {
      continue;
    }
    if (!ignorePatterns.some((pattern) => pattern.test(candidate))) {
      return candidate;
    }
  }

  return String(segments[segments.length - 1] || "").trim();
};

const buildSigurConstructionSiteOptionsFromAccessPoints = (accessPoints) => {
  const unique = new Map();
  for (const item of accessPoints || []) {
    const label = extractSigurConstructionSiteNameFromPath(item?.pathLabel);
    if (!label) {
      continue;
    }
    const token = String(label).toLowerCase().replace(/\s+/g, " ").trim();
    if (!token || unique.has(token)) {
      continue;
    }
    unique.set(token, {
      value: label,
      label,
    });
  }
  return Array.from(unique.values()).sort((left, right) =>
    String(left.label || "").localeCompare(String(right.label || ""), "ru"),
  );
};

const getAccessPointHierarchyLabel = (record) => {
  const fromPathLabel = splitHierarchySegments(record?.accessPointPathLabel);
  if (fromPathLabel.length > 0) {
    return fromPathLabel.join(" / ");
  }

  const fromAccessPointLabel = splitHierarchySegments(record?.accessPointLabel);
  if (fromAccessPointLabel.length >= 2) {
    return fromAccessPointLabel.slice(0, -1).join(" / ");
  }

  return "";
};

const getConstructionSiteFallbackFromAccessPoint = (record) => {
  const fromPathLabel = splitHierarchySegments(record?.accessPointPathLabel);
  if (fromPathLabel.length > 0) {
    return fromPathLabel[fromPathLabel.length - 1];
  }

  const fromAccessPointLabel = splitHierarchySegments(record?.accessPointLabel);
  if (fromAccessPointLabel.length >= 2) {
    return fromAccessPointLabel[fromAccessPointLabel.length - 2];
  }

  return "";
};

const getConstructionSiteDisplayLabel = (record) => {
  if (Array.isArray(record?.eventConstructionSiteNames) && record.eventConstructionSiteNames.length) {
    return record.eventConstructionSiteNames.join(", ");
  }
  return record?.constructionSiteName || getConstructionSiteFallbackFromAccessPoint(record) || "";
};

const getCounterpartyFallbackFromHierarchy = (record) => {
  const segments = splitHierarchySegments(record?.accessPointPathLabel).length
    ? splitHierarchySegments(record?.accessPointPathLabel)
    : splitHierarchySegments(record?.accessPointLabel);
  if (!segments.length) {
    return "";
  }
  const rootIndex = segments.findIndex((segment) =>
    /^подрядн/i.test(String(segment || "").trim()),
  );
  if (rootIndex >= 0 && segments[rootIndex + 1]) {
    return String(segments[rootIndex + 1]).trim();
  }
  if (/^\d+\s*структур/i.test(String(segments[0] || "")) && segments[1]) {
    return String(segments[1]).trim();
  }
  if (segments[0]) {
    return String(segments[0]).trim();
  }
  return "";
};

const getCounterpartyDisplayName = (record) => {
  const explicitCounterparty = String(record?.counterpartyName || "").trim();
  if (explicitCounterparty) {
    return explicitCounterparty;
  }

  const providerFolderCounterparty = String(record?.providerCounterpartyFolderName || "").trim();
  if (providerFolderCounterparty) {
    return providerFolderCounterparty;
  }

  const fromHierarchy = getCounterpartyFallbackFromHierarchy(record);
  if (fromHierarchy) {
    return fromHierarchy;
  }

  const departmentName = getEmployeeDepartmentName(record);
  if (departmentName && isLikelyCounterpartyLabel(departmentName)) {
    return departmentName;
  }

  return "";
};

const getPassReason = (record) => {
  const rawItem = getRawEventItem(record);
  const value =
    rawItem?.data?.passReason ||
    rawItem?.data?.reason ||
    rawItem?.data?.result ||
    null;
  return value ? String(value).trim() : "";
};

const getCardKey = (record) => {
  const rawItem = getRawEventItem(record);
  const value = rawItem?.data?.cardKey || rawItem?.data?.keyHex || record?.keyHex || null;
  return value ? String(value).trim() : "";
};

const getEventTypeLabel = (value) => EVENT_TYPE_LABELS[value] || value || "—";

const getEventRowKey = (record) =>
  record?.id ||
  record?.logId ||
  [record?.eventTime, record?.externalEmpId, record?.accessPoint, record?.direction]
    .filter(Boolean)
    .join(":");

const getTodayEventRange = () => [dayjs().startOf("day"), dayjs().endOf("day")];

const buildEventRangeParams = (eventDateRange) =>
  Array.isArray(eventDateRange) && eventDateRange[0] && eventDateRange[1]
    ? {
        from: eventDateRange[0].startOf("day").toISOString(),
        to: eventDateRange[1].endOf("day").toISOString(),
      }
    : {};

const SkudEmployeeEventsPage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeId = String(searchParams.get("employeeId") || "").trim();
  const externalEmpId = String(searchParams.get("externalEmpId") || "").trim();
  const employeeNameHint = String(searchParams.get("employeeName") || "").trim();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [providerAccessPoints, setProviderAccessPoints] = useState([]);
  const [providerAccessPointsLoading, setProviderAccessPointsLoading] = useState(false);
  const [counterpartyOptions, setCounterpartyOptions] = useState([]);
  const [constructionSiteOptions, setConstructionSiteOptions] = useState([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [eventDateRange, setEventDateRange] = useState(() => {
    const from = fromParam ? dayjs(fromParam) : null;
    const to = toParam ? dayjs(toParam) : null;
    if (from?.isValid() && to?.isValid()) {
      return [from.startOf("day"), to.endOf("day")];
    }
    return getTodayEventRange();
  });
  const [showOnlyPassages, setShowOnlyPassages] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [accessPointFilter, setAccessPointFilter] = useState(undefined);
  const [counterpartyFilter, setCounterpartyFilter] = useState(undefined);
  const [constructionSiteFilter, setConstructionSiteFilter] = useState(undefined);
  const [employeeNameFilter, setEmployeeNameFilter] = useState("");

  const loadFilterReferences = useCallback(async ({ force = false } = {}) => {
    if (
      !force &&
      counterpartyOptions.length > 0 &&
      constructionSiteOptions.length > 0 &&
      providerAccessPoints.length > 0
    ) {
      return;
    }
    setFiltersLoading(true);
    setProviderAccessPointsLoading(true);
    try {
      const [accessPointsResult, providerDepartmentsResult] = await Promise.allSettled([
        skudService.getProviderAccessPoints(),
        skudService.getProviderDepartments(),
      ]);

      if (accessPointsResult.status === "fulfilled") {
        const providerAccessPoints = Array.isArray(accessPointsResult.value?.items)
          ? accessPointsResult.value.items
          : [];
        setProviderAccessPoints(providerAccessPoints);
        setConstructionSiteOptions(
          buildSigurConstructionSiteOptionsFromAccessPoints(providerAccessPoints),
        );
      }

      if (providerDepartmentsResult.status === "fulfilled") {
        const providerDepartments = Array.isArray(providerDepartmentsResult.value?.items)
          ? providerDepartmentsResult.value.items
          : [];
        setCounterpartyOptions(buildSigurCounterpartyOptionsFromDepartments(providerDepartments));
      }

      if (
        accessPointsResult.status !== "fulfilled" ||
        providerDepartmentsResult.status !== "fulfilled"
      ) {
        message.warning("Часть справочников фильтров не загрузилась, попробуйте обновить");
      }
    } catch (error) {
      console.error("Failed to load employee events filter references:", error);
      message.error("Не удалось загрузить справочники фильтров");
    } finally {
      setProviderAccessPointsLoading(false);
      setFiltersLoading(false);
    }
  }, [
    constructionSiteOptions.length,
    counterpartyOptions.length,
    message,
    providerAccessPoints.length,
  ]);

  const loadEmployeeEvents = useCallback(async () => {
    if (!employeeId && !externalEmpId && !employeeNameHint) {
      setEvents([]);
      return;
    }

    setLoading(true);
    try {
      const limit = 200;
      const maxPages = 30;
      let offset = 0;
      let total = Infinity;
      let page = 0;
      let allItems = [];

      while (offset < total && page < maxPages) {
        const response = await skudService.getEvents({
          limit,
          offset,
          ...(employeeId ? { employeeId } : {}),
          ...(externalEmpId ? { externalEmpId } : {}),
          ...(employeeNameFilter.trim()
            ? { employeeName: employeeNameFilter.trim() }
            : employeeNameHint
              ? { employeeName: employeeNameHint }
              : {}),
          ...(counterpartyFilter ? { counterpartyName: counterpartyFilter } : {}),
          ...(constructionSiteFilter ? { constructionSiteName: constructionSiteFilter } : {}),
          ...(eventTypeFilter !== "all" ? { eventType: eventTypeFilter } : {}),
          ...(directionFilter !== "all" ? { direction: directionFilter } : {}),
          ...(accessPointFilter ? { accessPoint: accessPointFilter } : {}),
          ...(decisionFilter === "allowed"
            ? { allow: true }
            : decisionFilter === "denied"
              ? { allow: false }
              : {}),
          ...(showOnlyPassages ? { passageOnly: true } : {}),
          ...buildEventRangeParams(eventDateRange),
          sortBy: "eventTime",
          sortOrder: "desc",
        });

        const items = Array.isArray(response?.items) ? response.items : [];
        const pagination = response?.pagination || {};
        total = Number(pagination.total || items.length);
        allItems = allItems.concat(items);

        if (items.length < limit) {
          break;
        }
        offset += items.length;
        page += 1;
      }

      setEvents(allItems);
    } catch (error) {
      console.error("Failed to load employee events:", error);
      message.error("Не удалось загрузить проходы сотрудника");
    } finally {
      setLoading(false);
    }
  }, [
    accessPointFilter,
    constructionSiteFilter,
    counterpartyFilter,
    decisionFilter,
    directionFilter,
    employeeId,
    employeeNameFilter,
    employeeNameHint,
    eventDateRange,
    eventTypeFilter,
    externalEmpId,
    message,
    showOnlyPassages,
  ]);

  useEffect(() => {
    void loadFilterReferences();
  }, [loadFilterReferences]);

  useEffect(() => {
    void loadEmployeeEvents();
  }, [loadEmployeeEvents]);

  const accessPointOptions = useMemo(
    () =>
      (providerAccessPoints || []).map((item) => ({
        value: item.id,
        label: item.label || item.name || String(item.id),
      })),
    [providerAccessPoints],
  );

  const eventTypeOptions = useMemo(() => {
    const baseOptions = [
      { value: "all", label: "Все типы" },
      { value: "PASS_DETECTED", label: "Проход" },
      { value: "PASS_GRANTED", label: "Разрешенный проход" },
      { value: "PASS_DENIED", label: "Запрещенный проход" },
      { value: "AP_ONLINE_STATUS", label: "Статус контроллера" },
    ];

    const seen = new Set(baseOptions.map((item) => item.value));
    for (const item of events || []) {
      const type = item?.eventType;
      if (!type || seen.has(type)) continue;
      seen.add(type);
      baseOptions.push({
        value: type,
        label: EVENT_TYPE_LABELS[type] || type,
      });
    }

    return baseOptions;
  }, [events]);

  const employeeLabel = employeeNameHint || "Сотрудник";

  const exportToExcel = useCallback(() => {
    if (!events.length) {
      message.warning("Нет данных для экспорта");
      return;
    }

    const rows = events.map((record) => ({
      "Время события": record?.eventTime
        ? dayjs(record.eventTime).format("DD.MM.YYYY HH:mm:ss")
        : "—",
      "ФИО сотрудника": getLocalEmployeeName(record) || getSigurPersonName(record) || "—",
      "ID сотрудника PassDesk": record?.employeeId || "—",
      "ID сотрудника Sigur": record?.externalEmpId || "—",
      Контрагент: getCounterpartyDisplayName(record) || "—",
      "Подразделение / бригада": getEmployeeDepartmentName(record) || "—",
      "Объект (по точке доступа)": getConstructionSiteDisplayLabel(record) || "—",
      "Иерархия точки доступа": getAccessPointHierarchyLabel(record) || "—",
      "Точка доступа": getAccessPointName(record) || (record?.accessPoint ? `#${record.accessPoint}` : "—"),
      "Тип события": getEventTypeLabel(record?.eventType),
      Направление:
        record?.direction === 1
          ? "Вход"
          : record?.direction === 2
            ? "Выход"
            : "—",
      Решение:
        record?.allow === true
          ? "Разрешено"
          : record?.allow === false
            ? "Отказ"
            : "—",
      Карта: getCardKey(record) || "—",
      Причина: getPassReason(record) || "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Проходы сотрудника");
    XLSX.writeFile(
      workbook,
      `SKUD_Employee_Events_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`,
    );
    message.success("Экспорт сформирован");
  }, [events, message]);

  const columns = useMemo(
    () => [
      {
        title: "Время",
        dataIndex: "eventTime",
        key: "eventTime",
        width: 190,
        render: (value) =>
          value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—",
      },
      {
        title: "Сотрудник",
        key: "employee",
        width: 320,
        render: (_, record) => {
          const sigurName = getSigurPersonName(record);
          const localName = getLocalEmployeeName(record);
          const ext = record.externalEmpId ? `ID ${record.externalEmpId}` : "—";

          return (
            <Space direction="vertical" size={0} style={{ width: "100%", minWidth: 0 }}>
              <Text>{localName || sigurName || ext}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sigur: {ext}
              </Text>
            </Space>
          );
        },
      },
      {
        title: "Контрагент",
        dataIndex: "counterpartyName",
        key: "counterpartyName",
        width: 220,
        render: (_, record) => getCounterpartyDisplayName(record) || "—",
      },
      {
        title: "Подразделение / бригада",
        dataIndex: "departmentName",
        key: "departmentName",
        width: 220,
        render: (_, record) => getEmployeeDepartmentName(record) || "—",
      },
      {
        title: "Объект",
        key: "site",
        width: 320,
        render: (_, record) => {
          const constructionSiteLabel = getConstructionSiteDisplayLabel(record);
          const hierarchyLabel = getAccessPointHierarchyLabel(record);
          const primaryLabel = constructionSiteLabel || hierarchyLabel;

          if (!primaryLabel) {
            return "—";
          }

          return (
            <Space direction="vertical" size={0} style={{ width: "100%", minWidth: 0 }}>
              <Text
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={primaryLabel}
              >
                {primaryLabel}
              </Text>
              {hierarchyLabel && hierarchyLabel !== primaryLabel ? (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={`Иерархия: ${hierarchyLabel}`}
                >
                  Иерархия: {hierarchyLabel}
                </Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: "Точка доступа",
        dataIndex: "accessPoint",
        key: "accessPoint",
        width: 280,
        render: (value, record) => {
          const pointName = getAccessPointName(record);
          return pointName || (value ? `#${value}` : "—");
        },
      },
      {
        title: "Тип события",
        dataIndex: "eventType",
        key: "eventType",
        width: 180,
        render: (value) => getEventTypeLabel(value),
      },
      {
        title: "Напр.",
        dataIndex: "direction",
        key: "direction",
        width: 90,
        render: (value) => {
          if (value === 1) return <Tag color="green">Вход</Tag>;
          if (value === 2) return <Tag color="volcano">Выход</Tag>;
          return <Tag>—</Tag>;
        },
      },
      {
        title: "Решение",
        key: "allow",
        width: 120,
        render: (_, record) => {
          if (record?.allow === true) return <Tag color="green">Разрешено</Tag>;
          if (record?.allow === false) return <Tag color="red">Отказ</Tag>;
          return <Tag>—</Tag>;
        },
      },
      {
        title: "Карта",
        key: "card",
        width: 160,
        render: (_, record) => getCardKey(record) || "—",
      },
      {
        title: "Причина",
        key: "reason",
        width: 220,
        render: (_, record) => getPassReason(record) || "—",
      },
    ],
    [],
  );

  return (
    <div
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Card
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
        styles={{
          body: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: 0,
          },
        }}
      >
        <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/skud?tab=events")}
              style={{ width: "fit-content" }}
            >
              Назад к событиям
            </Button>
            <Text strong style={{ fontSize: 16 }}>
              Проходы сотрудника
            </Text>
            <Text type="secondary">
              {employeeLabel}
            </Text>
            <Space size={8} wrap>
              {employeeId ? <Tag>PassDesk ID: {employeeId}</Tag> : null}
              {externalEmpId ? <Tag>Sigur ID: {externalEmpId}</Tag> : null}
            </Space>
          </Space>

          <Divider style={{ margin: 0 }} />

          <Card size="small" title="Фильтры">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap style={{ width: "100%" }}>
                <RangePicker
                  value={eventDateRange}
                  onChange={setEventDateRange}
                  format="DD.MM.YYYY"
                  allowEmpty={[false, false]}
                />
                <Input
                  placeholder="ФИО / ID сотрудника"
                  value={employeeNameFilter}
                  onChange={(event) => setEmployeeNameFilter(event.target.value)}
                  allowClear
                  style={{ width: 240 }}
                />
                <Select
                  showSearch
                  allowClear
                  style={{ width: 220 }}
                  placeholder="Подрядчик (Sigur)"
                  options={counterpartyOptions}
                  value={counterpartyFilter}
                  loading={filtersLoading}
                  onChange={(value) => setCounterpartyFilter(value || undefined)}
                  optionFilterProp="label"
                />
                <Select
                  showSearch
                  allowClear
                  style={{ width: 220 }}
                  placeholder="Объект (Sigur)"
                  options={constructionSiteOptions}
                  value={constructionSiteFilter}
                  loading={filtersLoading}
                  onChange={(value) => setConstructionSiteFilter(value || undefined)}
                  optionFilterProp="label"
                />
                <Select
                  showSearch
                  allowClear
                  style={{ width: 300 }}
                  placeholder="Точка доступа"
                  options={accessPointOptions}
                  value={accessPointFilter}
                  loading={providerAccessPointsLoading}
                  onChange={(value) => setAccessPointFilter(value || undefined)}
                  optionFilterProp="label"
                />
                <Select
                  style={{ width: 200 }}
                  options={eventTypeOptions}
                  value={eventTypeFilter}
                  onChange={setEventTypeFilter}
                />
                <Select
                  style={{ width: 170 }}
                  options={[
                    { value: "all", label: "Все решения" },
                    { value: "allowed", label: "Разрешено" },
                    { value: "denied", label: "Отказ" },
                  ]}
                  value={decisionFilter}
                  onChange={setDecisionFilter}
                />
                <Select
                  style={{ width: 170 }}
                  options={[
                    { value: "all", label: "Все направления" },
                    { value: "1", label: "Вход" },
                    { value: "2", label: "Выход" },
                  ]}
                  value={directionFilter}
                  onChange={setDirectionFilter}
                />
              </Space>
              <Space wrap>
                <Space size={8}>
                  <Text type="secondary">Показывать только проходы</Text>
                  <Switch checked={showOnlyPassages} onChange={setShowOnlyPassages} />
                </Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    void loadEmployeeEvents();
                  }}
                  loading={loading}
                >
                  Обновить
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={exportToExcel}
                  disabled={!events.length}
                >
                  Экспорт в Excel
                </Button>
              </Space>
            </Space>
          </Card>

          <Card
            title="Журнал проходов"
            extra={<Text type="secondary">Записей: {events.length}</Text>}
          >
            <Table
              rowKey={getEventRowKey}
              columns={columns}
              dataSource={events}
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                pageSizeOptions: ["20", "50", "100", "200"],
              }}
              scroll={{ x: 1700 }}
            />
          </Card>
        </Space>
      </Card>
    </div>
  );
};

export default SkudEmployeeEventsPage;
