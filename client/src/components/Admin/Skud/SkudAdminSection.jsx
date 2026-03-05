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
import { ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import skudService from "@/services/skudService";

const { Text } = Typography;

const SkudAdminSection = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
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
          if (value === 1) return <Tag color="blue">IN</Tag>;
          if (value === 2) return <Tag color="geekblue">OUT</Tag>;
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
            <Tag color="green">ALLOW</Tag>
          ) : (
            <Tag color="red">DENY</Tag>
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
          if (value === "success") return <Tag color="green">success</Tag>;
          if (value === "failed") return <Tag color="red">failed</Tag>;
          if (value === "processing") return <Tag color="blue">processing</Tag>;
          return <Tag color="orange">pending</Tag>;
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
          if (value === "active") return <Tag color="green">active</Tag>;
          if (value === "blocked") return <Tag color="red">blocked</Tag>;
          if (value === "unbound") return <Tag color="gold">unbound</Tag>;
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
          <Text type="secondary">Мониторинг проходов, задач синхронизации и состояния карт.</Text>
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
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Обновить
          </Button>
        </Space>
      </Space>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Auth"
              value={state.health?.authOk ? "OK" : "FAIL"}
              valueStyle={{ color: state.health?.authOk ? "#3f8600" : "#cf1322" }}
            />
            <Text type="secondary">Провайдер: {state.health?.provider || "—"}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Проходы" value={state.stats?.events?.total || 0} />
            <Text type="secondary">Denied: {state.stats?.events?.denied || 0}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Sync failed" value={state.stats?.syncJobs?.failed || 0} />
            <Text type="secondary">Pending: {state.stats?.syncJobs?.pending || 0}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Заблокировано" value={state.stats?.blockedEmployees || 0} />
            <Text type="secondary">Deny rate: {state.stats?.events?.denyRate || 0}%</Text>
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
