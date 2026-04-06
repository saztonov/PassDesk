import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Card, Empty, Skeleton, Space, Tag, Timeline, Typography } from "antd";
import dayjs from "dayjs";
import auditService from "@/services/auditService";

const { Text } = Typography;
const FETCH_LIMIT = 100;

const EVENT_CATEGORY_META = {
  employee_data: { label: "Карточка", color: "blue" },
  transfer: { label: "Перевод", color: "purple" },
  status: { label: "Статусы", color: "gold" },
  files: { label: "Файлы", color: "cyan" },
  skud: { label: "СКУД", color: "green" },
};

const STATUS_LABELS = {
  employee_transferred: "Перевод сотрудника",
  employee_updated: "Изменены данные сотрудника",
  file_deleted: "Удалён файл",
  file_uploaded: "Загружен файл",
  pass_assigned: "Выдан пропуск",
  pass_unbound: "Пропуск отвязан",
  status_changed: "Изменён статус",
  zup_flag_changed: "Изменён статус выгрузки в ЗУП",
};

const FIELD_LABELS = {
  bankAccountNumber: "Расчётный счёт",
  bankBik: "БИК",
  birthCity: "Город рождения",
  birthCountryId: "Страна рождения",
  birthDate: "Дата рождения",
  birthRegion: "Регион рождения",
  blankNumber: "Номер бланка",
  citizenshipId: "Гражданство",
  constructionSiteId: "Объект",
  email: "Email",
  firstName: "Имя",
  gender: "Пол",
  insurancePolicyDate: "Дата полиса",
  insurancePolicyNumber: "Полис",
  inn: "ИНН",
  kig: "КИГ",
  kigEndDate: "Срок КИГ",
  lastName: "Фамилия",
  middleName: "Отчество",
  notes: "Комментарий",
  passportDate: "Дата паспорта",
  passportExpiryDate: "Срок паспорта",
  passportIssuer: "Кем выдан паспорт",
  passportDepartmentCode: "Код подразделения паспорта",
  passportNumber: "Номер паспорта",
  passportType: "Тип паспорта",
  patentIssueDate: "Дата патента",
  patentNumber: "Номер патента",
  phone: "Телефон",
  positionId: "Должность",
  registrationAddress: "Адрес регистрации",
  snils: "СНИЛС",
};

const STATUS_GROUP_LABELS = {
  status: "Основной статус",
  draft: "Основной статус",
  status_card: "Карточка",
  "card draft": "Карточка",
  status_active: "Активность",
  status_hr: "ЗУП",
  status_secure: "СКУД",
};

const STATUS_NAME_LABELS = {
  status_new: "Новый",
  status_draft: "Черновик",
  status_processed: "Обработан",
  status_tb_passed: "ТБ пройден",
  status_card_draft: "Карточка не заполнена",
  status_card_completed: "Карточка заполнена",
  status_card_processed: "Карточка обработана",
  status_active_employed: "Действующий",
  status_active_fired: "Уволен",
  status_active_fired_compl: "Уволен",
  status_active_inactive: "Неактивен",
  status_hr_new_compl: "Новый для ЗУП",
  status_hr_edited: "Редактирован",
  status_hr_fired_off: "Повторно принят",
  status_secure_allow: "Доступ разрешён",
  status_secure_block: "Доступ заблокирован",
  status_secure_block_compl: "Доступ заблокирован",
};

const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";

const getUserName = (user) => user?.fullName || user?.email || "Система";

const hasOwn = (value, key) =>
  Boolean(value) &&
  typeof value === "object" &&
  Object.prototype.hasOwnProperty.call(value, key);

const resolveChangePair = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      from: null,
      to: null,
    };
  }

  const from =
    (hasOwn(value, "from") ? value.from : undefined) ??
    (hasOwn(value, "old") ? value.old : undefined) ??
    (hasOwn(value, "previous") ? value.previous : undefined) ??
    (hasOwn(value, "oldValue") ? value.oldValue : undefined) ??
    null;
  const to =
    (hasOwn(value, "to") ? value.to : undefined) ??
    (hasOwn(value, "new") ? value.new : undefined) ??
    (hasOwn(value, "next") ? value.next : undefined) ??
    (hasOwn(value, "newValue") ? value.newValue : undefined) ??
    null;

  return { from, to };
};

