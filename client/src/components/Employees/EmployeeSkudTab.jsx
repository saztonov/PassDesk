import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CreditCardOutlined,
  LockOutlined,
  DisconnectOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import skudService from "@/services/skudService";

const { Text } = Typography;

const CARD_STATUS_LABEL = {
  active: { text: "Активна", color: "green" },
  blocked: { text: "Заблокирована", color: "red" },
  unbound: { text: "Не привязана", color: "default" },
};

const EmployeeSkudTab = ({ employee }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();

  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const employeeId = employee?.id;

  const loadCards = useCallback(async () => {
    if (!employeeId) return;
    setCardsLoading(true);
    try {
      const result = await skudService.getCards({ employeeId, limit: 50 });
      const rows = result?.rows || result?.cards || (Array.isArray(result) ? result : []);
      setCards(rows);
    } catch {
      // тихо
    } finally {
      setCardsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleAssign = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const cardNumber = values.cardNumber?.trim();
    if (!cardNumber) return;

    setSubmitting(true);
    try {
      await skudService.assignCard({ employeeId, cardNumber });
      message.success("Пропуск выдан");
      form.resetFields();
      await loadCards();
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Ошибка при выдаче пропуска";
      message.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async (card) => {
    modal.confirm({
      title: "Заблокировать карту?",
      content: `Карта ${card.cardNumber} будет заблокирована в СКУД`,
      okText: "Заблокировать",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        setActionLoadingId(card.id);
        try {
          await skudService.blockCard(card.id);
          message.success("Карта заблокирована");
          await loadCards();
        } catch (err) {
          message.error(err?.response?.data?.message || "Ошибка блокировки");
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  const handleUnbind = async (card) => {
    modal.confirm({
      title: "Отвязать карту?",
      content: `Карта ${card.cardNumber} будет отвязана от сотрудника`,
      okText: "Отвязать",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        setActionLoadingId(card.id);
        try {
          await skudService.unbindCard(card.id);
          message.success("Карта отвязана");
          await loadCards();
        } catch (err) {
          message.error(err?.response?.data?.message || "Ошибка при отвязке");
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  if (!employeeId) {
    return (
      <Alert
        type="info"
        message="Сохраните сотрудника, чтобы назначить пропуск"
        showIcon
        style={{ marginTop: 8 }}
      />
    );
  }

  const columns = [
    {
      title: "Номер карты",
      dataIndex: "cardNumber",
      key: "cardNumber",
      render: (val) => (
        <Space>
          <CreditCardOutlined />
          <Text code>{val}</Text>
        </Space>
      ),
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (val) => {
        const s = CARD_STATUS_LABEL[val] || { text: val, color: "default" };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: "Выдана",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 110,
      render: (val) =>
        val ? new Date(val).toLocaleDateString("ru-RU") : "—",
    },
    {
      title: "",
      key: "actions",
      width: 140,
      render: (_, card) => {
        const isLoading = actionLoadingId === card.id;
        return (
          <Space size={4}>
            {card.status === "active" && (
              <Button
                size="small"
                danger
                icon={<LockOutlined />}
                loading={isLoading}
                onClick={() => handleBlock(card)}
                title="Заблокировать"
              />
            )}
            {card.status !== "unbound" && (
              <Button
                size="small"
                icon={<DisconnectOutlined />}
                loading={isLoading}
                onClick={() => handleUnbind(card)}
                title="Отвязать"
              />
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Выдать новый пропуск */}
      <Form form={form} layout="inline" onFinish={handleAssign}>
        <Form.Item
          name="cardNumber"
          rules={[{ required: true, message: "Введите номер карты" }]}
          style={{ flex: 1, marginBottom: 0 }}
        >
          <Input
            prefix={<CreditCardOutlined />}
            placeholder="Номер карты (приложите к считывателю или введите)"
            allowClear
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            icon={<CreditCardOutlined />}
          >
            Выдать пропуск
          </Button>
        </Form.Item>
      </Form>

      {/* Список карт */}
      <Spin spinning={cardsLoading}>
        {cards.length === 0 && !cardsLoading ? (
          <Text type="secondary">Карты не назначены</Text>
        ) : (
          <Table
            dataSource={cards}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: "Карты не назначены" }}
          />
        )}
      </Spin>

      <Button
        size="small"
        icon={<SyncOutlined />}
        onClick={loadCards}
        loading={cardsLoading}
        type="text"
      >
        Обновить
      </Button>
    </Space>
  );
};

export default EmployeeSkudTab;
