import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Input,
  Select,
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
  UnlockOutlined,
  DisconnectOutlined,
  SyncOutlined,
  SaveOutlined,
  SwapOutlined,
  WifiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import skudService from "@/services/skudService";
import { employeeApi } from "@/entities/employee";
import { constructionSiteService } from "@/services/constructionSiteService";
import { departmentService } from "@/services/departmentService";

const { Text } = Typography;

const CARD_STATUS_LABEL = {
  active: { text: "Активна", color: "green" },
  blocked: { text: "Заблокирована", color: "red" },
  unbound: { text: "Не привязана", color: "default" },
};

const READER_UID_FORMAT_OPTIONS = [
  { value: "w26", label: "W26" },
  { value: "sigurCard", label: "Sigur" },
  { value: "decBe", label: "Decimal (BE)" },
  { value: "decLe", label: "Decimal (LE)" },
  { value: "hexUid", label: "HEX" },
];

const READER_UID_FORMAT_STORAGE_KEY = "employee_skud_reader_uid_format";
const SKUD_AUTO_REFRESH_INTERVAL_MS = 2000;
const SKUD_AUTO_REFRESH_DURATION_MS = 30000;
const SKUD_AUTO_REFRESH_MIN_TICKS = 3;

const resolveCardExpirationFromCards = (rows = []) => {
  const candidates = Array.isArray(rows) ? rows : [];
  const sorted = [...candidates].sort((left, right) => {
    const leftPriority = left?.status === "active" ? 0 : 1;
    const rightPriority = right?.status === "active" ? 0 : 1;
    return leftPriority - rightPriority;
  });

  for (const row of sorted) {
    const metadata = row?.metadata || {};
    const providerBinding = metadata.providerBinding || {};
    const candidate =
      providerBinding.expirationDate
      || metadata.bindingExpirationDate
      || null;

    if (!candidate) {
      continue;
    }

    const parsed = dayjs(candidate);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  return null;
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
  const [liveEmployeeAction, setLiveEmployeeAction] = useState(null);
  const [isBlockedInSkud, setIsBlockedInSkud] = useState(null); // null = unknown

  // считыватель карт
  const [readerArmed, setReaderArmed] = useState(false);
  const [readerConnected, setReaderConnected] = useState(false);
  const [readerUidFormat, setReaderUidFormat] = useState(() => {
    if (typeof window === "undefined") {
      return "w26";
    }
    return window.localStorage.getItem(READER_UID_FORMAT_STORAGE_KEY) || "w26";
  });
  const wsRef = useRef(null);
  const autoRefreshTimeoutRef = useRef(null);
  const autoRefreshStopAtRef = useRef(0);
  const autoRefreshRemainingTicksRef = useRef(0);
  const autoRefreshInFlightRef = useRef(false);

  // sync jobs
  const [syncJobs, setSyncJobs] = useState([]);
  const [syncJobsLoading, setSyncJobsLoading] = useState(false);

  // подразделение Sigur
  const [sigurDepts, setSigurDepts] = useState([]);
  const [sigurDeptsLoading, setSigurDeptsLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [savingDept, setSavingDept] = useState(false);

  // внутреннее подразделение (HR)
  const [internalDepts, setInternalDepts] = useState([]);
  const [selectedInternalDeptId, setSelectedInternalDeptId] = useState(null);
  const [savingInternalDept, setSavingInternalDept] = useState(false);

  // срок действия карты
  const [cardExpirationDate, setCardExpirationDate] = useState(null);
  const [savingCardExpirationDate, setSavingCardExpirationDate] = useState(false);

  // объекты
  const [allSites, setAllSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [originalSiteIds, setOriginalSiteIds] = useState([]);
  const [savingSites, setSavingSites] = useState(false);

  const employeeId = employee?.id;
  const [freshEmployee, setFreshEmployee] = useState(null);
  const effectiveEmployee = freshEmployee || employee;

  // если employeeCounterpartyMappings не загружены — рефетч (новый сотрудник)
  useEffect(() => {
    setFreshEmployee(null);
    if (!employee?.id) return;
    if (Array.isArray(employee?.employeeCounterpartyMappings)) return;
    employeeApi.getById(employee.id)
      .then((res) => setFreshEmployee(res?.data || res || null))
      .catch(() => {});
  }, [employee?.id]);

  // инициализация из данных сотрудника (только при смене сотрудника)
  useEffect(() => {
    const mappings = Array.isArray(effectiveEmployee?.employeeCounterpartyMappings)
      ? effectiveEmployee.employeeCounterpartyMappings.filter((m) => !m?.dismissedAt)
      : [];
    const ids = [...new Set(mappings.filter((m) => m.constructionSiteId != null).map((m) => String(m.constructionSiteId)))];
    setSelectedSiteIds(ids);
    setOriginalSiteIds(ids);

    // внутреннее подразделение
    const deptId = mappings[0]?.departmentId || null;
    setSelectedInternalDeptId(deptId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEmployee?.id, effectiveEmployee?.employeeCounterpartyMappings]);

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

  const loadCards = useCallback(async ({ silent = false } = {}) => {
    if (!employeeId) return;
    if (!silent) setCardsLoading(true);
    try {
      const result = await skudService.getCards({ employeeId, limit: 50 });
      const rows = result?.items || result?.rows || result?.cards || (Array.isArray(result) ? result : []);
      setCards(rows);
      return rows;
    } catch {
      // тихо
      return [];
    } finally {
      if (!silent) setCardsLoading(false);
    }
  }, [employeeId]);

  const loadSyncJobs = useCallback(async () => {
    if (!employeeId) return;
    setSyncJobsLoading(true);
    try {
      const result = await skudService.getSyncJobs({ employeeId, limit: 10 });
      const rows = result?.items || result?.rows || result?.syncJobs || (Array.isArray(result) ? result : []);
      setSyncJobs(rows);
      return rows;
    } catch {
      // тихо
      return [];
    } finally {
      setSyncJobsLoading(false);
    }
  }, [employeeId]);

  const stopAutoRefresh = useCallback(() => {
    if (typeof window !== "undefined" && autoRefreshTimeoutRef.current) {
      window.clearTimeout(autoRefreshTimeoutRef.current);
    }
    autoRefreshTimeoutRef.current = null;
    autoRefreshStopAtRef.current = 0;
    autoRefreshRemainingTicksRef.current = 0;
    autoRefreshInFlightRef.current = false;
  }, []);

  const refreshSkudState = useCallback(async ({ silent = true } = {}) => {
    const [cardsRows, syncJobRows] = await Promise.all([
      loadCards({ silent }),
      loadSyncJobs(),
    ]);

    return {
      cardsRows,
      syncJobRows,
    };
  }, [loadCards, loadSyncJobs]);

  const scheduleAutoRefresh = useCallback(
    ({ durationMs = SKUD_AUTO_REFRESH_DURATION_MS, minTicks = SKUD_AUTO_REFRESH_MIN_TICKS } = {}) => {
      if (typeof window === "undefined") {
        return;
      }

      stopAutoRefresh();
      autoRefreshStopAtRef.current = Date.now() + durationMs;
      autoRefreshRemainingTicksRef.current = minTicks;

      const tick = async () => {
        if (Date.now() >= autoRefreshStopAtRef.current) {
          stopAutoRefresh();
          return;
        }

        if (autoRefreshInFlightRef.current) {
          autoRefreshTimeoutRef.current = window.setTimeout(tick, SKUD_AUTO_REFRESH_INTERVAL_MS);
          return;
        }

        autoRefreshInFlightRef.current = true;

        try {
          const { syncJobRows } = await refreshSkudState();
          autoRefreshRemainingTicksRef.current = Math.max(
            0,
            autoRefreshRemainingTicksRef.current - 1,
          );

          const hasActiveJobs = Array.isArray(syncJobRows)
            && syncJobRows.some((job) => ["pending", "processing"].includes(job?.status));

          if (
            Date.now() >= autoRefreshStopAtRef.current
            || (!hasActiveJobs && autoRefreshRemainingTicksRef.current === 0)
          ) {
            stopAutoRefresh();
            return;
          }
        } finally {
          autoRefreshInFlightRef.current = false;
        }

        autoRefreshTimeoutRef.current = window.setTimeout(tick, SKUD_AUTO_REFRESH_INTERVAL_MS);
      };

      tick();
    },
    [refreshSkudState, stopAutoRefresh],
  );

  useEffect(() => {
    loadCards();
    loadSyncJobs();
  }, [loadCards, loadSyncJobs]);

  useEffect(() => stopAutoRefresh, [stopAutoRefresh]);

  useEffect(() => {
    stopAutoRefresh();
  }, [employeeId, stopAutoRefresh]);

  // загружаем подразделения Sigur, внутренние подразделения и текущий binding
  useEffect(() => {
    if (!employeeId) return;

    setSigurDeptsLoading(true);
    Promise.all([
      skudService.getProviderDepartments().catch((error) => ({
        __error: error,
      })),
      skudService.getEmployeeBinding(employeeId).catch(() => null),
      departmentService.getAll().catch(() => null),
    ]).then(async ([deptsResult, bindingResult, internalDeptsResult]) => {
      if (deptsResult?.__error) {
        message.warning(
          deptsResult.__error?.response?.data?.message ||
            "Не удалось загрузить папки СКУД",
        );
      }

      const depts = deptsResult?.departments || deptsResult?.items || (Array.isArray(deptsResult) ? deptsResult : []);
      setSigurDepts(depts);

      const storedId = bindingResult?.metadata?.sigurDepartmentId || null;
      const storedCardExpirationDate =
        bindingResult?.metadata?.cardExpirationDate
        || bindingResult?.metadata?.accessEndTime
        || null;

      const deptList = internalDeptsResult?.data?.data?.departments || internalDeptsResult?.data?.departments || [];
      setInternalDepts(Array.isArray(deptList) ? deptList : []);

      const externalEmpId = String(bindingResult?.externalEmpId || "").trim();
      const providerEmployee = externalEmpId && externalEmpId !== "pending"
        ? await skudService.getProviderEmployee(externalEmpId).catch(() => null)
        : null;

      // isBlocked берём напрямую из Sigur — это всегда актуально
      if (providerEmployee != null) {
        setIsBlockedInSkud(providerEmployee.isBlocked === true);
      }

      const providerDepartmentId = providerEmployee?.departmentId || null;
      const resolvedDeptId = storedId || providerDepartmentId || null;
      setSelectedDeptId(resolvedDeptId != null ? String(resolvedDeptId) : null);
      setCardExpirationDate(storedCardExpirationDate ? dayjs(storedCardExpirationDate) : null);
    }).finally(() => setSigurDeptsLoading(false));
  }, [employeeId, message]);

  useEffect(() => {
    const resolvedFromCards = resolveCardExpirationFromCards(cards);
    if (!resolvedFromCards) {
      return;
    }

    setCardExpirationDate((current) => {
      if (current?.isValid() && current.isSame(resolvedFromCards, "day")) {
        return current;
      }
      return resolvedFromCards;
    });
  }, [cards]);

  // закрываем WS при размонтировании
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(READER_UID_FORMAT_STORAGE_KEY, readerUidFormat);
  }, [readerUidFormat]);

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
          const uid = data[readerUidFormat] || data.hexUid;
          if (!uid) return;
          newCardForm.setFieldValue("cardNumber", uid);
        } catch (_e) { /* игнорируем */ }
      };
    } catch (_e) { /* браузер не поддерживает WS */ }
  }, [readerArmed, handleDisarmReader, message, newCardForm, readerUidFormat]);

  const sitesChanged =
    selectedSiteIds.length !== originalSiteIds.length ||
    selectedSiteIds.some((id) => !originalSiteIds.includes(id));

  const handleSaveSites = async () => {
    setSavingSites(true);
    try {
      await employeeApi.updateConstructionSites(employeeId, selectedSiteIds);
      setOriginalSiteIds(selectedSiteIds);
      message.success("Объекты сохранены");
    } catch (err) {
      message.error(
        err?.response?.data?.message || "Не удалось сохранить объекты",
      );
    } finally {
      setSavingSites(false);
    }
  };

  const handleSaveDept = async () => {
    setSavingDept(true);
    try {
      await skudService.updateBindingMeta(employeeId, { sigurDepartmentId: selectedDeptId || null });
      message.success("Подразделение СКУД сохранено");
    } catch (err) {
      message.error(err?.response?.data?.message || "Не удалось сохранить подразделение");
    } finally {
      setSavingDept(false);
    }
  };

  const handleSaveInternalDept = async () => {
    setSavingInternalDept(true);
    try {
      await employeeApi.updateDepartment(employeeId, selectedInternalDeptId);
      message.success("Подразделение обновлено");
    } catch (err) {
      message.error(err?.response?.data?.message || "Не удалось обновить подразделение");
    } finally {
      setSavingInternalDept(false);
    }
  };

  const handleSaveCardExpirationDate = async () => {
    setSavingCardExpirationDate(true);
    try {
      await skudService.updateBindingMeta(employeeId, {
        cardExpirationDate: cardExpirationDate ? cardExpirationDate.format("YYYY-MM-DD 00:00:00") : null,
      });
      message.success("Срок действия карты сохранён");
    } catch (err) {
      message.error(err?.response?.data?.message || "Не удалось сохранить срок действия карты");
    } finally {
      setSavingCardExpirationDate(false);
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
      await skudService.updateBindingMeta(employeeId, {
        sigurDepartmentId: selectedDeptId || null,
        cardExpirationDate: cardExpirationDate ? cardExpirationDate.format("YYYY-MM-DD 00:00:00") : null,
      });
      await skudService.assignCard({ employeeId, cardNumber });
      message.success("Заявка на выдачу пропуска отправлена. Дождитесь синхронизации с СКУД");
      newCardForm.resetFields();
      scheduleAutoRefresh();
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
          scheduleAutoRefresh();
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
          if (card.isProviderLive) {
            await skudService.unbindLiveCard({
              employeeId,
              externalCardId: card.externalCardId,
            });
          } else {
            await skudService.unbindCard(card.id);
          }
          message.success("Карта отвязана");
          scheduleAutoRefresh();
        } catch (err) {
          message.error(err?.response?.data?.message || "Ошибка при отвязке");
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  const handleLiveEmployeeBlock = () => {
    modal.confirm({
      title: "Заблокировать сотрудника в СКУД?",
      content: "Сотрудник будет заблокирован напрямую в Sigur.",
      okText: "Заблокировать",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        setLiveEmployeeAction("block");
        try {
          await skudService.blockLiveEmployee(employeeId);
          setIsBlockedInSkud(true);
          message.success("Сотрудник заблокирован в СКУД");
          await refreshSkudState();
        } catch (err) {
          message.error(err?.response?.data?.message || "Ошибка блокировки в СКУД");
        } finally {
          setLiveEmployeeAction(null);
        }
      },
    });
  };

  const handleLiveEmployeeUnblock = () => {
    modal.confirm({
      title: "Разблокировать сотрудника в СКУД?",
      content: "Сотрудник будет разблокирован напрямую в Sigur.",
      okText: "Разблокировать",
      cancelText: "Отмена",
      onOk: async () => {
        setLiveEmployeeAction("unblock");
        try {
          await skudService.unblockLiveEmployee(employeeId);
          setIsBlockedInSkud(false);
          message.success("Сотрудник разблокирован в СКУД");
          await refreshSkudState();
        } catch (err) {
          message.error(err?.response?.data?.message || "Ошибка разблокировки в СКУД");
        } finally {
          setLiveEmployeeAction(null);
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
      message.success("Старая карта заблокирована, новая поставлена в очередь на выдачу");
      replaceCardForm.resetFields([`replaceCard_${oldCard.id}`]);
      setReplacingCardId(null);
      scheduleAutoRefresh();
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
      render: (val, record) => (
        <Space>
          <CreditCardOutlined />
          <Text code>{val}</Text>
          {record?.isProviderLive && (
            <Tag color="blue">Sigur</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (val, card) => {
        const hasPendingJob = syncJobs.some(
          (job) =>
            ["pending", "processing"].includes(job?.status) &&
            job?.payload?.cardId === card.id,
        );
        if (hasPendingJob) {
          return <Tag color="processing" icon={<SyncOutlined spin />}>Синхронизация</Tag>;
        }
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
        const canManage = card?.canManage !== false;

        return (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            {!canManage && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Live из Sigur
              </Text>
            )}
            <Space size={4}>
              {canManage && card.status === "active" && (
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
              {canManage && card.status !== "unbound" && (
                <Tooltip title="Отвязать">
                  <Button
                    size="small"
                    icon={<DisconnectOutlined />}
                    loading={isLoading}
                    onClick={() => handleUnbind(card)}
                  />
                </Tooltip>
              )}
              {!canManage && card.status !== "unbound" && (
                <Tooltip title="Отвязать в Sigur">
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
              <Form form={replaceCardForm} layout="inline" style={{ marginTop: 4 }} onSubmitCapture={(e) => e.preventDefault()}>
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

      {/* Подразделение / Папка в СКУД / Срок действия — одна строка */}
      <Space align="end" wrap size={16}>
        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>Подразделение</Text>
          <Space.Compact>
            <Select
              style={{ width: 200 }}
              placeholder="Выберите подразделение"
              allowClear
              showSearch
              optionFilterProp="label"
              value={selectedInternalDeptId}
              onChange={setSelectedInternalDeptId}
              options={internalDepts.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Button
              icon={<SaveOutlined />}
              loading={savingInternalDept}
              onClick={handleSaveInternalDept}
            />
          </Space.Compact>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>Папка в СКУД (Sigur)</Text>
          <Space.Compact>
            <Select
              style={{ width: 200 }}
              placeholder="Выберите папку"
              allowClear
              showSearch
              optionFilterProp="label"
              value={selectedDeptId}
              onChange={setSelectedDeptId}
              loading={sigurDeptsLoading}
              options={sigurDepts.map((d) => ({ value: String(d.id), label: d.name }))}
            />
            <Button
              icon={<SaveOutlined />}
              loading={savingDept}
              onClick={handleSaveDept}
            />
          </Space.Compact>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>Срок действия карты</Text>
          <Space.Compact>
            <DatePicker
              value={cardExpirationDate}
              onChange={setCardExpirationDate}
              format="DD.MM.YYYY"
              placeholder="Не ограничен"
              allowClear
            />
            <Button
              icon={<SaveOutlined />}
              loading={savingCardExpirationDate}
              onClick={handleSaveCardExpirationDate}
            />
          </Space.Compact>
        </div>
      </Space>

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
          {isBlockedInSkud === true && (
            <Tag color="red" icon={<LockOutlined />}>Заблокирован в СКУД</Tag>
          )}
          {isBlockedInSkud === false && (
            <Tag color="green" icon={<UnlockOutlined />}>Разрешён в СКУД</Tag>
          )}
          {isBlockedInSkud === true ? (
            <Button
              size="small"
              icon={<UnlockOutlined />}
              onClick={handleLiveEmployeeUnblock}
              loading={liveEmployeeAction === "unblock"}
            >
              Разблокировать
            </Button>
          ) : (
            <Button
              size="small"
              danger
              icon={<LockOutlined />}
              onClick={handleLiveEmployeeBlock}
              loading={liveEmployeeAction === "block"}
            >
              Заблокировать в СКУД
            </Button>
          )}
        </Space>
        <Spin spinning={cardsLoading}>
          <div style={{ minHeight: 40 }}>
            {cards.filter((c) => c.status !== "unbound").length === 0 && !cardsLoading ? (
              <Text type="secondary">Карты не назначены</Text>
            ) : (
              <Table
                dataSource={cards.filter((c) => c.status !== "unbound")}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={false}
              />
            )}
          </div>
        </Spin>
      </div>

      <Divider style={{ margin: "4px 0" }} />

      {/* Выдать новый пропуск */}
      <div>
        <Text strong style={{ display: "block", marginBottom: 6 }}>
          Выдать новый пропуск
        </Text>
        <Form form={newCardForm} layout="inline" onFinish={handleAssign} onSubmitCapture={(e) => e.preventDefault()}>
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
            <Select
              value={readerUidFormat}
              onChange={setReaderUidFormat}
              options={READER_UID_FORMAT_OPTIONS}
              style={{ width: 150 }}
              title="Формат данных от считывателя"
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
              loading={submitting}
              icon={<CreditCardOutlined />}
              onClick={handleAssign}
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

      <Divider style={{ margin: "4px 0" }} />

      {/* Синхронизация */}
      <div>
        <Space style={{ marginBottom: 6 }} align="center">
          <Text strong>Синхронизация с СКУД</Text>
          <Button
            size="small"
            type="text"
            icon={<SyncOutlined />}
            onClick={loadSyncJobs}
            loading={syncJobsLoading}
          />
        </Space>
        <Spin spinning={syncJobsLoading}>
          {syncJobs.length === 0 && !syncJobsLoading ? (
            <Text type="secondary">Нет задач синхронизации</Text>
          ) : (
            <Table
              dataSource={syncJobs}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                {
                  title: "Операция",
                  dataIndex: "operation",
                  key: "operation",
                  render: (val) => {
                    const labels = {
                      assign_card: "Выдача карты",
                      block_card: "Блокировка карты",
                      unbind_card: "Отвязка карты",
                      sync_employee: "Синхронизация",
                      block_employee: "Блокировка",
                      unblock_employee: "Разблокировка",
                    };
                    return labels[val] || val;
                  },
                },
                {
                  title: "Статус",
                  dataIndex: "status",
                  key: "status",
                  width: 130,
                  render: (val) => {
                    const map = {
                      success: { color: "success", icon: <CheckCircleOutlined />, text: "Выполнено" },
                      failed: { color: "error", icon: <CloseCircleOutlined />, text: "Ошибка" },
                      pending: { color: "default", icon: <ClockCircleOutlined />, text: "Ожидание" },
                      processing: { color: "processing", icon: <LoadingOutlined />, text: "Выполняется" },
                    };
                    const s = map[val] || { color: "default", icon: null, text: val };
                    return (
                      <Tag color={s.color} icon={s.icon}>
                        {s.text}
                      </Tag>
                    );
                  },
                },
                {
                  title: "Время",
                  dataIndex: "createdAt",
                  key: "createdAt",
                  width: 130,
                  render: (val) =>
                    val
                      ? new Date(val).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—",
                },
                {
                  title: "Ошибка",
                  dataIndex: "errorMessage",
                  key: "errorMessage",
                  render: (val) =>
                    val ? (
                      <Text type="danger" style={{ fontSize: 11 }}>
                        {val}
                      </Text>
                    ) : null,
                },
              ]}
            />
          )}
        </Spin>
      </div>

    </Space>
  );
};

export default EmployeeSkudTab;
