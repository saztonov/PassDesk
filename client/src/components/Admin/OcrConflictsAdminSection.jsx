import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Drawer,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import ocrService from "@/services/ocrService";
import { DEFAULT_DOCUMENT_TYPES } from "@/modules/employees/lib/documentTypeUploaderUtils";

const { Text } = Typography;

const DOCUMENT_LABELS = DEFAULT_DOCUMENT_TYPES.reduce((accumulator, item) => {
  accumulator[item.value] = item.label;
  return accumulator;
}, {});

const getDocumentLabel = (documentType) =>
  DOCUMENT_LABELS[documentType] || documentType || "Документ";

const toResponseData = (response) => response?.data || response || {};

const formatValue = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "—";
  }

  const parsedDate = dayjs(normalized);
  if (
    parsedDate.isValid() &&
    (/^\d{4}-\d{2}-\d{2}/.test(normalized) || normalized.includes("T"))
  ) {
    return parsedDate.format("DD.MM.YYYY");
  }

  return normalized;
};

const buildConflictGroupKey = (item) =>
  [
    item.employee?.id || "employee",
    item.file?.id || "file",
    item.status || "status",
  ].join(":");

const groupConflictItems = (items = []) => {
  const groups = new Map();

  items.forEach((item) => {
    const groupKey = buildConflictGroupKey(item);
    const currentGroup = groups.get(groupKey);

    if (!currentGroup) {
      groups.set(groupKey, {
        key: groupKey,
        createdAt: item.createdAt,
        documentType: item.documentType,
        employee: item.employee,
        file: item.file,
        status: item.status,
        conflictIds: [item.id],
        conflicts: [
          {
            id: item.id,
            fieldName: item.fieldName,
            fieldLabel: item.fieldLabel,
            currentValue: item.currentValue,
            ocrValue: item.ocrValue,
          },
        ],
      });
      return;
    }

    currentGroup.conflictIds.push(item.id);
    currentGroup.conflicts.push({
      id: item.id,
      fieldName: item.fieldName,
      fieldLabel: item.fieldLabel,
      currentValue: item.currentValue,
      ocrValue: item.ocrValue,
    });

    if (
      item.createdAt &&
      (!currentGroup.createdAt ||
        dayjs(item.createdAt).isAfter(dayjs(currentGroup.createdAt)))
    ) {
      currentGroup.createdAt = item.createdAt;
    }
  });

  return Array.from(groups.values()).sort((left, right) => {
    const leftTimestamp = left.createdAt ? dayjs(left.createdAt).valueOf() : 0;
    const rightTimestamp = right.createdAt ? dayjs(right.createdAt).valueOf() : 0;
    return rightTimestamp - leftTimestamp;
  });
};

