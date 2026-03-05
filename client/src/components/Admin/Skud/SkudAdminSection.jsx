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
  Popconfirm,
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
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [externalEmpIdInput, setExternalEmpIdInput] = useState("");
  const [employeeReasonInput, setEmployeeReasonInput] = useState("");
  const [employeeActionLoading, setEmployeeActionLoading] = useState(false);
  const [bindingLookupLoading, setBindingLookupLoading] = useState(false);
  const [bindingInfo, setBindingInfo] = useState(null);
  const [assigningCard, setAssigningCard] = useState(false);
  const [cardActionLoadingId, setCardActionLoadingId] = useState(null);
  const [cardEmployeeIdInput, setCardEmployeeIdInput] = useState("");
  const [cardNumberInput, setCardNumberInput] = useState("");
  const [cardTypeInput, setCardTypeInput] = useState("rfid");
  const [cardNotesInput, setCardNotesInput] = useState("");
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
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    setEmployeeActionLoading(true);
    try {
      await skudService.syncEmployee(employeeId);
      message.success("Задача синхронизации поставлена в очередь");
      await loadData();
    } catch (error) {
      console.error("Failed to enqueue employee sync:", error);
      message.error("Не удалось поставить синхронизацию в очередь");
    } finally {
      setEmployeeActionLoading(false);
    }
  }, [employeeIdInput, loadData, message]);

  const handleBlockEmployee = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    setEmployeeActionLoading(true);
    try {
      await skudService.blockEmployee(employeeId, {
        statusReason: employeeReasonInput || "Ручная блокировка",
      });
      message.success("Задача блокировки поставлена в очередь");
      await loadData();
    } catch (error) {
      console.error("Failed to enqueue employee block:", error);
      message.error("Не удалось поставить блокировку в очередь");
    } finally {
      setEmployeeActionLoading(false);
    }
  }, [employeeIdInput, employeeReasonInput, loadData, message]);

  const handleUnblockEmployee = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    setEmployeeActionLoading(true);
    try {
      await skudService.unblockEmployee(employeeId, {
        statusReason: employeeReasonInput || "Ручная разблокировка",
      });
      message.success("Задача разблокировки поставлена в очередь");
      await loadData();
    } catch (error) {
      console.error("Failed to enqueue employee unblock:", error);
      message.error("Не удалось поставить разблокировку в очередь");
    } finally {
      setEmployeeActionLoading(false);
    }
  }, [employeeIdInput, employeeReasonInput, loadData, message]);

  const handleLoadBinding = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    setBindingLookupLoading(true);
    try {
      const binding = await skudService.getEmployeeBinding(employeeId);
      setBindingInfo(binding || null);
      setExternalEmpIdInput(binding?.externalEmpId || "");
      if (binding?.externalEmpId) {
        message.success("Привязка загружена");
      } else {
        message.info("Активная привязка не найдена");
      }
    } catch (error) {
      console.error("Failed to load employee binding:", error);
      setBindingInfo(null);
      message.error("Не удалось загрузить привязку");
    } finally {
      setBindingLookupLoading(false);
    }
  }, [employeeIdInput, message]);

  const handleSaveBinding = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    const externalEmpId = String(externalEmpIdInput || "").trim();
    if (!employeeId || !externalEmpId) {
      message.warning("Введите employeeId и externalEmpId");
      return;
    }

    setBindingLookupLoading(true);
    try {
      const binding = await skudService.upsertBinding(employeeId, {
        externalSystem: "sigur",
        externalEmpId,
        source: "manual",
      });
      setBindingInfo(binding || null);
      message.success("Привязка сохранена");
      await loadData();
    } catch (error) {
      console.error("Failed to save employee binding:", error);
      message.error("Не удалось сохранить привязку");
    } finally {
      setBindingLookupLoading(false);
    }
  }, [employeeIdInput, externalEmpIdInput, loadData, message]);

  const handleAssignCard = useCallback(async () => {
    const employeeId = String(cardEmployeeIdInput || "").trim();
    const cardNumber = String(cardNumberInput || "").trim();
    if (!employeeId || !cardNumber) {
      message.warning("Введите employeeId и номер карты");
      return;
    }

    setAssigningCard(true);
    try {
      await skudService.assignCard({
        employeeId,
        cardNumber,
        cardType: cardTypeInput || "rfid",
        notes: cardNotesInput || "",
      });
      message.success("Карта поставлена в очередь на привязку");
      setCardNumberInput("");
      setCardNotesInput("");
      await loadData();
    } catch (error) {
      console.error("Failed to assign card:", error);
      message.error("Не удалось привязать карту");
    } finally {
      setAssigningCard(false);
    }
  }, [cardEmployeeIdInput, cardNumberInput, cardTypeInput, cardNotesInput, loadData, message]);

  const handleBlockCard = useCallback(
    async (cardId) => {
      if (!cardId) return;
      setCardActionLoadingId(cardId);
      try {
        await skudService.blockCard(cardId);
        message.success("Карта поставлена в очередь на блокировку");
        await loadData();
      } catch (error) {
        console.error("Failed to block card:", error);
        message.error("Не удалось заблокировать карту");
      } finally {
        setCardActionLoadingId(null);
      }
    },
    [loadData, message],
  );

  const handleUnbindCard = useCallback(
    async (cardId) => {
      if (!cardId) return;
      setCardActionLoadingId(cardId);
      try {
        await skudService.unbindCard(cardId);
        message.success("Карта поставлена в очередь на отвязку");
        await loadData();
      } catch (error) {
        console.error("Failed to unbind card:", error);
        message.error("Не удалось отвязать карту");
      } finally {
        setCardActionLoadingId(null);
      }
    },
    [loadData, message],
  );

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
      {
        title: "Действия",
        key: "actions",
        width: 220,
        render: (_, record) => (
          <Space>
            <Popconfirm
              title="Заблокировать карту?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => handleBlockCard(record.id)}
            >
              <Button
                size="small"
                danger
                loading={cardActionLoadingId === record.id}
                disabled={record.status === "blocked"}
              >
                Блокировать
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Отвязать карту?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => handleUnbindCard(record.id)}
            >
              <Button
                size="small"
                loading={cardActionLoadingId === record.id}
                disabled={record.status === "unbound"}
              >
                Отвязать
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [cardActionLoadingId, handleBlockCard, handleUnbindCard],
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

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <Card title="Управление сотрудником в СКУД">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Input
                placeholder="employeeId (UUID сотрудника в PassDesk)"
                value={employeeIdInput}
                onChange={(event) => setEmployeeIdInput(event.target.value)}
              />
              <Input
                placeholder="Причина (опционально)"
                value={employeeReasonInput}
                onChange={(event) => setEmployeeReasonInput(event.target.value)}
              />
              <Space wrap>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={handleSyncEmployee}
                  loading={employeeActionLoading}
                >
                  Синхронизировать
                </Button>
                <Button
                  danger
                  onClick={handleBlockEmployee}
                  loading={employeeActionLoading}
                >
                  Блокировать
                </Button>
                <Button
                  onClick={handleUnblockEmployee}
                  loading={employeeActionLoading}
                >
                  Разблокировать
                </Button>
              </Space>

              <Input
                placeholder="externalEmpId (ID сотрудника в Sigur)"
                value={externalEmpIdInput}
                onChange={(event) => setExternalEmpIdInput(event.target.value)}
              />
              <Space wrap>
                <Button onClick={handleLoadBinding} loading={bindingLookupLoading}>
                  Загрузить привязку
                </Button>
                <Button
                  type="primary"
                  onClick={handleSaveBinding}
                  loading={bindingLookupLoading}
                >
                  Сохранить привязку
                </Button>
              </Space>

              {bindingInfo ? (
                <Text type="secondary">
                  Текущая привязка: Sigur ID {bindingInfo.externalEmpId}
                </Text>
              ) : (
                <Text type="secondary">Текущая привязка: не задана</Text>
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="Привязка карты">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Input
                placeholder="employeeId (UUID сотрудника в PassDesk)"
                value={cardEmployeeIdInput}
                onChange={(event) => setCardEmployeeIdInput(event.target.value)}
              />
              <Input
                placeholder="Номер карты"
                value={cardNumberInput}
                onChange={(event) => setCardNumberInput(event.target.value)}
              />
              <Select
                value={cardTypeInput}
                onChange={setCardTypeInput}
                options={[
                  { value: "rfid", label: "RFID" },
                  { value: "nfc", label: "NFC" },
                  { value: "other", label: "Другое" },
                ]}
              />
              <Input
                placeholder="Комментарий (опционально)"
                value={cardNotesInput}
                onChange={(event) => setCardNotesInput(event.target.value)}
              />
              <Button
                type="primary"
                onClick={handleAssignCard}
                loading={assigningCard}
              >
                Привязать карту
              </Button>
            </Space>
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
