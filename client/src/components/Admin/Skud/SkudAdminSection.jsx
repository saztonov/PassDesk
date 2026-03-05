import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { DownloadOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import skudService from "@/services/skudService";

const { Text } = Typography;

const EVENT_TYPE_LABELS = {
  PASS_DETECTED: "Проход",
  PASS_GRANTED: "Разрешенный проход",
  PASS_DENIED: "Запрещенный проход",
  AP_ONLINE_STATUS: "Статус контроллера",
};

const toRecord = (value) => (value && typeof value === "object" ? value : {});

const getRawEventItem = (record) => {
  const rawPayload = toRecord(record?.rawPayload);
  return toRecord(rawPayload.rawItem || rawPayload);
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

const getAccessPointName = (record) => {
  const rawItem = getRawEventItem(record);
  const value =
    rawItem?.additionalData?.accessPoint?.name ||
    rawItem?.additionalData?.access_point?.name ||
    rawItem?.data?.accessPointName ||
    rawItem?.data?.access_point_name ||
    null;
  return value ? String(value).trim() : "";
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

const SkudAdminSection = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [pullingEvents, setPullingEvents] = useState(false);
  const [syncingEmployeeId, setSyncingEmployeeId] = useState("");
  const [showOnlyPassages, setShowOnlyPassages] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [state, setState] = useState({
    health: null,
    stats: null,
    events: {
      items: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    },
    syncJobs: {
      items: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    },
    cards: {
      items: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [health, stats, events, syncJobs, cards] = await Promise.all([
        skudService.getHealth(),
        skudService.getStats(),
        skudService.getEvents({
          limit: 50,
          offset: 0,
          passageOnly: showOnlyPassages,
          ...(eventTypeFilter !== "all" ? { eventType: eventTypeFilter } : {}),
        }),
        skudService.getSyncJobs({ limit: 20, offset: 0 }),
        skudService.getCards({ limit: 20, offset: 0 }),
      ]);

      setState({
        health,
        stats,
        events,
        syncJobs,
        cards,
      });
    } catch (error) {
      console.error("Failed to load SKUD admin data:", error);
      message.error("Не удалось загрузить данные СКУД");
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, message, showOnlyPassages]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncEmployee = useCallback(async () => {
    const employeeId = String(syncingEmployeeId || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    try {
      await skudService.syncEmployee(employeeId);
      message.success("Задача синхронизации поставлена в очередь");
      setSyncingEmployeeId("");
      await loadData();
    } catch (error) {
      console.error("Failed to enqueue employee sync:", error);
      message.error("Не удалось поставить синхронизацию в очередь");
    }
  }, [loadData, message, syncingEmployeeId]);

  const handlePullEvents = useCallback(async () => {
    setPullingEvents(true);
    try {
      const result = await skudService.pullEvents({ limit: 200 });
      message.success(`События подтянуты из Sigur: ${result?.imported || 0}`);
      await loadData();
    } catch (error) {
      console.error("Failed to pull events from Sigur:", error);
      message.error("Не удалось подтянуть события из Sigur");
    } finally {
      setPullingEvents(false);
    }
  }, [loadData, message]);

  const eventsColumns = useMemo(
    () => [
      {
        title: "Время",
        dataIndex: "eventTime",
        key: "eventTime",
        width: 190,
        render: (value) => (
          <span style={{ whiteSpace: "nowrap" }}>
            {value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—"}
          </span>
        ),
      },
      {
        title: "Сотрудник",
        key: "employee",
        render: (_, record) => {
          const employee = record.employee;
          const localFullName = [employee?.lastName, employee?.firstName, employee?.middleName]
            .filter(Boolean)
            .join(" ")
            .trim();
          const sigurName = getSigurPersonName(record);
          const ext = record.externalEmpId ? `ID ${record.externalEmpId}` : "—";

          if (localFullName) {
            return (
              <Space direction="vertical" size={0}>
                <Text>{localFullName}</Text>
                {record.externalEmpId ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Sigur: {ext}
                  </Text>
                ) : null}
              </Space>
            );
          }

          if (sigurName) {
            return (
              <Space direction="vertical" size={0}>
                <Text>{sigurName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Sigur: {ext}
                </Text>
              </Space>
            );
          }

          return ext;
        },
      },
      {
        title: "Точка",
        dataIndex: "accessPoint",
        key: "accessPoint",
        width: 220,
        render: (value, record) => {
          const pointName = getAccessPointName(record);
          if (!pointName) {
            return value === null || value === undefined ? "—" : `#${value}`;
          }

          return (
            <Space direction="vertical" size={0}>
              <Text>{pointName}</Text>
              {value !== null && value !== undefined ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ID: {value}
                </Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: "Тип события",
        dataIndex: "eventType",
        key: "eventType",
        width: 180,
        render: (value) => EVENT_TYPE_LABELS[value] || value || "—",
      },
      {
        title: "Напр.",
        dataIndex: "direction",
        key: "direction",
        width: 90,
        render: (value) => {
          if (value === 1) return <Tag color="blue">Вход</Tag>;
          if (value === 2) return <Tag color="geekblue">Выход</Tag>;
          return <Tag>—</Tag>;
        },
      },
      {
        title: "Решение",
        dataIndex: "allow",
        key: "allow",
        width: 120,
        render: (value) =>
          value === null || value === undefined ? (
            <Tag>—</Tag>
          ) : value ? (
            <Tag color="green">Разрешено</Tag>
          ) : (
            <Tag color="red">Отказ</Tag>
          ),
      },
      {
        title: "Причина / Карта",
        key: "reason",
        width: 280,
        render: (_, record) => {
          const reason = getPassReason(record);
          const cardKey = getCardKey(record);
          if (!reason && !cardKey) return "—";

          return (
            <Space direction="vertical" size={0}>
              {reason ? <Text>{reason}</Text> : null}
              {cardKey ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Ключ: {cardKey}
                </Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: "Сообщение",
        dataIndex: "decisionMessage",
        key: "decisionMessage",
        render: (value) => value || "—",
      },
    ],
    [],
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
    for (const item of state.events?.items || []) {
      const type = item?.eventType;
      if (!type || seen.has(type)) continue;
      seen.add(type);
      baseOptions.push({
        value: type,
        label: EVENT_TYPE_LABELS[type] || type,
      });
    }

    return baseOptions;
  }, [state.events?.items]);

  const syncColumns = useMemo(
    () => [
      {
        title: "Создано",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 170,
        render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—"),
      },
      {
        title: "Операция",
        dataIndex: "operation",
        key: "operation",
        width: 160,
      },
      {
        title: "Статус",
        dataIndex: "status",
        key: "status",
        width: 130,
        render: (value) => {
          if (value === "success") return <Tag color="green">Успешно</Tag>;
          if (value === "failed") return <Tag color="red">Ошибка</Tag>;
          if (value === "processing") return <Tag color="blue">В процессе</Tag>;
          return <Tag color="orange">Ожидает</Tag>;
        },
      },
      {
        title: "Сотрудник",
        key: "employee",
        render: (_, record) => {
          const employee = record.employee;
          const fullName = [employee?.lastName, employee?.firstName, employee?.middleName]
            .filter(Boolean)
            .join(" ")
            .trim();
          return fullName || record.employeeId || "—";
        },
      },
      {
        title: "Ошибка",
        dataIndex: "errorMessage",
        key: "errorMessage",
        render: (value) => value || "—",
      },
    ],
    [],
  );

  const cardColumns = useMemo(
    () => [
      {
        title: "Номер",
        dataIndex: "cardNumber",
        key: "cardNumber",
      },
      {
        title: "Тип",
        dataIndex: "cardType",
        key: "cardType",
        width: 120,
      },
      {
        title: "Статус",
        dataIndex: "status",
        key: "status",
        width: 130,
        render: (value) => {
          if (value === "active") return <Tag color="green">Активна</Tag>;
          if (value === "blocked") return <Tag color="red">Заблокирована</Tag>;
          if (value === "unbound") return <Tag color="gold">Отвязана</Tag>;
          return <Tag>{value || "—"}</Tag>;
        },
      },
      {
        title: "Сотрудник",
        dataIndex: "employeeId",
        key: "employeeId",
        render: (value) => value || "—",
      },
      {
        title: "Обновлено",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 170,
        render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—"),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
      <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
        <Space direction="vertical" size={0}>
          <Text strong>СКУД (Sigur)</Text>
          <Text type="secondary">
            Мониторинг проходов, задач синхронизации и состояния карт.
          </Text>
        </Space>

        <Space>
          <Space size={8}>
            <Text type="secondary">Только проходы</Text>
            <Switch checked={showOnlyPassages} onChange={setShowOnlyPassages} />
          </Space>
          <Select
            style={{ width: 220 }}
            options={eventTypeOptions}
            value={eventTypeFilter}
            onChange={setEventTypeFilter}
          />
          <Input
            placeholder="employeeId"
            value={syncingEmployeeId}
            onChange={(event) => setSyncingEmployeeId(event.target.value)}
            style={{ width: 260 }}
          />
          <Button type="primary" icon={<SyncOutlined />} onClick={handleSyncEmployee}>
            Пересинхронизировать
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handlePullEvents}
            loading={pullingEvents}
          >
            Подтянуть события
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Обновить
          </Button>
        </Space>
      </Space>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Авторизация"
              value={state.health?.authOk ? "Успех" : "Ошибка"}
              valueStyle={{ color: state.health?.authOk ? "#3f8600" : "#cf1322" }}
            />
            <Text type="secondary">Провайдер: {state.health?.provider || "—"}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Проходы" value={state.stats?.events?.total || 0} />
            <Text type="secondary">Отказов: {state.stats?.events?.denied || 0}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Ошибки синхронизации" value={state.stats?.syncJobs?.failed || 0} />
            <Text type="secondary">Ожидают: {state.stats?.syncJobs?.pending || 0}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Заблокировано" value={state.stats?.blockedEmployees || 0} />
            <Text type="secondary">Доля отказов: {state.stats?.events?.denyRate || 0}%</Text>
          </Card>
        </Col>
      </Row>

      <Card title="Последние события проходов">
        <Table
          rowKey="id"
          columns={eventsColumns}
          dataSource={state.events?.items || []}
          loading={loading}
          pagination={false}
          scroll={{ x: 1500 }}
        />
      </Card>

      <Card title="Очередь синхронизации">
        <Table
          rowKey="id"
          columns={syncColumns}
          dataSource={state.syncJobs?.items || []}
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Card title="Физические карты">
        <Table
          rowKey="id"
          columns={cardColumns}
          dataSource={state.cards?.items || []}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>
    </Space>
  );
};

export default SkudAdminSection;
