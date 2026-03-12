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
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  TreeSelect,
  Typography,
  Upload,
  Popconfirm,
} from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import PassesPage from "@/pages/PassesPage";
import { employeeService } from "@/services/employeeService";
import { readSkudBindingImportExcel } from "@/modules/skud/lib/readSkudBindingImportExcel";
import skudService from "@/services/skudService";

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

const buildEventRangeParams = (eventDateRange) =>
  Array.isArray(eventDateRange) && eventDateRange[0] && eventDateRange[1]
    ? {
        from: eventDateRange[0].startOf("day").toISOString(),
        to: eventDateRange[1].endOf("day").toISOString(),
      }
    : {};

const SkudAdminSection = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [pullingEvents, setPullingEvents] = useState(false);
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeOptionsLoading, setEmployeeOptionsLoading] = useState(false);
  const [externalEmpIdInput, setExternalEmpIdInput] = useState("");
  const [employeeReasonInput, setEmployeeReasonInput] = useState("");
  const [providerDepartments, setProviderDepartments] = useState([]);
  const [providerDepartmentsLoading, setProviderDepartmentsLoading] = useState(false);
  const [selectedSigurDepartmentId, setSelectedSigurDepartmentId] = useState(null);
  const [sigurSubfolderInput, setSigurSubfolderInput] = useState("");
  const [employeeActionLoading, setEmployeeActionLoading] = useState(false);
  const [bindingLookupLoading, setBindingLookupLoading] = useState(false);
  const [bindingInfo, setBindingInfo] = useState(null);
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
  const [localEmployeeSearch, setLocalEmployeeSearch] = useState("");
  const [providerEmployeeSearch, setProviderEmployeeSearch] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [localEmployees, setLocalEmployees] = useState([]);
  const [providerEmployees, setProviderEmployees] = useState([]);
  const [selectedLocalEmployeeId, setSelectedLocalEmployeeId] = useState(null);
  const [selectedProviderEmployeeId, setSelectedProviderEmployeeId] = useState(null);
  const [bindingActionLoading, setBindingActionLoading] = useState(false);
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
  const [eventDateRange, setEventDateRange] = useState(getTodayEventRange);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(20);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [eventDetailsLoading, setEventDetailsLoading] = useState(false);
  const [eventDetailsRecord, setEventDetailsRecord] = useState(null);
  const [eventDetailsProviderEmployee, setEventDetailsProviderEmployee] = useState(null);
  const cardNumberInputRef = useRef(null);
  const eventsAutoRefreshRef = useRef(false);
  const [state, setState] = useState({
    health: null,
    stats: null,
    events: {
      items: [],
      pagination: { total: 0, limit: 200, offset: 0 },
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
          offset: Math.max(eventsPage - 1, 0) * eventsPageSize,
          passageOnly: showOnlyPassages,
          ...(eventTypeFilter !== "all" ? { eventType: eventTypeFilter } : {}),
          ...(decisionFilter === "allowed"
            ? { allow: true }
            : decisionFilter === "denied"
              ? { allow: false }
              : {}),
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
    decisionFilter,
    eventDateRange,
    eventTypeFilter,
    eventsPage,
    eventsPageSize,
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

  const handleEventDateRangeChange = useCallback((value) => {
    setEventsPage(1);
    setEventDateRange(value);
  }, []);

  const handleEventsTableChange = useCallback((pagination) => {
    const nextPageSize = Number(pagination?.pageSize || 20);
    const nextPage = Number(pagination?.current || 1);

    if (nextPageSize !== eventsPageSize) {
      setEventsPageSize(nextPageSize);
      setEventsPage(1);
      return;
    }

    setEventsPage(nextPage);
  }, [eventsPageSize]);

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

  const handleLoadBinding = useCallback(async () => {
    const employeeId = String(employeeIdInput || "").trim();
    if (!employeeId) {
      message.warning("Выберите сотрудника");
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
      message.warning("Выберите сотрудника и укажите externalEmpId");
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

  const handleArmCardReader = useCallback(() => {
    setCardReaderArmed(true);
    focusCardReaderInput();
  }, [focusCardReaderInput]);

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
    const total = Number(state.events?.pagination?.total || 0);
    const maxPage = Math.max(1, Math.ceil(total / eventsPageSize));
    if (eventsPage > maxPage) {
      setEventsPage(maxPage);
    }
  }, [eventsPage, eventsPageSize, state.events?.pagination?.total]);

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
    if (activeTab !== "employees") {
      return;
    }
    loadMappingLists();
  }, [activeTab, loadMappingLists]);

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
    if (activeTab !== "qr") {
      return;
    }
    loadQrEmployees(qrEmployeeSearch);
  }, [activeTab, loadQrEmployees, qrEmployeeSearch]);

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
          const sigurName = getSigurPersonName(record);
          const ext = record.externalEmpId ? `ID ${record.externalEmpId}` : "—";
          const triggerLabel = sigurName || ext;

          return (
            <Space direction="vertical" size={0}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: "auto", textAlign: "left" }}
                onClick={() => {
                  void handleOpenEventDetails(record);
                }}
              >
                {triggerLabel}
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sigur: {ext}
              </Text>
            </Space>
          );
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
        render: (value) => getEventTypeLabel(value),
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
    ],
    [handleOpenEventDetails],
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

  const bindingImportColumns = useMemo(
    () => [
      {
        title: "Строка",
        dataIndex: "rowIndex",
        key: "rowIndex",
        width: 90,
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
          if (value === "new_pass") return <Tag color="orange">Новый пропуск</Tag>;
          if (value === "missing_pass_number") return <Tag>Нет номера</Tag>;
          if (value === "duplicate_pass_number") return <Tag color="red">Дубль в файле</Tag>;
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

  const latestVisibleEventTime = state.events?.items?.[0]?.eventTime || null;
  const hasSkudAuthError = state.health?.authOk === false;
  const lastSyncAt = state.health?.lastSyncAt || null;
  const eventDetailsProviderEmployeeName = eventDetailsProviderEmployee?.name || null;
  const eventDetailsProviderZone = eventDetailsProviderEmployee?.location?.zoneName || null;
  const eventDetailsExternalEmpId = eventDetailsRecord?.externalEmpId || null;

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

                <Card title="Журнал событий">
                  <Table
                    rowKey={getEventRowKey}
                    columns={eventsColumns}
                    dataSource={state.events?.items || []}
                    loading={loading}
                    onChange={handleEventsTableChange}
                    pagination={{
                      current: eventsPage,
                      pageSize: eventsPageSize,
                      total: Number(state.events?.pagination?.total || 0),
                      showSizeChanger: true,
                      pageSizeOptions: ["20", "50", "100", "200"],
                      showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
                    }}
                    scroll={{ x: 900 }}
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
                <Card
                  title="Сценарии работы с сотрудниками"
                  extra={
                    <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                      Обновить
                    </Button>
                  }
                >
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic title="Очередь sync" value={state.syncJobs?.pagination?.total || 0} />
                        <Text type="secondary">
                          Ручные операции, импорт из Excel и автоматические догрузки.
                        </Text>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic title="Ошибки sync" value={state.stats?.syncJobs?.failed || 0} />
                        <Text type="secondary">
                          Если здесь растёт число, сначала проверяйте Sigur API и права.
                        </Text>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic
                          title="Готово к догрузке"
                          value={bindingImportPreview?.summary?.readyToSyncCount || 0}
                        />
                        <Text type="secondary">
                          Количество строк из текущего Excel-preview, которые можно отправить в sync.
                        </Text>
                      </Card>
                    </Col>
                  </Row>
                </Card>

                <Row gutter={[16, 16]} align="top">
                  <Col xs={24} xl={9}>
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <Card title="1. Точечные действия по сотруднику">
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Text type="secondary">
                            Выберите сотрудника и папку Sigur. Если нужна новая подпапка, она будет создана во время sync.
                          </Text>
                          <Select
                            showSearch
                            allowClear
                            placeholder="Выберите сотрудника PassDesk"
                            value={employeeIdInput || undefined}
                            options={employeeOptions}
                            loading={employeeOptionsLoading}
                            onSearch={setEmployeeSearch}
                            onChange={(value) => setEmployeeIdInput(value || "")}
                            optionFilterProp="label"
                            filterOption={false}
                            style={{ width: "100%" }}
                          />
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
                        </Space>
                      </Card>

                      <Card title="2. Привязка Sigur ID вручную">
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Text type="secondary">
                            Нужен только для ручной коррекции, если сотрудника нужно связать с уже существующей записью Sigur.
                          </Text>
                          <Input
                            placeholder="externalEmpId (ID сотрудника в Sigur)"
                            value={externalEmpIdInput}
                            onChange={(event) => setExternalEmpIdInput(event.target.value)}
                          />
                          <Space wrap>
                            <Button onClick={handleLoadBinding} loading={bindingLookupLoading}>
                              Загрузить текущую привязку
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
                              Сейчас связан с Sigur ID {bindingInfo.externalEmpId}
                            </Text>
                          ) : (
                            <Text type="secondary">Активная привязка пока не задана</Text>
                          )}
                        </Space>
                      </Card>
                    </Space>
                  </Col>

                  <Col xs={24} xl={15}>
                    <Card title="3. Ручное сопоставление PassDesk ↔ Sigur">
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        <Text type="secondary">
                          Используйте этот сценарий, когда нужно вручную выбрать сотрудника PassDesk и связать его с конкретной записью Sigur.
                        </Text>
                        <Space wrap>
                          <Input
                            placeholder="Поиск PassDesk (ФИО / UUID / ИНН / Sigur ID)"
                            value={localEmployeeSearch}
                            onChange={(event) => setLocalEmployeeSearch(event.target.value)}
                            style={{ width: 320 }}
                          />
                          <Input
                            placeholder="Поиск Sigur (имя / ID / отдел)"
                            value={providerEmployeeSearch}
                            onChange={(event) => setProviderEmployeeSearch(event.target.value)}
                            style={{ width: 280 }}
                          />
                          <Button onClick={loadMappingLists} loading={mappingLoading}>
                            Найти пары
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
                            <Card size="small" title="PassDesk">
                              <Table
                                rowKey="id"
                                size="small"
                                rowSelection={localRowSelection}
                                columns={localEmployeeColumns}
                                dataSource={localEmployees}
                                loading={mappingLoading}
                                pagination={false}
                                scroll={{ x: 700, y: 320 }}
                              />
                            </Card>
                          </Col>
                          <Col xs={24} xl={12}>
                            <Card size="small" title="Sigur">
                              <Table
                                rowKey={(record) => record.id || `sigur-${record.name}`}
                                size="small"
                                rowSelection={providerRowSelection}
                                columns={providerEmployeeColumns}
                                dataSource={providerEmployees}
                                loading={mappingLoading}
                                pagination={false}
                                scroll={{ x: 700, y: 320 }}
                              />
                            </Card>
                          </Col>
                        </Row>
                      </Space>
                    </Card>
                  </Col>
                </Row>

                <Card title="4. Импорт соответствий по пропускам (Excel)">
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
                              title="Новые"
                              value={bindingImportPreview.summary.newPassCount || 0}
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
                                (bindingImportPreview.summary.duplicatePassCount || 0)
                                + (bindingImportPreview.summary.missingPassNumberCount || 0)
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
                      Для работы со считывателем выберите сотрудника, нажмите «Ожидать карту» и приложите карту к программатору.
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
                    <Space wrap>
                      <Button onClick={handleArmCardReader}>
                        {cardReaderArmed ? "Считыватель активен" : "Ожидать карту"}
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
          {
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
          {
            key: "passes",
            label: "Пропуска",
            children: <PassesPage embedded />,
          },
        ]}
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
                <Descriptions.Item label="Sigur ID сотрудника">
                  {eventDetailsExternalEmpId || "—"}
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
