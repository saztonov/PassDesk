import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { DownloadOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import skudService from "@/services/skudService";

const { Text } = Typography;

const SkudAdminSection = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [pullingEvents, setPullingEvents] = useState(false);
  const [syncingEmployeeId, setSyncingEmployeeId] = useState("");
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
        skudService.getEvents({ limit: 20, offset: 0 }),
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
  }, [message]);

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
        width: 170,
        render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—"),
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
          return fullName || record.externalEmpId || "—";
        },
      },
      {
        title: "Точка",
        dataIndex: "accessPoint",
        key: "accessPoint",
        width: 100,
        render: (value) => (value === null || value === undefined ? "—" : value),
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
        title: "Сообщение",
        dataIndex: "decisionMessage",
        key: "decisionMessage",
        render: (value) => value || "—",
      },
    ],
    [],
  );

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
          scroll={{ x: 1000 }}
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
