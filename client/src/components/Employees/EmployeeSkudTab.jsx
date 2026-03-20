import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CreditCardOutlined,
  LockOutlined,
  DisconnectOutlined,
  SyncOutlined,
  SaveOutlined,
  SwapOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import skudService from "@/services/skudService";
import { employeeApi } from "@/entities/employee";
import { constructionSiteService } from "@/services/constructionSiteService";

const { Text } = Typography;

const CARD_STATUS_LABEL = {
  active: { text: "Активна", color: "green" },
  blocked: { text: "Заблокирована", color: "red" },
  unbound: { text: "Не привязана", color: "default" },
};

const EmployeeSkudTab = ({ employee }) => {
  const { message, modal } = App.useApp();
  const [newCardForm] = Form.useForm();
  const [replaceCardForm] = Form.useForm();

  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [replacingCardId, setReplacingCardId] = useState(null);

  // считыватель карт
  const [readerArmed, setReaderArmed] = useState(false);
  const [readerConnected, setReaderConnected] = useState(false);
  const wsRef = useRef(null);

  // объекты
  const [allSites, setAllSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [originalSiteIds, setOriginalSiteIds] = useState([]);
  const [savingSites, setSavingSites] = useState(false);

  const employeeId = employee?.id;

  // инициализация объектов из данных сотрудника (только при смене сотрудника)
  useEffect(() => {
    const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
      ? employee.employeeCounterpartyMappings
      : [];
    const ids = [...new Set(mappings.map((m) => String(m.constructionSiteId)).filter(Boolean))];
    setSelectedSiteIds(ids);
    setOriginalSiteIds(ids);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id]);

  // загрузка всех объектов
  useEffect(() => {
    if (!employeeId) return;
    setSitesLoading(true);
    constructionSiteService
      .getAll()
      .then((res) => {
        const list = res?.data?.data?.constructionSites || res?.data?.data || [];
        setAllSites(list);
      })
      .catch(() => {})
      .finally(() => setSitesLoading(false));
  }, [employeeId]);

  const loadCards = useCallback(async () => {
    if (!employeeId) return;
    setCardsLoading(true);
    try {
      const result = await skudService.getCards({ employeeId, limit: 50 });
      const rows = result?.items || result?.rows || result?.cards || (Array.isArray(result) ? result : []);
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

  // закрываем WS при размонтировании
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const handleDisarmReader = useCallback(() => {
    setReaderArmed(false);
    setReaderConnected(false);
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const handleArmReader = useCallback(() => {
    if (readerArmed) {
      handleDisarmReader();
      return;
    }
    setReaderArmed(true);
    try {
      const ws = new WebSocket("ws://localhost:8765");
      wsRef.current = ws;
      ws.onopen = () => setReaderConnected(true);
      ws.onclose = () => { setReaderConnected(false); wsRef.current = null; };
      ws.onerror = () => {
        message.warning("Агент считывателя недоступен. Запустите start.bat из папки server/skud-agent на этом ПК.", 6);
        setReaderConnected(false);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "card") return;
          const uid = data.sigurCard || data.hexUid;
          if (!uid) return;
          newCardForm.setFieldValue("cardNumber", uid);
        } catch (_e) { /* игнорируем */ }
      };
    } catch (_e) { /* браузер не поддерживает WS */ }
  }, [readerArmed, handleDisarmReader, message, newCardForm]);

  const sitesChanged =
    selectedSiteIds.length !== originalSiteIds.length ||
    selectedSiteIds.some((id) => !originalSiteIds.includes(id));

  const handleSaveSites = async () => {
    setSavingSites(true);
    try {
      await employeeApi.updateConstructionSites(employeeId, selectedSiteIds);
      setOriginalSiteIds(selectedSiteIds);
      message.success("Объекты сохранены");
    } catch {
      message.error("Не удалось сохранить объекты");
    } finally {
      setSavingSites(false);
    }
  };

  const handleAssign = async () => {
    let values;
    try {
      values = await newCardForm.validateFields();
    } catch {
      return;
    }
    const cardNumber = values.cardNumber?.trim();
    if (!cardNumber) return;

    setSubmitting(true);
    try {
      if (sitesChanged) {
        await employeeApi.updateConstructionSites(employeeId, selectedSiteIds);
        setOriginalSiteIds(selectedSiteIds);
      }
      await skudService.assignCard({ employeeId, cardNumber });
      message.success("Пропуск выдан");
      newCardForm.resetFields();
      await loadCards();
    } catch (err) {
      message.error(err?.response?.data?.message || "Ошибка при выдаче пропуска");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = (card) => {
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

  const handleUnbind = (card) => {
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

  const handleReplace = async (oldCard) => {
    let values;
    try {
      values = await replaceCardForm.validateFields();
    } catch {
      return;
    }
    const newCardNumber = values[`replaceCard_${oldCard.id}`]?.trim();
    if (!newCardNumber) return;

    setActionLoadingId(oldCard.id);
    try {
      await skudService.blockCard(oldCard.id);
      await skudService.assignCard({ employeeId, cardNumber: newCardNumber });
      message.success("Старая карта заблокирована, новая выдана");
      replaceCardForm.resetFields([`replaceCard_${oldCard.id}`]);
      setReplacingCardId(null);
      await loadCards();
    } catch (err) {
      message.error(err?.response?.data?.message || "Ошибка при замене карты");
    } finally {
      setActionLoadingId(null);
    }
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
      width: 130,
      render: (val) => {
        const s = CARD_STATUS_LABEL[val] || { text: val, color: "default" };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: "Выдана",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 100,
      render: (val) => val ? new Date(val).toLocaleDateString("ru-RU") : "—",
    },
    {
      title: "Действия",
      key: "actions",
      width: 220,
      render: (_, card) => {
        const isLoading = actionLoadingId === card.id;
        const isReplacing = replacingCardId === card.id;

        return (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Space size={4}>
              {card.status === "active" && (
                <>
                  <Tooltip title="Заблокировать">
                    <Button
                      size="small"
                      danger
                      icon={<LockOutlined />}
                      loading={isLoading && !isReplacing}
                      onClick={() => handleBlock(card)}
                    />
                  </Tooltip>
                  <Tooltip title="Заблокировать и выдать новую">
                    <Button
                      size="small"
                      icon={<SwapOutlined />}
                      loading={isLoading && isReplacing}
                      onClick={() =>
                        setReplacingCardId(isReplacing ? null : card.id)
                      }
                    >
                      Заменить
                    </Button>
                  </Tooltip>
                </>
              )}
              {card.status !== "unbound" && (
                <Tooltip title="Отвязать">
                  <Button
                    size="small"
                    icon={<DisconnectOutlined />}
                    loading={isLoading}
                    onClick={() => handleUnbind(card)}
                  />
                </Tooltip>
              )}
            </Space>

            {/* Инлайн-форма замены карты */}
            {isReplacing && (
              <Form form={replaceCardForm} layout="inline" style={{ marginTop: 4 }}>
                <Form.Item
                  name={`replaceCard_${card.id}`}
                  rules={[{ required: true, message: "Введите номер" }]}
                  style={{ marginBottom: 0, flex: 1 }}
                >
                  <Input
                    size="small"
                    prefix={<CreditCardOutlined />}
                    placeholder="Номер новой карты"
                    autoFocus
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    size="small"
                    type="primary"
                    loading={isLoading}
                    onClick={() => handleReplace(card)}
                  >
                    Выдать
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>

      {/* Объекты доступа */}
      <div>
        <Text strong style={{ display: "block", marginBottom: 6 }}>
          Объекты доступа
        </Text>
        <Spin spinning={sitesLoading}>
          {allSites.length === 0 && !sitesLoading ? (
            <Text type="secondary">Нет объектов</Text>
          ) : (
            <Space wrap style={{ maxHeight: 160, overflowY: "auto", display: "flex" }}>
              {allSites.map((site) => (
                <Checkbox
                  key={site.id}
                  checked={selectedSiteIds.includes(String(site.id))}
                  onChange={(e) =>
                    setSelectedSiteIds((prev) =>
                      e.target.checked
                        ? [...prev, String(site.id)]
                        : prev.filter((id) => id !== String(site.id)),
                    )
                  }
                >
                  {site.shortName || site.name}
                </Checkbox>
              ))}
            </Space>
          )}
        </Spin>
        {sitesChanged && (
          <Button
            size="small"
            type="primary"
            ghost
            icon={<SaveOutlined />}
            loading={savingSites}
            onClick={handleSaveSites}
            style={{ marginTop: 8 }}
          >
            Сохранить объекты
          </Button>
        )}
      </div>

      <Divider style={{ margin: "4px 0" }} />

      {/* Список карт */}
      <div>
        <Space style={{ marginBottom: 6 }} align="center">
          <Text strong>Карты</Text>
          <Button
            size="small"
            type="text"
            icon={<SyncOutlined />}
            onClick={loadCards}
            loading={cardsLoading}
          />
        </Space>
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
            />
          )}
        </Spin>
      </div>

      <Divider style={{ margin: "4px 0" }} />

      {/* Выдать новый пропуск */}
      <div>
        <Text strong style={{ display: "block", marginBottom: 6 }}>
          Выдать новый пропуск
        </Text>
        <Form form={newCardForm} layout="inline" onFinish={handleAssign}>
          <Form.Item
            name="cardNumber"
            rules={[{ required: true, message: "Введите номер карты" }]}
            style={{ flex: 1, marginBottom: 0 }}
          >
            <Input
              prefix={<CreditCardOutlined />}
              placeholder="Приложите карту к считывателю или введите вручную"
              allowClear
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              icon={<WifiOutlined />}
              danger={readerArmed}
              onClick={handleArmReader}
              title={readerArmed ? (readerConnected ? "Считыватель активен" : "Ожидание (ввод вручную)") : "Ожидать карту от считывателя"}
            >
              {readerArmed ? (readerConnected ? "Считыватель активен" : "Ожидание...") : "Ожидать карту"}
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              icon={<CreditCardOutlined />}
            >
              Выдать
            </Button>
          </Form.Item>
        </Form>
        {sitesChanged && (
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
            Объекты будут сохранены вместе с выдачей пропуска
          </Text>
        )}
      </div>

    </Space>
  );
};

export default EmployeeSkudTab;