const collectEmployeeFieldChanges = (details = {}) => {
  const normalizedFieldChanges = new Map();

  Object.entries(details.fieldChanges || {}).forEach(([fieldName, change]) => {
    normalizedFieldChanges.set(fieldName, resolveChangePair(change));
  });

  const oldValues =
    details.oldValues && typeof details.oldValues === "object"
      ? details.oldValues
      : {};
  const newValues =
    details.newValues && typeof details.newValues === "object"
      ? details.newValues
      : {};

  Object.keys({ ...oldValues, ...newValues }).forEach((fieldName) => {
    if (!normalizedFieldChanges.has(fieldName)) {
      normalizedFieldChanges.set(fieldName, {
        from: oldValues[fieldName] ?? null,
        to: newValues[fieldName] ?? null,
      });
    }
  });

  return normalizedFieldChanges;
};

const humanizeFieldName = (fieldName) => FIELD_LABELS[fieldName] || fieldName;

const humanizeStatusName = (statusName) => {
  if (!statusName) {
    return "не задан";
  }

  if (STATUS_NAME_LABELS[statusName]) {
    return STATUS_NAME_LABELS[statusName];
  }

  return String(statusName);
};

const humanizeStatusGroupName = (groupName) => {
  if (!groupName) {
    return "—";
  }

  return STATUS_GROUP_LABELS[groupName] || groupName;
};

const formatFieldValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatFieldValue(item)).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const describeAuditEvent = (record) => {
  const details = record?.details || {};

  switch (record?.eventType) {
    case "employee_updated": {
      const changedFields = [...collectEmployeeFieldChanges(details).keys()];
      const normalizedChangedFields = [...new Set(changedFields)]
        .map(humanizeFieldName)
        .slice(0, 6);

      return normalizedChangedFields.length > 0
        ? `Изменены поля: ${normalizedChangedFields.join(", ")}`
        : "Изменены данные карточки сотрудника";
    }

    case "employee_transferred": {
      const fromNames = Array.isArray(details.fromCounterparties)
        ? details.fromCounterparties.map((item) => item?.name).filter(Boolean)
        : [];
      const toName =
        details.toCounterparty?.name ||
        details.to?.name ||
        details.counterpartyName;

      if (fromNames.length > 0 && toName) {
        return `Перевод: ${fromNames.join(", ")} -> ${toName}`;
      }

      return toName ? `Перевод в ${toName}` : "Перевод между контрагентами";
    }

    case "status_changed": {
      const statusChange = resolveChangePair(details);
      const groupName = humanizeStatusGroupName(details.statusGroup || "status");
      return `${groupName}: ${humanizeStatusName(statusChange.from)} -> ${humanizeStatusName(statusChange.to)}`;
    }

    case "zup_flag_changed": {
      const zupChange = resolveChangePair(details);
      return `Выгрузка в ЗУП: ${zupChange.from ? "Да" : "Нет"} -> ${zupChange.to ? "Да" : "Нет"}`;
    }

    case "file_uploaded": {
      const fileNames = Array.isArray(details.files)
        ? details.files
            .map(
              (file) => file?.documentType || file?.fileName || file?.originalName,
            )
            .filter(Boolean)
        : [];

      return fileNames.length > 0
        ? `Загружены файлы: ${fileNames.join(", ")}`
        : "Загружены файлы сотрудника";
    }

    case "file_deleted":
      return details.fileName
        ? `Удалён файл: ${details.fileName}`
        : "Удалён файл сотрудника";

    case "pass_assigned":
      return details.cardNumber
        ? `Выдан пропуск №${details.cardNumber}`
        : "Выдан пропуск";

    case "pass_unbound":
      return details.cardNumber
        ? `Пропуск №${details.cardNumber} отвязан`
        : "Пропуск отвязан";

    default:
      return STATUS_LABELS[record?.eventType] || record?.action || "Событие журнала";
  }
};

