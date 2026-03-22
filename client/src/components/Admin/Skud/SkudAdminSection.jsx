import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tree,
  TreeSelect,
  Typography,
  Upload,
} from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SyncOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import PassesPage from "@/pages/PassesPage";
import { employeeService } from "@/services/employeeService";
import { readSkudBindingImportExcel } from "@/modules/skud/lib/readSkudBindingImportExcel";
import skudService from "@/services/skudService";
import SkudSiteAccessPointsTab from "./SkudSiteAccessPointsTab";
import SkudPassIssuanceTab from "./SkudPassIssuanceTab";
import { useAuthStore } from "@/store/authStore";

const { Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const EVENT_TYPE_LABELS = {
  PASS_DETECTED: "Проход",
  PASS_GRANTED: "Разрешенный проход",
  PASS_DENIED: "Запрещенный проход",
  AP_ONLINE_STATUS: "Статус контроллера",
};

const toRecord = (value) => (value && typeof value === "object" ? value : {});

const getRawEventItem = (record) => {
  const directRawItem = toRecord(record?.rawItem);
  if (Object.keys(directRawItem).length > 0) {
    return directRawItem;
  }
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

const getZoneName = (record) => {
  const rawItem = getRawEventItem(record);
  const value =
    rawItem?.additionalData?.zone?.name ||
    rawItem?.data?.zoneName ||
    rawItem?.data?.zone_name ||
    null;
  return value ? String(value).trim() : "";
};

const getEventTypeLabel = (value) => EVENT_TYPE_LABELS[value] || value || "—";

const getEventRowKey = (record) =>
  record?.id
  || record?.logId
  || [record?.eventTime, record?.externalEmpId, record?.accessPoint, record?.direction]
    .filter(Boolean)
    .join(":");

const buildEmployeeName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

const getLocalEmployeeName = (record) => String(record?.employeeName || "").trim();

const getEmployeeDepartmentName = (record) => String(record?.departmentName || "").trim();

const normalizePersonNameForCompare = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, "");

const arePersonNamesMatching = (left, right) => {
  const normalizedLeft = normalizePersonNameForCompare(left);
  const normalizedRight = normalizePersonNameForCompare(right);
  if (!normalizedLeft || !normalizedRight) {
    return null;
  }
  return normalizedLeft === normalizedRight;
};

const renderHierarchyFolderTitle = (label, { loading = false, loadedCount = null } = {}) => (
  <Space size={8}>
    {loading ? <SyncOutlined spin /> : <FolderOpenOutlined />}
    <span>{label}</span>
    {loadedCount !== null ? (
      <Text type="secondary" style={{ fontSize: 12 }}>
        {loadedCount}
      </Text>
    ) : null}
  </Space>
);

const renderHierarchyEmployeeTitle = (label, id = null) => (
  <Space size={8}>
    <UserOutlined />
    <span>{label}</span>
    {id ? (
      <Text type="secondary" style={{ fontSize: 12 }}>
        {id}
      </Text>
    ) : null}
  </Space>
);

const getRequestErrorMessage = (error, fallback) =>
  error?.response?.data?.message
  || error?.response?.data?.error
  || error?.message
  || fallback;

const normalizeSigurPathSegments = (value) =>
  String(value || "")
    .split(/[\\/|>]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const getTodayEventRange = () => [dayjs().startOf("day"), dayjs().endOf("day")];
const EVENT_LOAD_LIMIT = 200;

const buildEventRangeParams = (eventDateRange) =>
  Array.isArray(eventDateRange) && eventDateRange[0] && eventDateRange[1]
    ? {
        from: eventDateRange[0].startOf("day").toISOString(),
        to: eventDateRange[1].endOf("day").toISOString(),
      }
    : {};

const SkudAdminSection = () => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [pullingEvents, setPullingEvents] = useState(false);
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeOptionsLoading, setEmployeeOptionsLoading] = useState(false);
  const [employeeReasonInput, setEmployeeReasonInput] = useState("");
  const [providerDepartments, setProviderDepartments] = useState([]);
  const [providerDepartmentsLoading, setProviderDepartmentsLoading] = useState(false);
  const [providerAccessPoints, setProviderAccessPoints] = useState([]);
  const [providerAccessPointsLoading, setProviderAccessPointsLoading] = useState(false);
  const [providerHierarchySearch, setProviderHierarchySearch] = useState("");
  const [providerHierarchySearchLoading, setProviderHierarchySearchLoading] = useState(false);
  const [providerHierarchySearchEmployees, setProviderHierarchySearchEmployees] = useState([]);
  const [providerHierarchyEmployeesByDepartment, setProviderHierarchyEmployeesByDepartment] =
    useState({});
  const [providerHierarchyLoadingDepartmentIds, setProviderHierarchyLoadingDepartmentIds] =
    useState([]);
  const [providerHierarchyLoadedDepartmentIds, setProviderHierarchyLoadedDepartmentIds] =
    useState([]);
  const [providerHierarchyExpandedKeys, setProviderHierarchyExpandedKeys] = useState([]);
  const [providerHierarchySelectedDepartmentId, setProviderHierarchySelectedDepartmentId] =
    useState(null);
  const [providerHierarchyModalMode, setProviderHierarchyModalMode] = useState(null);
  const [providerHierarchyModalOpen, setProviderHierarchyModalOpen] = useState(false);
  const [providerHierarchyModalName, setProviderHierarchyModalName] = useState("");
  const [providerHierarchyModalSubmitting, setProviderHierarchyModalSubmitting] = useState(false);
  const [providerHierarchyDeleting, setProviderHierarchyDeleting] = useState(false);
  const [selectedSigurDepartmentId, setSelectedSigurDepartmentId] = useState(null);
  const [sigurSubfolderInput, setSigurSubfolderInput] = useState("");
  const [employeeActionLoading, setEmployeeActionLoading] = useState(false);
  const [assigningCard, setAssigningCard] = useState(false);
  const [cardActionLoadingId, setCardActionLoadingId] = useState(null);
  const [cardEmployeeIdInput, setCardEmployeeIdInput] = useState("");
  const [cardEmployeeOptions, setCardEmployeeOptions] = useState([]);
  const [cardEmployeeSearch, setCardEmployeeSearch] = useState("");
  const [cardEmployeeOptionsLoading, setCardEmployeeOptionsLoading] = useState(false);
  const [cardNumberInput, setCardNumberInput] = useState("");
  const [cardTypeInput, setCardTypeInput] = useState("rfid");
  const [cardNotesInput, setCardNotesInput] = useState("");
  const [cardReaderArmed, setCardReaderArmed] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "events");
  const [bindingImportRows, setBindingImportRows] = useState([]);
  const [bindingImportFileName, setBindingImportFileName] = useState("");
  const [bindingImportPreview, setBindingImportPreview] = useState(null);
  const [bindingImportLoading, setBindingImportLoading] = useState(false);
  const [bindingImportExecuting, setBindingImportExecuting] = useState(false);
  const [qrEmployeeIdInput, setQrEmployeeIdInput] = useState("");
  const [qrEmployeeOptions, setQrEmployeeOptions] = useState([]);
  const [qrEmployeeSearch, setQrEmployeeSearch] = useState("");
  const [qrEmployeeOptionsLoading, setQrEmployeeOptionsLoading] = useState(false);
  const [qrTokenTypeInput, setQrTokenTypeInput] = useState("persistent");
  const [qrChannelInput, setQrChannelInput] = useState("web");
  const [qrActionLoading, setQrActionLoading] = useState(false);
  const [qrState, setQrState] = useState(null);
  const [qrVerifyToken, setQrVerifyToken] = useState("");
  const [qrVerifyResult, setQrVerifyResult] = useState(null);
  const [qrVerifyLoading, setQrVerifyLoading] = useState(false);
  const [showOnlyPassages, setShowOnlyPassages] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [accessPointFilter, setAccessPointFilter] = useState(undefined);
  const [eventDateRange, setEventDateRange] = useState(getTodayEventRange);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(20);
  const [eventsSortOrder, setEventsSortOrder] = useState("descend");
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [eventDetailsLoading, setEventDetailsLoading] = useState(false);
  const [eventDetailsRecord, setEventDetailsRecord] = useState(null);
  const [eventDetailsProviderEmployee, setEventDetailsProviderEmployee] = useState(null);
  const [bindingsAuditLoading, setBindingsAuditLoading] = useState(false);
  const [bindingsAuditItems, setBindingsAuditItems] = useState([]);
  const [bindingsAuditMismatchOnly, setBindingsAuditMismatchOnly] = useState(true);
  const cardNumberInputRef = useRef(null);
  const eventsAutoRefreshRef = useRef(false);
  const wsRef = useRef(null);
  const handleAssignCardRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [uidFormat, setUidFormat] = useState("w26");
  const [state, setState] = useState({
    health: null,
    stats: null,
    events: {
      items: [],
      pagination: { total: 0, limit: EVENT_LOAD_LIMIT, offset: 0 },
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
          limit: EVENT_LOAD_LIMIT,
          offset: 0,
          passageOnly: showOnlyPassages,
          ...(eventTypeFilter !== "all" ? { eventType: eventTypeFilter } : {}),
          ...(directionFilter !== "all" ? { direction: directionFilter } : {}),
          ...(accessPointFilter ? { accessPoint: accessPointFilter } : {}),
          ...(decisionFilter === "allowed"
            ? { allow: true }
            : decisionFilter === "denied"
              ? { allow: false }
              : {}),
          sortBy: "eventTime",
          sortOrder: eventsSortOrder === "ascend" ? "asc" : "desc",
          ...buildEventRangeParams(eventDateRange),
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
      message.error(getRequestErrorMessage(error, "Не удалось загрузить данные СКУД"));
    } finally {
      setLoading(false);
    }
  }, [
    accessPointFilter,
    decisionFilter,
    directionFilter,
    eventDateRange,
    eventTypeFilter,
    eventsSortOrder,
    message,
    showOnlyPassages,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const nextTab = searchParams.get("tab") || "events";
    setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [searchParams]);

  const handleShowOnlyPassagesChange = useCallback((checked) => {
    setEventsPage(1);
    setShowOnlyPassages(checked);
  }, []);

  const handleEventTypeFilterChange = useCallback((value) => {
    setEventsPage(1);
    setEventTypeFilter(value);
  }, []);

  const handleDecisionFilterChange = useCallback((value) => {
    setEventsPage(1);
    setDecisionFilter(value);
  }, []);

  const handleDirectionFilterChange = useCallback((value) => {
    setEventsPage(1);
    setDirectionFilter(value);
  }, []);

  const handleAccessPointFilterChange = useCallback((value) => {
    setEventsPage(1);
    setAccessPointFilter(value || undefined);
  }, []);

  const handleEventDateRangeChange = useCallback((value) => {
    setEventsPage(1);
    setEventDateRange(value);
  }, []);

  const handleEventsTableChange = useCallback((pagination, _filters, sorter) => {
    const nextPageSize = Number(pagination?.pageSize || 20);
    const nextPage = Number(pagination?.current || 1);
    const nextSortOrder =
      !Array.isArray(sorter) && sorter?.field === "eventTime" && sorter?.order
        ? sorter.order
        : "descend";

    if (nextSortOrder !== eventsSortOrder) {
      setEventsSortOrder(nextSortOrder);
      setEventsPage(1);
      if (nextPageSize !== eventsPageSize) {
        setEventsPageSize(nextPageSize);
      }
      return;
    }

    if (nextPageSize !== eventsPageSize) {
      setEventsPageSize(nextPageSize);
      setEventsPage(1);
      return;
    }

    setEventsPage(nextPage);
  }, [eventsPageSize, eventsSortOrder]);

  const handleCloseEventDetails = useCallback(() => {
    setEventDetailsOpen(false);
    setEventDetailsLoading(false);
    setEventDetailsRecord(null);
    setEventDetailsProviderEmployee(null);
  }, []);

  const handleOpenEventDetails = useCallback(async (record) => {
    setEventDetailsRecord(record || null);
    setEventDetailsProviderEmployee(null);
    setEventDetailsOpen(true);

    const externalEmpId = String(record?.externalEmpId || "").trim();
    if (!externalEmpId) {
      setEventDetailsLoading(false);
      return;
    }

    setEventDetailsLoading(true);
    try {
      const data = await skudService.getProviderEmployee(externalEmpId);
      setEventDetailsProviderEmployee(data || null);
    } catch (error) {
      console.error("Failed to load Sigur employee details:", error);
      message.error("Не удалось догрузить сотрудника из Sigur");
    } finally {
      setEventDetailsLoading(false);
    }
  }, [message]);

  const handleSyncEmployee = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Выберите сотрудника");
      return;
    }

    const selectedDepartment = providerDepartments.find(
      (item) => String(item?.id || "") === String(selectedSigurDepartmentId || ""),
    );
    const additionalSegments = normalizeSigurPathSegments(sigurSubfolderInput);
    const sigurDepartmentPath = [
      ...(Array.isArray(selectedDepartment?.path) ? selectedDepartment.path : []),
      ...additionalSegments,
    ];

    setEmployeeActionLoading(true);
    try {
      await skudService.syncEmployee(employeeId, {
        ...(sigurDepartmentPath.length > 0 ? { sigurDepartmentPath } : {}),
      });
      message.success("Задача синхронизации поставлена в очередь");
      await loadData();
    } catch (error) {
      console.error("Failed to enqueue employee sync:", error);
      message.error("Не удалось поставить синхронизацию в очередь");
    } finally {
      setEmployeeActionLoading(false);
    }
  }, [
    employeeIdInput,
    loadData,
    message,
    providerDepartments,
    selectedSigurDepartmentId,
    sigurSubfolderInput,
  ]);

  const handleBlockEmployee = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Выберите сотрудника");
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
      message.warning("Выберите сотрудника");
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

  const focusCardReaderInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      cardNumberInputRef.current?.focus?.();
    });
  }, []);

  const handleAssignCard = useCallback(async (overrides = {}) => {
    const employeeId = String(
      overrides.employeeId ?? cardEmployeeIdInput ?? "",
    ).trim();
    const cardNumber = String(
      overrides.cardNumber ?? cardNumberInput ?? "",
    ).trim();
    if (!employeeId || !cardNumber) {
      message.warning("Выберите сотрудника и приложите карту");
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
      if (cardReaderArmed) {
        focusCardReaderInput();
      }
    } catch (error) {
      console.error("Failed to assign card:", error);
      message.error("Не удалось привязать карту");
      if (cardReaderArmed) {
        focusCardReaderInput();
      }
    } finally {
      setAssigningCard(false);
    }
  }, [
    cardEmployeeIdInput,
    cardNumberInput,
    cardTypeInput,
    cardNotesInput,
    cardReaderArmed,
    focusCardReaderInput,
    loadData,
    message,
  ]);

  // Держим актуальную ссылку на handleAssignCard для вызова из WebSocket-callback
  useEffect(() => {
    handleAssignCardRef.current = handleAssignCard;
  }, [handleAssignCard]);

  // Закрываем WebSocket при размонтировании компонента
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleDisarmCardReader = useCallback(() => {
    setCardReaderArmed(false);
    setWsConnected(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const handleArmCardReader = useCallback(() => {
    if (cardReaderArmed) {
      handleDisarmCardReader();
      return;
    }

    setCardReaderArmed(true);
    focusCardReaderInput();

    // Подключаемся к локальному агенту Sigur Reader EH
    try {
      const ws = new WebSocket("ws://localhost:8765");
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        message.warning(
          "Агент считывателя недоступен. Запустите start.bat из папки server/skud-agent на этом ПК.",
          6,
        );
        setWsConnected(false);
        // Не разоружаем — пользователь может вводить номер вручную
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "card") return;
          // Используем формат, выбранный пользователем
          const uid = data[uidFormat] || data.hexUid;
          if (!uid) return;
          void handleAssignCardRef.current?.({ cardNumber: uid });
        } catch (_e) {
          // Некорректный JSON от агента — игнорируем
        }
      };
    } catch (_e) {
      // Браузер не поддерживает WebSocket — продолжаем в режиме клавиатуры
    }
  }, [cardReaderArmed, focusCardReaderInput, handleDisarmCardReader, uidFormat, message]);

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

  const refreshEvents = useCallback(
    async ({ silentSuccess = false } = {}) => {
      setPullingEvents(true);
      try {
        await loadData();
        if (!silentSuccess) {
          message.success("События обновлены");
        }
      } catch (error) {
        console.error("Failed to load live SKUD events:", error);
        message.error(getRequestErrorMessage(error, "Не удалось загрузить события из Sigur"));
      } finally {
        setPullingEvents(false);
      }
    },
    [loadData, message],
  );

  const handleRefreshEvents = useCallback(async () => {
    await refreshEvents();
  }, [refreshEvents]);

  useEffect(() => {
    if (activeTab !== "events" || eventsAutoRefreshRef.current) {
      return;
    }

    eventsAutoRefreshRef.current = true;
    refreshEvents({ silentSuccess: true });
  }, [activeTab, refreshEvents]);

  useEffect(() => {
    const total = Array.isArray(state.events?.items) ? state.events.items.length : 0;
    const maxPage = Math.max(1, Math.ceil(total / eventsPageSize));
    if (eventsPage > maxPage) {
      setEventsPage(maxPage);
    }
  }, [eventsPage, eventsPageSize, state.events?.items]);

  const fetchEmployeeOptions = useCallback(async (search = "") => {
    const response = await employeeService.getAll({
      page: 1,
      limit: 100,
      activeOnly: "true",
      ...(search ? { search } : {}),
    });
    const items = Array.isArray(response?.data?.employees)
      ? response.data.employees
      : [];

    return items.map((employee) => ({
      value: employee.id,
      label:
        buildEmployeeName(employee) ||
        employee.fullName ||
        employee.email ||
        String(employee.id),
    }));
  }, []);

  const loadSyncEmployees = useCallback(
    async (search = "") => {
      setEmployeeOptionsLoading(true);
      try {
        const options = await fetchEmployeeOptions(search);
        setEmployeeOptions(options);
      } catch (error) {
        console.error("Failed to load sync employee options:", error);
        message.error("Не удалось загрузить сотрудников");
      } finally {
        setEmployeeOptionsLoading(false);
      }
    },
    [fetchEmployeeOptions, message],
  );

  const loadProviderDepartments = useCallback(async () => {
    setProviderDepartmentsLoading(true);
    try {
      const response = await skudService.getProviderDepartments();
      setProviderDepartments(response?.items || []);
    } catch (error) {
      console.error("Failed to load Sigur departments:", error);
      message.error("Не удалось загрузить структуру Sigur");
    } finally {
      setProviderDepartmentsLoading(false);
    }
  }, [message]);

  const loadProviderAccessPoints = useCallback(async () => {
    setProviderAccessPointsLoading(true);
    try {
      const response = await skudService.getProviderAccessPoints();
      setProviderAccessPoints(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      console.error("Failed to load Sigur access points:", error);
      message.error("Не удалось загрузить точки доступа Sigur");
    } finally {
      setProviderAccessPointsLoading(false);
    }
  }, [message]);

  const loadBindingsAudit = useCallback(async () => {
    setBindingsAuditLoading(true);
    try {
      const data = await skudService.getBindingsAudit({
        limit: 100,
        offset: 0,
        mismatchOnly: bindingsAuditMismatchOnly,
      });
      setBindingsAuditItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to load SKUD bindings audit:", error);
      message.error("Не удалось загрузить сверку связок Sigur");
    } finally {
      setBindingsAuditLoading(false);
    }
  }, [bindingsAuditMismatchOnly, message]);

  useEffect(() => {
    if (activeTab !== "employees") {
      return;
    }
    void loadBindingsAudit();
  }, [activeTab, loadBindingsAudit]);

  const resetProviderHierarchyView = useCallback(() => {
    setProviderHierarchyEmployeesByDepartment({});
    setProviderHierarchyLoadedDepartmentIds([]);
    setProviderHierarchyLoadingDepartmentIds([]);
    setProviderHierarchyExpandedKeys([]);
  }, []);

  const loadProviderHierarchyDepartmentEmployees = useCallback(
    async (departmentId) => {
      const normalizedDepartmentId = String(departmentId || "").trim();
      if (!normalizedDepartmentId) {
        return;
      }

      if (
        providerHierarchyLoadedDepartmentIds.includes(normalizedDepartmentId)
        || providerHierarchyLoadingDepartmentIds.includes(normalizedDepartmentId)
      ) {
        return;
      }

      setProviderHierarchyLoadingDepartmentIds((current) =>
        current.includes(normalizedDepartmentId)
          ? current
          : current.concat(normalizedDepartmentId),
      );

      try {
        const limit = 200;
        let offset = 0;
        let allItems = [];
        let hasMore = true;

        while (hasMore) {
          const response = await skudService.getProviderEmployees({
            limit,
            offset,
            departmentId: normalizedDepartmentId,
          });
          const items = Array.isArray(response?.items) ? response.items : [];
          allItems = allItems.concat(items);

          if (items.length < limit) {
            hasMore = false;
            break;
          }

          offset += items.length;
        }

        setProviderHierarchyEmployeesByDepartment((current) => ({
          ...current,
          [normalizedDepartmentId]: allItems,
        }));
        setProviderHierarchyLoadedDepartmentIds((current) =>
          current.includes(normalizedDepartmentId)
            ? current
            : current.concat(normalizedDepartmentId),
        );
      } catch (error) {
        console.error("Failed to load Sigur hierarchy employees for department:", error);
        message.error("Не удалось загрузить сотрудников выбранной папки Sigur");
      } finally {
        setProviderHierarchyLoadingDepartmentIds((current) =>
          current.filter((item) => item !== normalizedDepartmentId),
        );
      }
    },
    [message, providerHierarchyLoadedDepartmentIds, providerHierarchyLoadingDepartmentIds],
  );

  const loadProviderHierarchySearchEmployees = useCallback(
    async (search) => {
      const normalizedSearch = String(search || "").trim();
      if (!normalizedSearch) {
        setProviderHierarchySearchEmployees([]);
        return;
      }

      setProviderHierarchySearchLoading(true);
      try {
        const response = await skudService.getProviderEmployees({
          limit: 100,
          offset: 0,
          search: normalizedSearch,
        });
        setProviderHierarchySearchEmployees(Array.isArray(response?.items) ? response.items : []);
      } catch (error) {
        console.error("Failed to search Sigur hierarchy employees:", error);
        message.error("Не удалось выполнить поиск по сотрудникам Sigur");
      } finally {
        setProviderHierarchySearchLoading(false);
      }
    },
    [message],
  );

  const loadCardEmployees = useCallback(
    async (search = "") => {
      setCardEmployeeOptionsLoading(true);
      try {
        const options = await fetchEmployeeOptions(search);
        setCardEmployeeOptions(options);
      } catch (error) {
        console.error("Failed to load card employee options:", error);
        message.error("Не удалось загрузить сотрудников");
      } finally {
        setCardEmployeeOptionsLoading(false);
      }
    },
    [fetchEmployeeOptions, message],
  );

  const loadQrEmployees = useCallback(
    async (search = "") => {
      setQrEmployeeOptionsLoading(true);
      try {
        const options = await fetchEmployeeOptions(search);
        setQrEmployeeOptions(options);
      } catch (error) {
        console.error("Failed to load QR employee options:", error);
        message.error("Не удалось загрузить сотрудников");
      } finally {
        setQrEmployeeOptionsLoading(false);
      }
    },
    [fetchEmployeeOptions, message],
  );

  useEffect(() => {
    if (activeTab !== "cards") {
      return;
    }
    loadCardEmployees(cardEmployeeSearch);
  }, [activeTab, cardEmployeeSearch, loadCardEmployees]);

  useEffect(() => {
    if (activeTab !== "employees") {
      return;
    }
    loadSyncEmployees(employeeSearch);
  }, [activeTab, employeeSearch, loadSyncEmployees]);

  useEffect(() => {
    if (activeTab !== "employees") {
      return;
    }
    loadProviderDepartments();
  }, [activeTab, loadProviderDepartments]);

  useEffect(() => {
    if (activeTab !== "events") {
      return;
    }
    loadProviderAccessPoints();
  }, [activeTab, loadProviderAccessPoints]);

  useEffect(() => {
    if (activeTab !== "employees") {
      return;
    }
    resetProviderHierarchyView();
  }, [activeTab, resetProviderHierarchyView]);

  useEffect(() => {
    if (activeTab !== "employees") {
      return;
    }
    const normalizedSearch = String(providerHierarchySearch || "").trim();
    if (!normalizedSearch) {
      setProviderHierarchySearchEmployees([]);
      setProviderHierarchySearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadProviderHierarchySearchEmployees(normalizedSearch);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, loadProviderHierarchySearchEmployees, providerHierarchySearch]);

  useEffect(() => {
    if (activeTab !== "qr") {
      return;
    }
    loadQrEmployees(qrEmployeeSearch);
  }, [activeTab, loadQrEmployees, qrEmployeeSearch]);

  const handleBindingImportFileSelect = useCallback(
    async (file) => {
      try {
        setBindingImportLoading(true);
        const rows = await readSkudBindingImportExcel(file);
        setBindingImportRows(rows);
        setBindingImportFileName(file.name);
        setBindingImportPreview(null);
        message.success(`Файл загружен: ${rows.length} строк`);
      } catch (error) {
        console.error("Failed to read SKUD binding import file:", error);
        message.error("Не удалось прочитать Excel");
      } finally {
        setBindingImportLoading(false);
      }

      return false;
    },
    [message],
  );

  const handlePreviewBindingImport = useCallback(async () => {
    if (!bindingImportRows.length) {
      message.warning("Сначала загрузите Excel");
      return;
    }

    setBindingImportLoading(true);
    try {
      const data = await skudService.previewBindingImport(bindingImportRows);
      setBindingImportPreview(data || null);
      message.success("Проверка завершена");
    } catch (error) {
      console.error("Failed to preview SKUD binding import:", error);
      message.error(
        error?.response?.data?.message || "Не удалось проверить импорт соответствий",
      );
    } finally {
      setBindingImportLoading(false);
    }
  }, [bindingImportRows, message]);

  const handleExecuteBindingImport = useCallback(async () => {
    if (!bindingImportRows.length) {
      message.warning("Сначала загрузите Excel");
      return;
    }

    setBindingImportExecuting(true);
    try {
      const data = await skudService.executeBindingImport(bindingImportRows);
      setBindingImportPreview(data?.preview || null);
      message.success(`В очередь поставлено ${data?.queued || 0} сотрудников`);
      await loadData();
    } catch (error) {
      console.error("Failed to execute SKUD binding import:", error);
      message.error(
        error?.response?.data?.message || "Не удалось выполнить импорт соответствий",
      );
    } finally {
      setBindingImportExecuting(false);
    }
  }, [bindingImportRows, loadData, message]);

  const handleExportBindingImportPreview = useCallback(() => {
    if (!bindingImportPreview?.items?.length) {
      message.warning("Сначала выполните проверку Excel");
      return;
    }

    const escapeCsv = (value) => {
      const normalized = String(value ?? "");
      if (normalized.includes(";") || normalized.includes("\"") || normalized.includes("\n")) {
        return `"${normalized.replace(/"/g, "\"\"")}"`;
      }
      return normalized;
    };

    const rows = [
      [
        "Строка",
        "Номер пропуска",
        "Импорт ФИО",
        "Импорт подразделение",
        "PassDesk ФИО",
        "PassDesk подразделение",
        "Статус",
        "Детали",
      ].join(";"),
      ...bindingImportPreview.items.map((item) =>
        [
          item.rowIndex,
          escapeCsv(item.passNumber || ""),
          escapeCsv(item.fullName || ""),
          escapeCsv(item.departmentName || ""),
          escapeCsv(item.employeeName || ""),
          escapeCsv(item.localDepartmentName || ""),
          escapeCsv(item.status || ""),
          escapeCsv(Array.isArray(item.details) ? item.details.join(" | ") : ""),
        ].join(";"),
      ),
    ];

    const blob = new Blob([`\uFEFF${rows.join("\n")}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `skud-binding-preview-${dayjs().format("YYYY-MM-DD_HH-mm")}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    message.success("Результат проверки выгружен");
  }, [bindingImportPreview, message]);

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
      message.success("QR-код скопирован");
    } catch (error) {
      console.error("Failed to copy QR token:", error);
      message.error("Не удалось скопировать QR-код");
    }
  }, [message, qrState?.token]);

  const handleVerifyQr = useCallback(async () => {
    const token = String(qrVerifyToken || "").trim();
    if (!token) {
      message.warning("Вставьте QR-код или keyHex для проверки");
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
        sorter: true,
        sortOrder: eventsSortOrder,
        render: (value) => (
          <span style={{ whiteSpace: "nowrap" }}>
            {value ? dayjs(value).format("DD.MM.YYYY HH:mm:ss") : "—"}
          </span>
        ),
      },
      {
        title: "Сотрудник",
        key: "employee",
        width: 320,
        render: (_, record) => {
          const sigurName = getSigurPersonName(record);
          const localName = getLocalEmployeeName(record);
          const departmentName = getEmployeeDepartmentName(record);
          const ext = record.externalEmpId ? `ID ${record.externalEmpId}` : "—";
          const triggerLabel = localName || sigurName || ext;

          return (
            <Space direction="vertical" size={0} style={{ width: "100%", minWidth: 0 }}>
              <Button
                type="link"
                size="small"
                title={triggerLabel}
                style={{
                  padding: 0,
                  height: "auto",
                  textAlign: "left",
                  width: "100%",
                  display: "block",
                  overflow: "hidden",
                }}
                onClick={() => {
                  void handleOpenEventDetails(record);
                }}
              >
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {triggerLabel}
                </span>
              </Button>
              {sigurName && localName && sigurName !== localName ? (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={`Sigur ФИО: ${sigurName}`}
                >
                  Sigur ФИО: {sigurName}
                </Text>
              ) : null}
              <Text
                type="secondary"
                style={{
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Sigur: {ext}
              </Text>
              {departmentName ? (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={`Отдел: ${departmentName}`}
                >
                  Отдел: {departmentName}
                </Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: "Точка",
        dataIndex: "accessPoint",
        key: "accessPoint",
        width: 320,
        render: (value, record) => {
          const pointName = getAccessPointName(record);
          if (!pointName) {
            return value === null || value === undefined ? "—" : `#${value}`;
          }

          return (
            <Space direction="vertical" size={0} style={{ width: "100%", minWidth: 0 }}>
              <Text
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={pointName}
              >
                {pointName}
              </Text>
              {value !== null && value !== undefined ? (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Точка ID: {value}
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
    ],
    [eventsSortOrder, handleOpenEventDetails],
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

  const accessPointOptions = useMemo(
    () =>
      (providerAccessPoints || []).map((item) => ({
        value: item.id,
        label: item.label || item.name || String(item.id),
      })),
    [providerAccessPoints],
  );

  const bindingImportColumns = useMemo(
    () => [
      {
        title: "Строка",
        dataIndex: "rowIndex",
        key: "rowIndex",
        width: 90,
      },
      {
        title: "UUID",
        dataIndex: "idAll",
        key: "idAll",
        width: 260,
        render: (value) => value || "—",
      },
      {
        title: "Номер пропуска",
        dataIndex: "passNumber",
        key: "passNumber",
        width: 180,
        render: (value) => value || "—",
      },
      {
        title: "Импорт",
        key: "imported",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text>{record.fullName || "—"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.departmentName || "Без подразделения"}
            </Text>
          </Space>
        ),
      },
      {
        title: "PassDesk",
        key: "employeeName",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text>{record.employeeName || "—"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.localDepartmentName || "Без подразделения"}
            </Text>
          </Space>
        ),
      },
      {
        title: "Статус",
        dataIndex: "status",
        key: "status",
        width: 170,
        render: (value) => {
          if (value === "ready_to_sync") return <Tag color="green">Готово</Tag>;
          if (value === "already_bound") return <Tag color="blue">Уже связано</Tag>;
          if (value === "sync_queued") return <Tag color="gold">Уже в очереди</Tag>;
          if (value === "employee_not_found") return <Tag color="orange">Не найден</Tag>;
          if (value === "missing_id_all") return <Tag>Нет UUID</Tag>;
          if (value === "duplicate_id_all") return <Tag color="red">Дубль UUID</Tag>;
          if (value === "conflict_employee_data") return <Tag color="red">Конфликт</Tag>;
          return <Tag>{value || "—"}</Tag>;
        },
      },
      {
        title: "Детали",
        dataIndex: "details",
        key: "details",
        render: (value) =>
          Array.isArray(value) && value.length > 0 ? (
            <Space direction="vertical" size={0}>
              {value.map((item) => (
                <Text key={item} type="secondary" style={{ fontSize: 12 }}>
                  {item}
                </Text>
              ))}
            </Space>
          ) : (
            "—"
          ),
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

  const providerDepartmentTreeData = useMemo(() => {
    const nodeMap = new Map();
    const roots = [];

    for (const item of providerDepartments || []) {
      if (!item?.id) {
        continue;
      }

      nodeMap.set(String(item.id), {
        key: String(item.id),
        value: String(item.id),
        title: String(item.name || "—"),
        searchLabel: String(item.pathLabel || item.name || "").toLowerCase(),
        selectable: true,
        children: [],
      });
    }

    for (const item of providerDepartments || []) {
      if (!item?.id) {
        continue;
      }

      const node = nodeMap.get(String(item.id));
      const parentId = item?.parentId ? String(item.parentId) : null;
      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortNodes = (nodes) => {
      nodes.sort((left, right) => String(left.title).localeCompare(String(right.title), "ru"));
      nodes.forEach((node) => sortNodes(node.children));
      return nodes;
    };

    return sortNodes(roots);
  }, [providerDepartments]);

  const providerHierarchyTreeData = useMemo(() => {
    const folderNodeMap = new Map();
    const roots = [];

    for (const item of providerDepartments || []) {
      if (!item?.id) {
        continue;
      }

      const departmentId = String(item.id);
      const loadedEmployees = providerHierarchyEmployeesByDepartment[departmentId] || [];
      const isLoading = providerHierarchyLoadingDepartmentIds.includes(departmentId);

      folderNodeMap.set(departmentId, {
        key: `folder-${departmentId}`,
        departmentId,
        title: renderHierarchyFolderTitle(String(item.name || "—"), {
          loading: isLoading,
          loadedCount: providerHierarchyLoadedDepartmentIds.includes(departmentId)
            ? loadedEmployees.length
            : null,
        }),
        sortLabel: String(item.name || "—"),
        searchLabel: [
          item.pathLabel || item.name || "",
          ...loadedEmployees.map((employee) => employee?.name || ""),
        ]
          .join(" ")
          .toLowerCase(),
        selectable: true,
        isLeaf: false,
        children: [],
      });
    }

    for (const item of providerDepartments || []) {
      if (!item?.id) {
        continue;
      }

      const node = folderNodeMap.get(String(item.id));
      const parentId = item?.parentId ? String(item.parentId) : null;
      if (parentId && folderNodeMap.has(parentId)) {
        folderNodeMap.get(parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    for (const [departmentId, employees] of Object.entries(providerHierarchyEmployeesByDepartment)) {
      if (!folderNodeMap.has(departmentId)) {
        continue;
      }

      for (const employee of employees || []) {
        folderNodeMap.get(departmentId).children.push({
          key: `employee-${departmentId}-${employee.id || employee.name}`,
          title: renderHierarchyEmployeeTitle(employee.name || "—", employee.id || null),
          sortLabel: String(employee.name || "—"),
          searchLabel: [
            employee.name || "",
            employee.id || "",
            employee.departmentName || "",
          ]
            .join(" ")
            .toLowerCase(),
          selectable: false,
          isLeaf: true,
        });
      }
    }

    const sortNodes = (nodes) => {
      nodes.sort((left, right) =>
        String(left.sortLabel || "").localeCompare(String(right.sortLabel || ""), "ru"),
      );
      nodes.forEach((node) => {
        if (Array.isArray(node.children) && node.children.length > 0) {
          sortNodes(node.children);
        }
      });
      return nodes;
    };

    return sortNodes(roots);
  }, [
    providerDepartments,
    providerHierarchyEmployeesByDepartment,
    providerHierarchyLoadedDepartmentIds,
    providerHierarchyLoadingDepartmentIds,
  ]);

  const filteredProviderHierarchyTreeData = useMemo(() => {
    const search = String(providerHierarchySearch || "").trim().toLowerCase();
    if (!search) {
      return providerHierarchyTreeData;
    }

    const filterNodes = (nodes) =>
      nodes.reduce((acc, node) => {
        const filteredChildren = filterNodes(node.children || []);
        const matches = String(node.searchLabel || "").includes(search);

        if (!matches && filteredChildren.length === 0) {
          return acc;
        }

        acc.push({
          ...node,
          children: filteredChildren,
        });
        return acc;
      }, []);

    return filterNodes(providerHierarchyTreeData);
  }, [providerHierarchySearch, providerHierarchyTreeData]);

  const providerDepartmentsById = useMemo(
    () =>
      new Map(
        (providerDepartments || [])
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item]),
      ),
    [providerDepartments],
  );

  const providerHierarchySearchTreeData = useMemo(() => {
    const search = String(providerHierarchySearch || "").trim();
    if (!search) {
      return [];
    }

    const folderNodeMap = new Map();
    const rootMap = new Map();

    const ensureFolderNode = (department) => {
      if (!department?.id) {
        return null;
      }

      const departmentId = String(department.id);
      if (folderNodeMap.has(departmentId)) {
        return folderNodeMap.get(departmentId);
      }

      const node = {
        key: `search-folder-${departmentId}`,
        departmentId,
        title: renderHierarchyFolderTitle(String(department.name || "—")),
        sortLabel: String(department.name || "—"),
        searchLabel: String(department.pathLabel || department.name || "").toLowerCase(),
        selectable: true,
        isLeaf: false,
        children: [],
      };

      folderNodeMap.set(departmentId, node);

      const parentId = department?.parentId ? String(department.parentId) : null;
      if (parentId && providerDepartmentsById.has(parentId)) {
        const parentNode = ensureFolderNode(providerDepartmentsById.get(parentId));
        if (
          parentNode
          && !parentNode.children.some((child) => child.key === node.key)
        ) {
          parentNode.children.push(node);
        }
      } else {
        rootMap.set(node.key, node);
      }

      return node;
    };

    for (const employee of providerHierarchySearchEmployees || []) {
      const departmentId = employee?.departmentId ? String(employee.departmentId) : null;
      const department = departmentId ? providerDepartmentsById.get(departmentId) : null;
      const employeeNode = {
        key: `search-employee-${departmentId || "root"}-${employee.id || employee.name}`,
        title: renderHierarchyEmployeeTitle(employee.name || "—", employee.id || null),
        sortLabel: String(employee.name || "—"),
        searchLabel: [
          employee.name || "",
          employee.id || "",
          employee.departmentName || "",
        ]
          .join(" ")
          .toLowerCase(),
        selectable: false,
        isLeaf: true,
      };

      if (department) {
        const folderNode = ensureFolderNode(department);
        if (folderNode) {
          folderNode.children.push(employeeNode);
        }
      } else {
        rootMap.set(employeeNode.key, employeeNode);
      }
    }

    const sortNodes = (nodes) => {
      nodes.sort((left, right) =>
        String(left.sortLabel || "").localeCompare(String(right.sortLabel || ""), "ru"),
      );
      nodes.forEach((node) => {
        if (Array.isArray(node.children) && node.children.length > 0) {
          sortNodes(node.children);
        }
      });
      return nodes;
    };

    return sortNodes(Array.from(rootMap.values()));
  }, [
    providerDepartmentsById,
    providerHierarchySearch,
    providerHierarchySearchEmployees,
  ]);

  const providerHierarchySearchExpandedKeys = useMemo(() => {
    const keys = [];

    const walk = (nodes) => {
      for (const node of nodes || []) {
        if (Array.isArray(node.children) && node.children.length > 0) {
          keys.push(node.key);
          walk(node.children);
        }
      }
    };

    walk(providerHierarchySearchTreeData);
    return keys;
  }, [providerHierarchySearchTreeData]);

  const handleProviderHierarchyExpand = useCallback(
    (nextExpandedKeys, info) => {
      setProviderHierarchyExpandedKeys(nextExpandedKeys);

      const departmentId = info?.node?.departmentId;
      if (info?.expanded && departmentId) {
        void loadProviderHierarchyDepartmentEmployees(departmentId);
      }
    },
    [loadProviderHierarchyDepartmentEmployees],
  );

  const handleProviderHierarchySelect = useCallback((selectedKeys, info) => {
    if (info?.node?.departmentId) {
      setProviderHierarchySelectedDepartmentId(String(info.node.departmentId));
      return;
    }

    setProviderHierarchySelectedDepartmentId(null);
  }, []);

  const selectedProviderHierarchyDepartment = useMemo(() => {
    if (!providerHierarchySelectedDepartmentId) {
      return null;
    }

    return providerDepartmentsById.get(String(providerHierarchySelectedDepartmentId)) || null;
  }, [providerDepartmentsById, providerHierarchySelectedDepartmentId]);

  const providerHierarchySelectedKeys = useMemo(() => {
    if (!providerHierarchySelectedDepartmentId) {
      return [];
    }

    return providerHierarchySearch
      ? [`search-folder-${providerHierarchySelectedDepartmentId}`]
      : [`folder-${providerHierarchySelectedDepartmentId}`];
  }, [providerHierarchySearch, providerHierarchySelectedDepartmentId]);

  const refreshProviderHierarchy = useCallback(async () => {
    resetProviderHierarchyView();
    await loadProviderDepartments();
  }, [loadProviderDepartments, resetProviderHierarchyView]);

  const openProviderHierarchyModal = useCallback((mode) => {
    setProviderHierarchyModalMode(mode);
    if (mode === "rename" && selectedProviderHierarchyDepartment) {
      setProviderHierarchyModalName(selectedProviderHierarchyDepartment.name || "");
    } else {
      setProviderHierarchyModalName("");
    }
    setProviderHierarchyModalOpen(true);
  }, [selectedProviderHierarchyDepartment]);

  const closeProviderHierarchyModal = useCallback(() => {
    setProviderHierarchyModalOpen(false);
    setProviderHierarchyModalMode(null);
    setProviderHierarchyModalName("");
  }, []);

  const handleSubmitProviderHierarchyModal = useCallback(async () => {
    const name = String(providerHierarchyModalName || "").trim();
    if (!name) {
      message.warning("Укажите название папки");
      return;
    }

    setProviderHierarchyModalSubmitting(true);
    try {
      if (providerHierarchyModalMode === "rename" && selectedProviderHierarchyDepartment?.id) {
        await skudService.updateProviderDepartment(selectedProviderHierarchyDepartment.id, {
          name,
        });
        message.success("Папка Sigur переименована");
      } else if (providerHierarchyModalMode === "create_root") {
        await skudService.createProviderDepartment({ name });
        message.success("Корневая папка Sigur создана");
      } else if (providerHierarchyModalMode === "create_child") {
        const parentId = String(providerHierarchySelectedDepartmentId || "").trim();
        if (!parentId) {
          message.warning("Сначала выберите родительскую папку");
          return;
        }
        await skudService.createProviderDepartment({ name, parentId });
        message.success("Подпапка Sigur создана");
      }

      closeProviderHierarchyModal();
      await refreshProviderHierarchy();
    } catch (error) {
      console.error("Failed to manage Sigur department:", error);
      message.error(getRequestErrorMessage(error, "Не удалось изменить папку Sigur"));
    } finally {
      setProviderHierarchyModalSubmitting(false);
    }
  }, [
    closeProviderHierarchyModal,
    message,
    providerHierarchyModalMode,
    providerHierarchyModalName,
    providerHierarchySelectedDepartmentId,
    refreshProviderHierarchy,
    selectedProviderHierarchyDepartment,
  ]);

  const handleDeleteProviderHierarchyDepartment = useCallback(async () => {
    const departmentId = String(providerHierarchySelectedDepartmentId || "").trim();
    if (!departmentId) {
      message.warning("Сначала выберите папку");
      return;
    }

    setProviderHierarchyDeleting(true);
    try {
      await skudService.deleteProviderDepartment(departmentId);
      message.success("Папка Sigur удалена");
      setProviderHierarchySelectedDepartmentId(null);
      await refreshProviderHierarchy();
    } catch (error) {
      console.error("Failed to delete Sigur department:", error);
      message.error(
        getRequestErrorMessage(
          error,
          "Не удалось удалить папку Sigur. Удаляются только пустые папки без вложений и сотрудников.",
        ),
      );
    } finally {
      setProviderHierarchyDeleting(false);
    }
  }, [message, providerHierarchySelectedDepartmentId, refreshProviderHierarchy]);

  const latestVisibleEventTime = state.events?.items?.[0]?.eventTime || null;
  const hasSkudAuthError = state.health?.authOk === false;
  const lastSyncAt = state.health?.lastSyncAt || null;
  const eventDetailsProviderEmployeeName = eventDetailsProviderEmployee?.name || null;
  const eventDetailsProviderZone = eventDetailsProviderEmployee?.location?.zoneName || null;
  const eventDetailsExternalEmpId = eventDetailsRecord?.externalEmpId || null;
  const eventDetailsLocalEmployeeName = getLocalEmployeeName(eventDetailsRecord) || null;
  const eventDetailsNameMatch = arePersonNamesMatching(
    eventDetailsProviderEmployeeName,
    eventDetailsLocalEmployeeName,
  );
  const totalEventsCount = Number(state.events?.pagination?.total || 0);
  const loadedEventsCount = Array.isArray(state.events?.items) ? state.events.items.length : 0;
  const displayedEventItems = useMemo(() => {
    const start = Math.max(eventsPage - 1, 0) * eventsPageSize;
    return (state.events?.items || []).slice(start, start + eventsPageSize);
  }, [eventsPage, eventsPageSize, state.events?.items]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
      <Space direction="vertical" size={0}>
        <Text strong>СКУД (Sigur)</Text>
        <Text type="secondary">
          Мониторинг проходов, задач синхронизации и состояния карт.
        </Text>
      </Space>

      {hasSkudAuthError ? (
        <Alert
          type="warning"
          showIcon
          message="Sigur сейчас не отвечает валидной авторизацией"
          description={[
            state.health?.authError ? `Причина: ${state.health.authError}` : null,
            latestVisibleEventTime
              ? `Последняя видимая запись в журнале: ${dayjs(latestVisibleEventTime).format("DD.MM.YYYY HH:mm:ss")}`
              : null,
            lastSyncAt
              ? `Последняя успешная синхронизация: ${dayjs(lastSyncAt).format("DD.MM.YYYY HH:mm:ss")}`
              : null,
            "Live-журнал Sigur сейчас недоступен.",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ) : null}

      <Tabs
        activeKey={activeTab}
        onChange={(nextTab) => {
          setActiveTab(nextTab);
          setSearchParams((prev) => {
            const nextParams = new URLSearchParams(prev);
            nextParams.set("tab", nextTab);
            return nextParams;
          });
        }}
        items={[
          {
            key: "issuance",
            label: "Выдача пропуска",
            children: <SkudPassIssuanceTab />,
          },
          isAdmin && {
            key: "events",
            label: "События",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Фильтры журнала">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Text type="secondary">
                      Журнал читается напрямую из Sigur. По умолчанию экран показывает только сегодняшние проходы.
                    </Text>
                    <Space wrap>
                      <RangePicker
                        value={eventDateRange}
                        onChange={handleEventDateRangeChange}
                        format="DD.MM.YYYY"
                        allowEmpty={[false, false]}
                      />
                      <Select
                        style={{ width: 220 }}
                        options={eventTypeOptions}
                        value={eventTypeFilter}
                        onChange={handleEventTypeFilterChange}
                      />
                      <Select
                        style={{ width: 180 }}
                        options={[
                          { value: "all", label: "Все решения" },
                          { value: "allowed", label: "Разрешено" },
                          { value: "denied", label: "Отказ" },
                        ]}
                        value={decisionFilter}
                        onChange={handleDecisionFilterChange}
                      />
                      <Select
                        style={{ width: 160 }}
                        options={[
                          { value: "all", label: "Все направления" },
                          { value: "1", label: "Вход" },
                          { value: "2", label: "Выход" },
                        ]}
                        value={directionFilter}
                        onChange={handleDirectionFilterChange}
                      />
                      <Select
                        showSearch
                        allowClear
                        style={{ width: 320 }}
                        placeholder="Точка доступа"
                        options={accessPointOptions}
                        value={accessPointFilter}
                        loading={providerAccessPointsLoading}
                        onChange={handleAccessPointFilterChange}
                        optionFilterProp="label"
                        filterOption={(input, option) =>
                          String(option?.label || "")
                            .toLowerCase()
                            .includes(String(input || "").trim().toLowerCase())
                        }
                      />
                    </Space>
                    <Space size={8}>
                      <Text type="secondary">Показывать только проходы</Text>
                      <Switch checked={showOnlyPassages} onChange={handleShowOnlyPassagesChange} />
                    </Space>
                    <Space wrap>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={handleRefreshEvents}
                        loading={loading || pullingEvents}
                      >
                        Обновить
                      </Button>
                    </Space>
                  </Space>
                </Card>

                <Card
                  title="Журнал событий"
                  extra={
                    <Text type="secondary">
                      Всего записей: {totalEventsCount}. Загружено: {loadedEventsCount}
                    </Text>
                  }
                >
                  <Table
                    rowKey={getEventRowKey}
                    columns={eventsColumns}
                    dataSource={displayedEventItems}
                    loading={loading}
                    onChange={handleEventsTableChange}
                    pagination={{
                      current: eventsPage,
                      pageSize: eventsPageSize,
                      total: loadedEventsCount,
                      showSizeChanger: true,
                      pageSizeOptions: ["20", "50", "100", "200"],
                      showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} загруженных`,
                    }}
                    scroll={{ x: 1200 }}
                  />
                </Card>
              </Space>
            ),
          },
          isAdmin && {
            key: "employees",
            label: "Сотрудники",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Row gutter={[24, 24]} align="top">
                  <Col xs={24} lg={9} xl={8}>
                    <Card title="1. Действия по сотруднику">
                      <Space direction="vertical" size={16} style={{ width: "100%" }}>
                        <Text type="secondary">
                          Выберите сотрудника, укажите папку Sigur и выполните нужное действие. Новая подпапка при необходимости создастся во время `sync`.
                        </Text>
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Text strong>Сотрудник PassDesk</Text>
                          <Select
                            showSearch
                            allowClear
                            placeholder="Выберите сотрудника"
                            value={employeeIdInput || undefined}
                            options={employeeOptions}
                            loading={employeeOptionsLoading}
                            onSearch={setEmployeeSearch}
                            onChange={(value) => setEmployeeIdInput(value || "")}
                            optionFilterProp="label"
                            filterOption={false}
                            style={{ width: "100%" }}
                          />
                        </Space>

                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Text strong>Папка Sigur</Text>
                          <TreeSelect
                            allowClear
                            showSearch
                            treeDefaultExpandAll
                            placeholder="Выберите папку Sigur"
                            value={selectedSigurDepartmentId || undefined}
                            treeData={providerDepartmentTreeData}
                            onChange={(value) => setSelectedSigurDepartmentId(value || null)}
                            loading={providerDepartmentsLoading}
                            style={{ width: "100%" }}
                            treeNodeFilterProp="title"
                            dropdownStyle={{ maxHeight: 360, overflow: "auto" }}
                          />
                          <Input
                            placeholder="Новая подпапка внутри выбранной папки (опционально)"
                            value={sigurSubfolderInput}
                            onChange={(event) => setSigurSubfolderInput(event.target.value)}
                          />
                        </Space>

                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Text strong>Комментарий</Text>
                          <Input
                            placeholder="Причина (опционально)"
                            value={employeeReasonInput}
                            onChange={(event) => setEmployeeReasonInput(event.target.value)}
                          />
                        </Space>

                        <Space wrap size={12}>
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
                      </Space>
                    </Card>
                  </Col>

                  <Col xs={24} lg={15} xl={16}>
                    <Card
                      title="2. Иерархия Sigur"
                      extra={
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            resetProviderHierarchyView();
                            void loadProviderDepartments();
                          }}
                          loading={providerDepartmentsLoading}
                        >
                          Обновить
                        </Button>
                      }
                    >
                      <Space direction="vertical" size={16} style={{ width: "100%" }}>
                        <Text type="secondary">
                          Полная структура папок Sigur. Сотрудники подгружаются только при раскрытии нужной папки.
                        </Text>
                        <Space wrap size={12}>
                          <Button onClick={() => openProviderHierarchyModal("create_root")}>
                            Создать папку
                          </Button>
                          <Button
                            onClick={() => openProviderHierarchyModal("create_child")}
                            disabled={!selectedProviderHierarchyDepartment}
                          >
                            Создать подпапку
                          </Button>
                          <Button
                            onClick={() => openProviderHierarchyModal("rename")}
                            disabled={!selectedProviderHierarchyDepartment}
                          >
                            Переименовать
                          </Button>
                          <Popconfirm
                            title="Удалить выбранную папку Sigur?"
                            description="Удаление сработает только для пустой папки без сотрудников и вложенных папок."
                            okText="Удалить"
                            cancelText="Отмена"
                            onConfirm={() => {
                              void handleDeleteProviderHierarchyDepartment();
                            }}
                            disabled={!selectedProviderHierarchyDepartment}
                          >
                            <Button
                              danger
                              disabled={!selectedProviderHierarchyDepartment}
                              loading={providerHierarchyDeleting}
                            >
                              Удалить пустую
                            </Button>
                          </Popconfirm>
                        </Space>
                        {selectedProviderHierarchyDepartment ? (
                          <Text type="secondary">
                            Выбрана папка: {selectedProviderHierarchyDepartment.pathLabel || selectedProviderHierarchyDepartment.name}
                          </Text>
                        ) : (
                          <Text type="secondary">
                            Выберите папку в дереве, чтобы управлять ей.
                          </Text>
                        )}
                        <Input
                          placeholder="Поиск по ФИО в Sigur (с начала имени)"
                          value={providerHierarchySearch}
                          onChange={(event) => setProviderHierarchySearch(event.target.value)}
                          suffix={providerHierarchySearchLoading ? <SyncOutlined spin /> : null}
                        />
                        <div
                          style={{
                            border: "1px solid #f0f0f0",
                            borderRadius: 12,
                            padding: 16,
                            background: "#fff",
                          }}
                        >
                          <Tree
                            treeData={
                              providerHierarchySearch
                                ? providerHierarchySearchTreeData
                                : filteredProviderHierarchyTreeData
                            }
                            selectedKeys={providerHierarchySelectedKeys}
                            expandedKeys={
                              providerHierarchySearch
                                ? providerHierarchySearchExpandedKeys
                                : providerHierarchyExpandedKeys
                            }
                            onSelect={handleProviderHierarchySelect}
                            onExpand={handleProviderHierarchyExpand}
                            height={640}
                            showIcon={false}
                            showLine
                          />
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>

                <Modal
                  title={
                    providerHierarchyModalMode === "rename"
                      ? "Переименовать папку Sigur"
                      : providerHierarchyModalMode === "create_child"
                        ? "Создать подпапку Sigur"
                        : "Создать папку Sigur"
                  }
                  open={providerHierarchyModalOpen}
                  onCancel={closeProviderHierarchyModal}
                  onOk={() => {
                    void handleSubmitProviderHierarchyModal();
                  }}
                  okText={providerHierarchyModalMode === "rename" ? "Сохранить" : "Создать"}
                  cancelText="Отмена"
                  confirmLoading={providerHierarchyModalSubmitting}
                  destroyOnClose
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {selectedProviderHierarchyDepartment && providerHierarchyModalMode !== "create_root" ? (
                      <Text type="secondary">
                        {providerHierarchyModalMode === "rename" ? "Текущая папка:" : "Родительская папка:"}{" "}
                        {selectedProviderHierarchyDepartment.pathLabel || selectedProviderHierarchyDepartment.name}
                      </Text>
                    ) : null}
                    <Input
                      autoFocus
                      placeholder="Название папки"
                      value={providerHierarchyModalName}
                      onChange={(event) => setProviderHierarchyModalName(event.target.value)}
                      onPressEnter={() => {
                        void handleSubmitProviderHierarchyModal();
                      }}
                    />
                  </Space>
                </Modal>

                <Card title="3. Импорт соответствий по пропускам (Excel)">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Text type="secondary">
                      Этот сценарий нужен для массовой догрузки. Сначала загрузите Excel из 1С ЗУП, затем проверьте конфликты, потом отправьте в sync только строки со статусом «Готово».
                    </Text>

                    <Space wrap>
                      <Upload
                        accept=".xlsx,.xls"
                        showUploadList={false}
                        beforeUpload={handleBindingImportFileSelect}
                      >
                        <Button icon={<UploadOutlined />} loading={bindingImportLoading}>
                          Загрузить Excel
                        </Button>
                      </Upload>
                      <Button
                        onClick={handlePreviewBindingImport}
                        loading={bindingImportLoading}
                        disabled={!bindingImportRows.length}
                      >
                        Проверить
                      </Button>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={handleExportBindingImportPreview}
                        disabled={!bindingImportPreview?.items?.length}
                      >
                        Скачать проверку
                      </Button>
                      <Button
                        type="primary"
                        onClick={handleExecuteBindingImport}
                        loading={bindingImportExecuting}
                        disabled={
                          !bindingImportPreview?.summary?.readyToSyncCount
                            || bindingImportExecuting
                        }
                      >
                        Догрузить новые
                      </Button>
                    </Space>

                    <Text type="secondary">
                      {bindingImportFileName
                        ? `${bindingImportFileName}: ${bindingImportRows.length} строк`
                        : "Файл не выбран"}
                    </Text>

                    {bindingImportPreview?.summary ? (
                      <Row gutter={[12, 12]}>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="Готово"
                              value={bindingImportPreview.summary.readyToSyncCount || 0}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="Уже связано"
                              value={bindingImportPreview.summary.alreadyBoundCount || 0}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="В очереди"
                              value={bindingImportPreview.summary.syncQueuedCount || 0}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="Не найдено"
                              value={bindingImportPreview.summary.unmatchedCount || 0}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="Конфликты"
                              value={bindingImportPreview.summary.conflictCount || 0}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8} lg={4}>
                          <Card size="small">
                            <Statistic
                              title="Дубли/пусто"
                              value={
                                (bindingImportPreview.summary.duplicateIdAllCount || 0)
                                + (bindingImportPreview.summary.missingIdAllCount || 0)
                              }
                            />
                          </Card>
                        </Col>
                      </Row>
                    ) : null}

                    {bindingImportPreview?.items?.length ? (
                      <Table
                        rowKey={(record) => `binding-import-${record.rowIndex}`}
                        size="small"
                        columns={bindingImportColumns}
                        dataSource={bindingImportPreview.items}
                        pagination={{
                          pageSize: 10,
                          showSizeChanger: true,
                          pageSizeOptions: ["10", "20", "50"],
                        }}
                        scroll={{ x: 1100 }}
                      />
                    ) : null}
                  </Space>
                </Card>

                <Card title="5. Очередь синхронизации">
                  <Table
                    rowKey="id"
                    columns={syncColumns}
                    dataSource={state.syncJobs?.items || []}
                    loading={loading}
                    pagination={false}
                    scroll={{ x: 1000 }}
                  />
                </Card>

                <Card
                  title="6. Сверка связок Sigur ↔ PassDesk"
                  extra={
                    <Space>
                      <Space size={8}>
                        <Text type="secondary">Только несовпадения</Text>
                        <Switch
                          checked={bindingsAuditMismatchOnly}
                          onChange={(value) => setBindingsAuditMismatchOnly(value)}
                        />
                      </Space>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={bindingsAuditLoading}
                        onClick={() => {
                          void loadBindingsAudit();
                        }}
                      >
                        Проверить
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    rowKey={(record) => record.id}
                    size="small"
                    loading={bindingsAuditLoading}
                    dataSource={bindingsAuditItems}
                    pagination={{
                      pageSize: 20,
                      showSizeChanger: true,
                      pageSizeOptions: ["20", "50", "100"],
                    }}
                    columns={[
                      {
                        title: "Sigur ID",
                        dataIndex: "externalEmpId",
                        key: "externalEmpId",
                        width: 140,
                        render: (value) => value || "—",
                      },
                      {
                        title: "ФИО Sigur",
                        dataIndex: "sigurName",
                        key: "sigurName",
                        render: (value) => value || "—",
                      },
                      {
                        title: "ФИО сотрудника",
                        dataIndex: "localName",
                        key: "localName",
                        render: (value) => value || "—",
                      },
                      {
                        title: "Статус",
                        dataIndex: "nameMatch",
                        key: "nameMatch",
                        width: 180,
                        render: (value) => (
                          <Tag color={value ? "green" : "red"}>
                            {value ? "Совпадает" : "Несовпадение"}
                          </Tag>
                        ),
                      },
                    ]}
                    scroll={{ x: 900 }}
                  />
                </Card>
              </Space>
            ),
          },
          isAdmin && {
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
                    <Select
                      showSearch
                      allowClear
                      placeholder="Выберите сотрудника"
                      value={cardEmployeeIdInput || undefined}
                      options={cardEmployeeOptions}
                      loading={cardEmployeeOptionsLoading}
                      onSearch={setCardEmployeeSearch}
                      onChange={(value) => setCardEmployeeIdInput(value || "")}
                      optionFilterProp="label"
                      filterOption={false}
                      style={{ width: "100%" }}
                      popupMatchSelectWidth
                    />
                    <Text type="secondary">
                      Выберите сотрудника, нажмите «Ожидать карту» и приложите карту к считывателю. Требуется запущенный агент{" "}
                      <Text code>server/skud-agent/start.bat</Text>.
                    </Text>
                    <Input
                      ref={cardNumberInputRef}
                      placeholder="Номер карты"
                      value={cardNumberInput}
                      onChange={(event) => setCardNumberInput(event.target.value)}
                      onPressEnter={(event) => {
                        if (!cardReaderArmed) {
                          return;
                        }
                        void handleAssignCard({
                          cardNumber: event.currentTarget.value,
                        });
                      }}
                    />
                    <Space wrap>
                      <Select
                        value={cardTypeInput}
                        onChange={setCardTypeInput}
                        options={[
                          { value: "rfid", label: "RFID" },
                          { value: "nfc", label: "NFC" },
                          { value: "other", label: "Другое" },
                        ]}
                      />
                      <Select
                        value={uidFormat}
                        onChange={setUidFormat}
                        title="Формат UID карты"
                        options={[
                          { value: "w26", label: "W26 (рекомендован)" },
                          { value: "sigurCard", label: "Sigur" },
                          { value: "decBe", label: "Decimal (BE)" },
                          { value: "decLe", label: "Decimal (LE)" },
                          { value: "hexUid", label: "HEX" },
                        ]}
                      />
                    </Space>
                    <Input
                      placeholder="Комментарий (опционально)"
                      value={cardNotesInput}
                      onChange={(event) => setCardNotesInput(event.target.value)}
                    />
                    <Space wrap>
                      <Button
                        onClick={handleArmCardReader}
                        type={cardReaderArmed ? "default" : "default"}
                        danger={cardReaderArmed}
                      >
                        {cardReaderArmed
                          ? wsConnected
                            ? "Считыватель активен (остановить)"
                            : "Режим ввода активен (остановить)"
                          : "Ожидать карту"}
                      </Button>
                      <Button
                        type="primary"
                        onClick={() => void handleAssignCard()}
                        loading={assigningCard}
                      >
                        Привязать карту
                      </Button>
                    </Space>
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
          isAdmin && {
            key: "qr",
            label: "QR",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="Выпуск QR для СКУД">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Выберите сотрудника"
                      value={qrEmployeeIdInput || undefined}
                      options={qrEmployeeOptions}
                      loading={qrEmployeeOptionsLoading}
                      onSearch={setQrEmployeeSearch}
                      onChange={(value) => setQrEmployeeIdInput(value || "")}
                      optionFilterProp="label"
                      filterOption={false}
                      style={{ width: "100%" }}
                      popupMatchSelectWidth
                    />
                    <Text type="secondary">
                      Если сотрудника нет в первых результатах, начните вводить ФИО или UUID.
                    </Text>
                    <Select
                      value={qrTokenTypeInput}
                      onChange={setQrTokenTypeInput}
                      style={{ width: "100%" }}
                      options={[
                        { value: "persistent", label: "Постоянный" },
                        { value: "one_time", label: "Одноразовый" },
                      ]}
                    />
                    <Select
                      value={qrChannelInput}
                      onChange={setQrChannelInput}
                      style={{ width: "100%" }}
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
                        Скопировать код
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

                <Card title="Проверка QR-кода">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <TextArea
                      rows={4}
                      placeholder="Вставьте код из QR или keyHex от считывателя"
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
                          Тип QR: {qrVerifyResult.tokenType || "—"}
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
                        Здесь будет результат проверки QR-кода и решение allow/deny.
                      </Text>
                    )}
                  </Space>
                </Card>
              </Space>
            ),
          },
          isAdmin && {
            key: "passes",
            label: "Пропуска",
            children: <PassesPage embedded />,
          },
          isAdmin && {
            key: "site-access-points",
            label: "Объекты → Sigur",
            children: (
              <SkudSiteAccessPointsTab
                providerAccessPoints={providerAccessPoints}
                accessPointsLoading={providerAccessPointsLoading}
                onReloadAccessPoints={loadProviderAccessPoints}
              />
            ),
          },
        ].filter(Boolean)}
      />

      <Drawer
        title="Детали события"
        open={eventDetailsOpen}
        onClose={handleCloseEventDetails}
        width={560}
        destroyOnClose
      >
        {eventDetailsRecord ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Spin spinning={eventDetailsLoading}>
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Время">
                  {eventDetailsRecord?.eventTime
                    ? dayjs(eventDetailsRecord.eventTime).format("DD.MM.YYYY HH:mm:ss")
                    : "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Сотрудник Sigur">
                  {eventDetailsProviderEmployeeName ? (
                    <Space direction="vertical" size={0}>
                      <Text>{eventDetailsProviderEmployeeName}</Text>
                      {eventDetailsProviderZone ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Текущая зона: {eventDetailsProviderZone}
                        </Text>
                      ) : null}
                    </Space>
                  ) : (
                    "Не удалось загрузить карточку из Sigur"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Сотрудник PassDesk">
                  {eventDetailsLocalEmployeeName || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Сверка ФИО">
                  {eventDetailsNameMatch === null ? (
                    <Text type="secondary">Недостаточно данных для сравнения</Text>
                  ) : (
                    <Tag color={eventDetailsNameMatch ? "green" : "red"}>
                      {eventDetailsNameMatch ? "Совпадает" : "Несовпадение"}
                    </Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Sigur ID сотрудника">
                  {eventDetailsExternalEmpId || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Отдел сотрудника">
                  {getEmployeeDepartmentName(eventDetailsRecord) || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Точка прохода">
                  {getAccessPointName(eventDetailsRecord)
                    || (eventDetailsRecord?.accessPoint
                      ? `#${eventDetailsRecord.accessPoint}`
                      : "—")}
                </Descriptions.Item>
                <Descriptions.Item label="Зона">
                  {getZoneName(eventDetailsRecord) || eventDetailsProviderZone || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Тип события">
                  {getEventTypeLabel(eventDetailsRecord?.eventType)}
                </Descriptions.Item>
                <Descriptions.Item label="Направление">
                  {eventDetailsRecord?.direction === 1
                    ? "Вход"
                    : eventDetailsRecord?.direction === 2
                      ? "Выход"
                      : "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Причина">
                  {getPassReason(eventDetailsRecord) || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Карта">
                  {getCardKey(eventDetailsRecord) || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Сообщение">
                  {eventDetailsRecord?.decisionMessage || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Источник">
                  {eventDetailsRecord?.source || "—"}
                </Descriptions.Item>
              </Descriptions>
            </Spin>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
};

export default SkudAdminSection;