const ConflictDrawer = ({
  record,
  open,
  onClose,
  onResolve,
  onApply,
  resolvingKey,
  applyingKey,
}) => (
  <Drawer
    open={open}
    title="Расхождения OCR"
    width={560}
    onClose={onClose}
    destroyOnClose
  >
    {record ? (
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space direction="vertical" size={2}>
          <Text strong>{record.employee?.fullName || "—"}</Text>
          <Text type="secondary">{record.employee?.counterpartyName || "—"}</Text>
        </Space>

        <Space wrap>
          <Tag color="gold">
            {getDocumentLabel(record.documentType || record.file?.documentType)}
          </Tag>
          <Tag color={record.status === "resolved" ? "green" : "orange"}>
            {record.status === "resolved" ? "Решен" : "Требует решения"}
          </Tag>
        </Space>

        <Space direction="vertical" size={2}>
          <Text type="secondary">
            Файл: {record.file?.originalName || record.file?.fileName || "—"}
          </Text>
          <Text type="secondary">
            Когда:{" "}
            {record.createdAt
              ? dayjs(record.createdAt).format("DD.MM.YYYY HH:mm")
              : "—"}
          </Text>
          <Text type="secondary">Расхождений: {record.conflicts.length}</Text>
        </Space>

        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {record.conflicts.map((item) => (
            <div
              key={item.id}
              style={{
                padding: 12,
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text strong>{item.fieldLabel || item.fieldName || "—"}</Text>
                <div>
                  <Text type="secondary">В карточке</Text>
                  <div>{formatValue(item.currentValue)}</div>
                </div>
                <div>
                  <Text type="secondary">OCR</Text>
                  <div>{formatValue(item.ocrValue)}</div>
                </div>
              </Space>
            </div>
          ))}
        </Space>

        {record.status === "open" ? (
          <Space wrap>
            <Button
              loading={resolvingKey === record.key}
              onClick={() => onResolve(record)}
            >
              Оставить карточку
            </Button>
            <Button
              type="primary"
              loading={applyingKey === record.key}
              onClick={() => onApply(record)}
            >
              Принять OCR
            </Button>
          </Space>
        ) : null}
      </Space>
    ) : null}
  </Drawer>
);

const OcrConflictsAdminSection = () => {
  const { message } = App.useApp();
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState(null);
  const [applyingKey, setApplyingKey] = useState(null);
  const [drawerRecord, setDrawerRecord] = useState(null);
  const [tableState, setTableState] = useState({
    items: [],
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      pages: 0,
    },
  });

  const groupedItems = useMemo(
    () => groupConflictItems(tableState.items),
    [tableState.items],
  );

  const closeDrawer = useCallback(() => {
    setDrawerRecord(null);
  }, []);

  const openDrawer = useCallback((record) => {
    setDrawerRecord(record);
  }, []);

  const loadData = useCallback(
    async ({
      page = 1,
      limit = tableState.pagination.limit,
      status = statusFilter,
    } = {}) => {
      setLoading(true);
      try {
        const response = await ocrService.getConflicts({
          page,
          limit,
          status,
        });
        const payload = toResponseData(response);
        setTableState({
          items: Array.isArray(payload.items) ? payload.items : [],
          pagination: payload.pagination || {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        });
      } catch (error) {
        console.error("Failed to load OCR conflicts:", error);
        message.error("Не удалось загрузить OCR-расхождения");
      } finally {
        setLoading(false);
      }
    },
    [message, statusFilter, tableState.pagination.limit],
  );

  useEffect(() => {
    loadData({ page: 1, status: statusFilter });
  }, [loadData, statusFilter]);

  const handleResolve = useCallback(
    async (record) => {
      setResolvingKey(record.key);
      try {
        await Promise.all(
          record.conflictIds.map((id) => ocrService.resolveConflict(id)),
        );
        closeDrawer();
        message.success(
          `Карточка оставлена без изменений, закрыто расхождений: ${record.conflictIds.length}`,
        );
        await loadData({
          page: tableState.pagination.page,
          limit: tableState.pagination.limit,
          status: statusFilter,
        });
      } catch (error) {
        console.error("Failed to resolve OCR conflict:", error);
        message.error("Не удалось обновить статус конфликта");
      } finally {
        setResolvingKey(null);
      }
    },
    [
      closeDrawer,
      loadData,
      message,
      statusFilter,
      tableState.pagination.limit,
      tableState.pagination.page,
    ],
  );

  const handleApply = useCallback(
    async (record) => {
      setApplyingKey(record.key);
      try {
        await Promise.all(
          record.conflictIds.map((id) => ocrService.applyConflict(id)),
        );
        closeDrawer();
        message.success(
          `OCR применен к карточке, закрыто расхождений: ${record.conflictIds.length}`,
        );
        await loadData({
          page: tableState.pagination.page,
          limit: tableState.pagination.limit,
          status: statusFilter,
        });
      } catch (error) {
        console.error("Failed to apply OCR conflict:", error);
        message.error("Не удалось применить OCR к карточке");
      } finally {
        setApplyingKey(null);
      }
    },
    [
      closeDrawer,
      loadData,
      message,
      statusFilter,
      tableState.pagination.limit,
      tableState.pagination.page,
    ],
  );

  const columns = useMemo(
    () => [
      {
        title: "Когда",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 150,
        render: (value) =>
          value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—",
      },
      {
        title: "Сотрудник",
        key: "employee",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{record.employee?.fullName || "—"}</Text>
            <Text type="secondary">
              {record.employee?.counterpartyName || "—"}
            </Text>
          </Space>
        ),
      },
      {
        title: "Документ",
        key: "document",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Tag color="gold">
              {getDocumentLabel(record.documentType || record.file?.documentType)}
            </Tag>
            <Text type="secondary">
              {record.file?.originalName || record.file?.fileName || "—"}
            </Text>
            <Text type="secondary">Расхождений: {record.conflicts.length}</Text>
          </Space>
        ),
      },
      {
        title: "Конфликты",
        key: "conflicts",
        width: 150,
        render: (_, record) => (
          <Button size="small" onClick={() => openDrawer(record)}>
            Смотреть ({record.conflicts.length})
          </Button>
        ),
      },
      {
        title: "Статус",
        dataIndex: "status",
        key: "status",
        width: 160,
        render: (value, record) =>
          value === "resolved" ? (
            <Tag color="green">Решен</Tag>
          ) : (
            <Tag color="orange">Требует решения: {record.conflicts.length}</Tag>
          ),
      },
      {
        title: "Действие",
        key: "actions",
        width: 260,
        render: (_, record) =>
          record.status === "open" ? (
            <Space wrap>
              <Button
                size="small"
                loading={resolvingKey === record.key}
                onClick={() => handleResolve(record)}
              >
                Оставить карточку
              </Button>
              <Button
                size="small"
                type="primary"
                loading={applyingKey === record.key}
                onClick={() => handleApply(record)}
              >
                Принять OCR
              </Button>
            </Space>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
    ],
    [applyingKey, handleApply, handleResolve, openDrawer, resolvingKey],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
      <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
        <Space direction="vertical" size={0}>
          <Text strong>OCR-расхождения</Text>
          <Text type="secondary">
            Отдельный реестр конфликтов между карточкой сотрудника и распознанными документами.
          </Text>
        </Space>
        <Space>
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "Открытые", value: "open" },
              { label: "Просмотренные", value: "resolved" },
              { label: "Все", value: "all" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
            Обновить
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="key"
        loading={loading}
        columns={columns}
        dataSource={groupedItems}
        pagination={{
          current: tableState.pagination.page,
          pageSize: tableState.pagination.limit,
          total: tableState.pagination.total,
          showSizeChanger: true,
        }}
        onChange={(pagination) => {
          loadData({
            page: pagination.current,
            limit: pagination.pageSize,
            status: statusFilter,
          });
        }}
        scroll={{ x: 1000 }}
      />

      <ConflictDrawer
        record={drawerRecord}
        open={Boolean(drawerRecord)}
        onClose={closeDrawer}
        onResolve={handleResolve}
        onApply={handleApply}
        resolvingKey={resolvingKey}
        applyingKey={applyingKey}
      />
    </Space>
  );
};

export default OcrConflictsAdminSection;