const buildEventDetails = (record) => {
  const details = record?.details || {};

  switch (record?.eventType) {
    case "employee_updated":
      return [...collectEmployeeFieldChanges(details).entries()]
        .slice(0, 6)
        .map(([fieldName, value]) => ({
          label: humanizeFieldName(fieldName),
          value: `${formatFieldValue(value?.from)} -> ${formatFieldValue(value?.to)}`,
        }));

    case "status_changed": {
      const statusChange = resolveChangePair(details);
      return [
        {
          label: "Группа",
          value: humanizeStatusGroupName(details.statusGroup),
        },
        {
          label: "Статус",
          value: `${humanizeStatusName(statusChange.from)} -> ${humanizeStatusName(statusChange.to)}`,
        },
      ];
    }

    case "zup_flag_changed": {
      const zupChange = resolveChangePair(details);
      return [
        {
          label: "Выгрузка в ЗУП",
          value: `${zupChange.from ? "Да" : "Нет"} -> ${zupChange.to ? "Да" : "Нет"}`,
        },
      ];
    }

    default:
      return [];
  }
};

const EmployeeChangeHistoryTab = ({ employeeId, compact = false }) => {
  const { message } = App.useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!employeeId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setForbidden(false);

    try {
      const response = await auditService.getEmployeeHistory(employeeId, {
        page: 1,
        limit: FETCH_LIMIT,
      });
      setLogs(response?.data?.data?.logs || []);
    } catch (error) {
      if (error?.response?.status === 403) {
        setForbidden(true);
        setLogs([]);
      } else {
        message.error(
          error?.response?.data?.message || "Не удалось загрузить историю изменений",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId, message]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const timelineItems = useMemo(
    () =>
      logs.map((log) => {
        const categoryMeta = EVENT_CATEGORY_META[log.eventCategory] || null;
        const detailsRows = buildEventDetails(log);
        const normalizedDetailsRows = compact ? detailsRows.slice(0, 3) : detailsRows;

        return {
          color: categoryMeta?.color || "blue",
          label: compact
            ? null
            : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatDateTime(log.createdAt)}
              </Text>
            ),
          children: (
            <Card
              size="small"
              style={{
                marginBottom: compact ? 8 : 12,
                borderRadius: 10,
                background: compact ? "#fff" : "#fafafa",
              }}
              bodyStyle={{ padding: compact ? "8px 10px" : "10px 12px" }}
            >
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {compact ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {formatDateTime(log.createdAt)}
                  </Text>
                ) : null}
                <Space size={8} wrap>
                  {categoryMeta ? <Tag color={categoryMeta.color}>{categoryMeta.label}</Tag> : null}
                  <Text strong>{STATUS_LABELS[log.eventType] || log.action}</Text>
                </Space>
                <Text style={compact ? { fontSize: 13 } : undefined}>{describeAuditEvent(log)}</Text>
                {normalizedDetailsRows.length > 0 ? (
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    {normalizedDetailsRows.map((row) => (
                      <Text key={`${log.id}:${row.label}`} type="secondary" style={{ fontSize: 12 }}>
                        {row.label}: {row.value}
                      </Text>
                    ))}
                  </Space>
                ) : null}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Изменил: {getUserName(log.user)}
                </Text>
              </Space>
            </Card>
          ),
        };
      }),
    [compact, logs],
  );

  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (forbidden) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Нет прав на просмотр истории изменений"
      />
    );
  }

  if (logs.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="История изменений пока отсутствует"
      />
    );
  }

  if (compact) {
    return <Timeline items={timelineItems} />;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Text type="secondary">Событий: {logs.length}</Text>
      <Timeline mode="left" items={timelineItems} />
    </Space>
  );
};

export default EmployeeChangeHistoryTab;
