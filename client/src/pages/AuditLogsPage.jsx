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
import {
  FETCH_LIMIT,
  EVENT_CATEGORY_OPTIONS,
  EVENT_CATEGORY_META,
  STATUS_LABELS,
  EVENT_TYPE_OPTIONS,
  EVENT_TYPE_META,
  formatDateTime,
  getEmployeeName,
  normalizeSearchText,
  getUserName,
  buildNameMap,
  describeAuditEvent,
  buildEventDetails,
  buildAuditGroups,
} from "@/modules/audit/lib/auditLogsHelpers";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

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
    pageSize: 100,
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
            pageSizeOptions: ["50", "100", "200"],
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
