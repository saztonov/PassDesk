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
  Tabs,
  Tag,
  Typography,
  Popconfirm,
} from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import skudService from "@/services/skudService";

const { Text } = Typography;
const { TextArea } = Input;

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
  const [activeTab, setActiveTab] = useState("events");
  const [localEmployeeSearch, setLocalEmployeeSearch] = useState("");
  const [providerEmployeeSearch, setProviderEmployeeSearch] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [localEmployees, setLocalEmployees] = useState([]);
  const [providerEmployees, setProviderEmployees] = useState([]);
  const [selectedLocalEmployeeId, setSelectedLocalEmployeeId] = useState(null);
  const [selectedProviderEmployeeId, setSelectedProviderEmployeeId] = useState(null);
  const [bindingActionLoading, setBindingActionLoading] = useState(false);
  const [qrEmployeeIdInput, setQrEmployeeIdInput] = useState("");
  const [qrTokenTypeInput, setQrTokenTypeInput] = useState("persistent");
  const [qrChannelInput, setQrChannelInput] = useState("web");
  const [qrActionLoading, setQrActionLoading] = useState(false);
  const [qrState, setQrState] = useState(null);
  const [qrVerifyToken, setQrVerifyToken] = useState("");
  const [qrVerifyResult, setQrVerifyResult] = useState(null);
  const [qrVerifyLoading, setQrVerifyLoading] = useState(false);
  const [showOnlyPassages, setShowOnlyPassages] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(20);
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
          limit: eventsPageSize,
          offset: (eventsPage - 1) * eventsPageSize,
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
  }, [eventTypeFilter, eventsPage, eventsPageSize, message, showOnlyPassages]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleShowOnlyPassagesChange = useCallback((checked) => {
    setEventsPage(1);
    setShowOnlyPassages(checked);
  }, []);

  const handleEventTypeFilterChange = useCallback((value) => {
    setEventsPage(1);
    setEventTypeFilter(value);
  }, []);

  const handleEventsTableChange = useCallback(
    (pagination) => {
      const nextPageSize = Number(pagination?.pageSize || 20);
      const nextPage = Number(pagination?.current || 1);

      if (nextPageSize !== eventsPageSize) {
        setEventsPageSize(nextPageSize);
        setEventsPage(1);
        return;
      }

      setEventsPage(nextPage);
    },
    [eventsPageSize],
  );

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

  const loadMappingLists = useCallback(async () => {
    setMappingLoading(true);
    try {
      const [localResult, providerResult] = await Promise.all([
        skudService.getLocalEmployees({
          limit: 30,
          offset: 0,
          search: localEmployeeSearch || undefined,
        }),
        skudService.getProviderEmployees({
          limit: 30,
          offset: 0,
          search: providerEmployeeSearch || undefined,
        }),
      ]);

      setLocalEmployees(localResult?.items || []);
      setProviderEmployees(providerResult?.items || []);
    } catch (error) {
      console.error("Failed to load mapping lists:", error);
      message.error("Не удалось загрузить списки для сопоставления");
    } finally {
      setMappingLoading(false);
    }
  }, [localEmployeeSearch, message, providerEmployeeSearch]);

  useEffect(() => {
    loadMappingLists();
  }, [loadMappingLists]);

  const handleBindSelectedEmployees = useCallback(async () => {
    const employeeId = String(selectedLocalEmployeeId || "").trim();
    const externalEmpId = String(selectedProviderEmployeeId || "").trim();

    if (!employeeId || !externalEmpId) {
      message.warning("Выбери сотрудника PassDesk и сотрудника Sigur");
      return;
    }

    setBindingActionLoading(true);
    try {
      await skudService.upsertBinding(employeeId, {
        externalSystem: "sigur",
        externalEmpId,
        source: "manual",
      });
      message.success("Сотрудники успешно сопоставлены");
      await Promise.all([loadData(), loadMappingLists()]);
    } catch (error) {
      console.error("Failed to bind selected employees:", error);
      message.error("Не удалось сохранить сопоставление");
    } finally {
      setBindingActionLoading(false);
    }
  }, [loadData, loadMappingLists, message, selectedLocalEmployeeId, selectedProviderEmployeeId]);

  const handleIssueQr = useCallback(async () => {
    const employeeId = String(qrEmployeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Введите employeeId");
      return;
    }

    setQrActionLoading(true);
    try {
      const data = await skudService.issueQr({
        employeeId,
        tokenType: qrTokenTypeInput,
        channel: qrChannelInput,
      });

      setQrState(data || null);
      setQrVerifyToken(data?.token || "");
      setQrVerifyResult(null);
      message.success("QR выпущен");
    } catch (error) {
      console.error("Failed to issue QR:", error);
      message.error("Не удалось выпустить QR");
    } finally {
      setQrActionLoading(false);
    }
  }, [message, qrChannelInput, qrEmployeeIdInput, qrTokenTypeInput]);

  const handleCopyQrToken = useCallback(async () => {
    if (!qrState?.token) {
      message.warning("Сначала выпустите QR");
      return;
    }

    try {
      await navigator.clipboard.writeText(qrState.token);
      message.success("Токен скопирован");
    } catch (error) {
      console.error("Failed to copy QR token:", error);
      message.error("Не удалось скопировать токен");
    }
  }, [message, qrState?.token]);

  const handleVerifyQr = useCallback(async () => {
    const token = String(qrVerifyToken || "").trim();
    if (!token) {
      message.warning("Вставьте токен для проверки");
      return;
    }

    setQrVerifyLoading(true);
    try {
      const data = await skudService.verifyQr({
        token,
        markUsed: qrTokenTypeInput === "one_time",
      });

      setQrVerifyResult(data || null);
      message.success(data?.allow ? "Проход разрешен" : "Получен отказ");
    } catch (error) {
      console.error("Failed to verify QR:", error);
      setQrVerifyResult(null);
      message.error("Не удалось проверить QR");
    } finally {
      setQrVerifyLoading(false);
    }
  }, [message, qrTokenTypeInput, qrVerifyToken]);

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

  const localEmployeeColumns = useMemo(
    () => [
      {
        title: "Сотрудник PassDesk",
        key: "fullName",
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text>{record.fullName || "—"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.id}
            </Text>
          </Space>
        ),
      },
      {
        title: "ИНН",
        dataIndex: "inn",
        key: "inn",
        width: 130,
        render: (value) => value || "—",
      },
      {
        title: "Sigur ID",
        key: "binding",
        width: 130,
        render: (_, record) => record?.binding?.externalEmpId || "—",
      },
    ],
    [],
  );

  const providerEmployeeColumns = useMemo(
    () => [
      {
        title: "Sigur ID",
        dataIndex: "id",
        key: "id",
        width: 120,
        render: (value) => value || "—",
      },
      {
        title: "Сотрудник Sigur",
        dataIndex: "name",
        key: "name",
        render: (value, record) => (
          <Space direction="vertical" size={0}>
            <Text>{value || "—"}</Text>
            {record?.departmentName ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.departmentName}
              </Text>
            ) : null}
          </Space>
        ),
      },
      {
        title: "Статус",
        dataIndex: "status",
        key: "status",
        width: 140,
        render: (value) => value || "—",
      },
    ],
    [],
  );

  const localRowSelection = useMemo(
    () => ({
      type: "radio",
      selectedRowKeys: selectedLocalEmployeeId ? [selectedLocalEmployeeId] : [],
      onChange: (selectedKeys) => {
        setSelectedLocalEmployeeId(selectedKeys?.[0] || null);
      },
    }),
    [selectedLocalEmployeeId],
  );

  const providerRowSelection = useMemo(
    () => ({
      type: "radio",
      selectedRowKeys: selectedProviderEmployeeId ? [selectedProviderEmployeeId] : [],
      onChange: (selectedKeys) => {
        setSelectedProviderEmployeeId(selectedKeys?.[0] || null);
      },
    }),
    [selectedProviderEmployeeId],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
      <Space direction="vertical" size={0}>
        <Text strong>СКУД (Sigur)</Text>
        <Text type="secondary">
          Мониторинг проходов, задач синхронизации и состояния карт.
        </Text>
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "events",
            label: "События",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space wrap>
                  <Space size={8}>
                    <Text type="secondary">Только проходы</Text>
                    <Switch checked={showOnlyPassages} onChange={handleShowOnlyPassagesChange} />
                  </Space>
                  <Select
                    style={{ width: 220 }}
                    options={eventTypeOptions}
                    value={eventTypeFilter}
                    onChange={handleEventTypeFilterChange}
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
                    onChange={handleEventsTableChange}
                    pagination={{
                      current: eventsPage,
                      pageSize: eventsPageSize,
                      total: Number(state.events?.pagination?.total || 0),
                      showSizeChanger: true,
                      pageSizeOptions: ["20", "50", "150", "200"],
                      showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
                    }}
                    scroll={{ x: 1500 }}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: "employees",
            label: "Сотрудники",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space wrap>
                  <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                    Обновить
                  </Button>
                </Space>

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

                <Card title="Массовое сопоставление PassDesk ↔ Sigur">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space wrap>
                      <Input
                        placeholder="Поиск PassDesk (ФИО / UUID / ИНН / Sigur ID)"
                        value={localEmployeeSearch}
                        onChange={(event) => setLocalEmployeeSearch(event.target.value)}
                        style={{ width: 360 }}
                      />
                      <Input
                        placeholder="Поиск Sigur (имя / ID / отдел)"
                        value={providerEmployeeSearch}
                        onChange={(event) => setProviderEmployeeSearch(event.target.value)}
                        style={{ width: 320 }}
                      />
                      <Button onClick={loadMappingLists} loading={mappingLoading}>
                        Найти
                      </Button>
                      <Button
                        type="primary"
                        onClick={handleBindSelectedEmployees}
                        loading={bindingActionLoading}
                      >
                        Связать выбранных
                      </Button>
                    </Space>

                    <Row gutter={[12, 12]}>
                      <Col xs={24} xl={12}>
                        <Card size="small" title="Сотрудники PassDesk">
                          <Table
                            rowKey="id"
                            size="small"
                            rowSelection={localRowSelection}
                            columns={localEmployeeColumns}
                            dataSource={localEmployees}
                            loading={mappingLoading}
                            pagination={false}
                            scroll={{ x: 700, y: 360 }}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} xl={12}>
                        <Card size="small" title="Сотрудники Sigur">
                          <Table
                            rowKey={(record) => record.id || `sigur-${record.name}`}
                            size="small"
                            rowSelection={providerRowSelection}
                            columns={providerEmployeeColumns}
                            dataSource={providerEmployees}
                            loading={mappingLoading}
                            pagination={false}
                            scroll={{ x: 700, y: 360 }}
                          />
                        </Card>
                      </Col>
                    </Row>
                  </Space>
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
              </Space>
            ),
          },
          {
            key: "cards",
            label: "Карты",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space wrap>
                  <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                    Обновить
                  </Button>
                </Space>

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
            ),
          },
          {
            key: "qr",
            label: "QR",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Выпуск QR для СКУД">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Input
                      placeholder="employeeId (UUID сотрудника в PassDesk)"
                      value={qrEmployeeIdInput}
                      onChange={(event) => setQrEmployeeIdInput(event.target.value)}
                    />
                    <Select
                      value={qrTokenTypeInput}
                      onChange={setQrTokenTypeInput}
                      options={[
                        { value: "persistent", label: "Постоянный" },
                        { value: "one_time", label: "Одноразовый" },
                      ]}
                    />
                    <Select
                      value={qrChannelInput}
                      onChange={setQrChannelInput}
                      options={[
                        { value: "web", label: "Web" },
                        { value: "mobile", label: "Mobile" },
                        { value: "telegram", label: "Telegram" },
                      ]}
                    />
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<QrcodeOutlined />}
                        onClick={handleIssueQr}
                        loading={qrActionLoading}
                      >
                        Выпустить QR
                      </Button>
                      <Button
                        icon={<CopyOutlined />}
                        onClick={handleCopyQrToken}
                        disabled={!qrState?.token}
                      >
                        Скопировать токен
                      </Button>
                    </Space>

                    {qrState?.qrImageDataUrl ? (
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        <div
                          style={{
                            border: "1px solid #f0f0f0",
                            borderRadius: 12,
                            padding: 16,
                            display: "flex",
                            justifyContent: "center",
                            background: "#fff",
                          }}
                        >
                          <img
                            src={qrState.qrImageDataUrl}
                            alt="QR код доступа"
                            style={{ width: 240, height: 240, display: "block" }}
                          />
                        </div>
                        <Text type="secondary">
                          Действует до:{" "}
                          {qrState.expiresAt
                            ? dayjs(qrState.expiresAt).format("DD.MM.YYYY HH:mm")
                            : "не ограничен"}
                        </Text>
                        <TextArea value={qrState.token || ""} rows={4} readOnly />
                      </Space>
                    ) : (
                      <Text type="secondary">
                        Выпущенный QR появится здесь после запроса к backend.
                      </Text>
                    )}
                  </Space>
                </Card>

                <Card title="Проверка QR токена">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <TextArea
                      rows={4}
                      placeholder="Вставьте token из QR или payload считывателя"
                      value={qrVerifyToken}
                      onChange={(event) => setQrVerifyToken(event.target.value)}
                    />
                    <Button onClick={handleVerifyQr} loading={qrVerifyLoading}>
                      Проверить QR
                    </Button>

                    {qrVerifyResult ? (
                      <Space direction="vertical" size={4} style={{ width: "100%" }}>
                        <Tag color={qrVerifyResult.allow ? "green" : "red"}>
                          {qrVerifyResult.allow ? "Разрешено" : "Отказ"}
                        </Tag>
                        <Text type="secondary">
                          Сотрудник: {qrVerifyResult.employeeId || "—"}
                        </Text>
                        <Text type="secondary">
                          Тип токена: {qrVerifyResult.tokenType || "—"}
                        </Text>
                        <Text type="secondary">
                          Истекает:{" "}
                          {qrVerifyResult.expiresAt
                            ? dayjs(qrVerifyResult.expiresAt).format("DD.MM.YYYY HH:mm:ss")
                            : "не ограничен"}
                        </Text>
                        <Text type="secondary">
                          Сообщение: {qrVerifyResult.message || "—"}
                        </Text>
                      </Space>
                    ) : (
                      <Text type="secondary">
                        Здесь будет результат проверки токена и решение allow/deny.
                      </Text>
                    )}
                  </Space>
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
};

export default SkudAdminSection;
