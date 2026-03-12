import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Drawer,
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
  documentType === "employee_card"
    ? "Карточка сотрудника"
    :
  DOCUMENT_LABELS[documentType] || documentType || "Документ";

const toResponseData = (response) => response?.data || response || {};

const formatValue = (value) => {
  const normalized = String(value || "").trim();
  return normalized || "—";
};

const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";

const buildValuePreview = (sources = []) => {
  const uniqueValues = [
    ...new Set(sources.map((item) => formatValue(item.value)).filter(Boolean)),
  ];

  if (uniqueValues.length <= 2) {
    return uniqueValues.join(" / ");
  }

  return `${uniqueValues.slice(0, 2).join(" / ")} ...`;
};

const buildSourcesSignature = (sources = []) =>
  sources
    .map((source) => `${source.documentType || "unknown"}:${source.fileId || "none"}`)
    .sort()
    .join("|");

const buildFieldPreview = (fields = []) => {
  const labels = [...new Set(fields.map((item) => item.fieldLabel).filter(Boolean))];

  if (labels.length <= 2) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
};

const buildGroupedValuePreview = (fields = []) => {
  const previews = fields
    .slice(0, 2)
    .map((item) => `${item.fieldLabel}: ${buildValuePreview(item.sources || [])}`);

  if (fields.length <= 2) {
    return previews.join(" | ");
  }

  return `${previews.join(" | ")} | еще ${fields.length - 2}`;
};

const groupConflictItems = (items = []) => {
  const grouped = new Map();

  items.forEach((item) => {
    const employeeId = item.employee?.id || "unknown-employee";
    const signature = [
      item.type || "unknown",
      employeeId,
      buildSourcesSignature(item.sources || []),
    ].join("::");

    const existing = grouped.get(signature);
    const fieldEntry = {
      id: item.id,
      type: item.type,
      fieldName: item.fieldName,
      fieldLabel: item.fieldLabel,
      createdAt: item.createdAt,
      sources: item.sources || [],
    };

    if (existing) {
      existing.fields.push(fieldEntry);
      if (dayjs(item.createdAt).isAfter(dayjs(existing.createdAt))) {
        existing.createdAt = item.createdAt;
      }
      return;
    }

    grouped.set(signature, {
      id: signature,
      type: item.type,
      createdAt: item.createdAt,
      employee: item.employee,
      sources: item.sources || [],
      fields: [fieldEntry],
    });
  });

  return [...grouped.values()].sort(
    (left, right) => dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf(),
  );
};

const OcrConflictsAdminSection = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState(null);
  const [actionLoadingKey, setActionLoadingKey] = useState(null);
  const [tableState, setTableState] = useState({
    items: [],
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      pages: 0,
    },
  });

  const loadData = useCallback(
    async ({ page = 1, limit = tableState.pagination.limit } = {}) => {
      setLoading(true);
      try {
        const response = await ocrService.getConflicts({
          page,
          limit,
        });
        const payload = toResponseData(response);
        const groupedItems = groupConflictItems(
          Array.isArray(payload.items) ? payload.items : [],
        );
        setTableState({
          items: groupedItems,
          pagination: payload.pagination || {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        });
      } catch (error) {
        console.error("Failed to load OCR discrepancies:", error);
        message.error("Не удалось загрузить OCR-сводку по документам");
      } finally {
        setLoading(false);
      }
    },
    [message, tableState.pagination.limit],
  );

  useEffect(() => {
    loadData({ page: 1 });
  }, [loadData]);

  const updateDrawerAfterResolve = useCallback((resolvedFieldIds = []) => {
    if (!Array.isArray(resolvedFieldIds) || resolvedFieldIds.length === 0) {
      return;
    }

    setDrawerRecord((prev) => {
      if (!prev) {
        return prev;
      }

      const remainingFields = (prev.fields || []).filter(
        (field) => !resolvedFieldIds.includes(field.id),
      );

      if (remainingFields.length === 0) {
        return null;
      }

      return {
        ...prev,
        fields: remainingFields,
      };
    });
  }, []);

  const handleFieldResolution = useCallback(
    async (field, action) => {
      if (!field?.id || field.type !== "employee_vs_ocr") {
        return;
      }

      const loadingKey = `${action}:${field.id}`;
      setActionLoadingKey(loadingKey);
      try {
        if (action === "apply") {
          await ocrService.applyConflict(field.id);
          message.success("Значение OCR применено");
        } else {
          await ocrService.resolveConflict(field.id);
          message.success("Оставили значение карточки");
        }

        updateDrawerAfterResolve([field.id]);
        await loadData({
          page: tableState.pagination.page,
          limit: tableState.pagination.limit,
        });
      } catch (error) {
        console.error("Failed to resolve OCR conflict:", error);
        message.error("Не удалось обработать OCR-расхождение");
      } finally {
        setActionLoadingKey(null);
      }
    },
    [
      loadData,
      message,
      tableState.pagination.limit,
      tableState.pagination.page,
      updateDrawerAfterResolve,
    ],
  );

  const handleBulkResolution = useCallback(
    async (action) => {
      const eligibleFields = (drawerRecord?.fields || []).filter(
        (field) => field.type === "employee_vs_ocr" && field.id,
      );

      if (eligibleFields.length === 0) {
        return;
      }

      const loadingKey = action === "apply" ? "bulk-apply" : "bulk-resolve";
      setActionLoadingKey(loadingKey);
      try {
        if (action === "apply") {
          await Promise.all(eligibleFields.map((field) => ocrService.applyConflict(field.id)));
          message.success("Все OCR-значения применены");
        } else {
          await Promise.all(eligibleFields.map((field) => ocrService.resolveConflict(field.id)));
          message.success("Все значения карточки сохранены");
        }

        setDrawerRecord(null);
        await loadData({
          page: tableState.pagination.page,
          limit: tableState.pagination.limit,
        });
      } catch (error) {
        console.error("Failed to resolve OCR conflicts in bulk:", error);
        message.error("Не удалось обработать все OCR-расхождения");
      } finally {
        setActionLoadingKey(null);
      }
    },
    [drawerRecord, loadData, message, tableState.pagination.limit, tableState.pagination.page],
  );

  const columns = useMemo(
    () => [
      {
        title: "Когда",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 150,
        render: (value) => formatDateTime(value),
      },
      {
        title: "Сотрудник",
        key: "employee",
        width: 240,
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
        title: "Поля",
        key: "fields",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{buildFieldPreview(record.fields || []) || "—"}</Text>
            <Text type="secondary">
              {`Расхождений: ${(record.fields || []).length}`}
            </Text>
          </Space>
        ),
      },
      {
        title: "Документы",
        key: "sources",
        width: 280,
        render: (_, record) => (
          <Space wrap size={[6, 6]}>
            {(record.sources || []).map((source) => (
              <Tag key={`${record.id}-${source.fileId || source.documentType}`}>
                {getDocumentLabel(source.documentType)}
              </Tag>
            ))}
          </Space>
        ),
      },
      {
        title: "Значения",
        key: "values",
        render: (_, record) => buildGroupedValuePreview(record.fields || []),
      },
      {
        title: "Подробно",
        key: "actions",
        width: 140,
        render: (_, record) => (
          <Button size="small" onClick={() => setDrawerRecord(record)}>
            Смотреть
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", padding: 16 }}>
      <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
        <Space direction="vertical" size={0}>
          <Text strong>Проверка ФИО по OCR-документам</Text>
          <Text type="secondary">
            Таблица показывает расхождения OCR с карточкой сотрудника и между
            документами: паспорт, перевод, ИНН, СНИЛС, КИГ, патент, банковские
            реквизиты.
          </Text>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
          Обновить
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={tableState.items}
        locale={{
          emptyText:
            "OCR-расхождений пока нет: ни с карточкой сотрудника, ни между документами.",
        }}
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
          });
        }}
        scroll={{ x: 1100 }}
      />

      <Drawer
        open={Boolean(drawerRecord)}
        title="Источники расхождения"
        width={560}
        onClose={() => setDrawerRecord(null)}
        destroyOnClose
      >
        {drawerRecord ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Space direction="vertical" size={2}>
              <Text strong>{drawerRecord.employee?.fullName || "—"}</Text>
              <Text type="secondary">
                {drawerRecord.employee?.counterpartyName || "—"}
              </Text>
            </Space>

            <Space wrap>
              <Tag color="orange">
                {`Полей с расхождениями: ${(drawerRecord.fields || []).length}`}
              </Tag>
              <Tag>{(drawerRecord.sources || []).length} источника(ов)</Tag>
            </Space>

            <Text type="secondary">
              Последняя проверка: {formatDateTime(drawerRecord.createdAt)}
            </Text>

            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {(drawerRecord.fields || []).map((field) => (
                <div
                  key={`${drawerRecord.id}-${field.id}`}
                  style={{
                    padding: 12,
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    background: "#fafafa",
                  }}
                >
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Space
                      style={{ width: "100%", justifyContent: "space-between" }}
                      wrap
                    >
                      <Text strong>{field.fieldLabel || "—"}</Text>
                      {field.type === "employee_vs_ocr" ? (
                        <Space>
                          <Button
                            size="small"
                            loading={actionLoadingKey === `resolve:${field.id}`}
                            onClick={() => handleFieldResolution(field, "resolve")}
                          >
                            Оставить карточку
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            loading={actionLoadingKey === `apply:${field.id}`}
                            onClick={() => handleFieldResolution(field, "apply")}
                          >
                            Принять OCR
                          </Button>
                        </Space>
                      ) : (
                        <Tag>Только уведомление</Tag>
                      )}
                    </Space>
                    {(field.sources || []).map((source) => (
                      <div
                        key={`${field.id}-${source.fileId || source.documentType}`}
                        style={{
                          padding: 10,
                          border: "1px solid #f0f0f0",
                          borderRadius: 8,
                          background: "#fff",
                        }}
                      >
                        <Space direction="vertical" size={6} style={{ width: "100%" }}>
                          <Space wrap>
                            <Tag color="gold">{getDocumentLabel(source.documentType)}</Tag>
                            <Text type="secondary">{source.fileName || "—"}</Text>
                          </Space>
                          <div>
                            <Text type="secondary">Значение</Text>
                            <div>{formatValue(source.value)}</div>
                          </div>
                          <Text type="secondary">
                            OCR подтвержден: {formatDateTime(source.createdAt)}
                          </Text>
                        </Space>
                      </div>
                    ))}
                  </Space>
                </div>
              ))}
            </Space>

            {drawerRecord.type === "employee_vs_ocr" ? (
              <Space
                style={{ width: "100%", justifyContent: "flex-end" }}
                wrap
              >
                <Button
                  loading={actionLoadingKey === "bulk-resolve"}
                  onClick={() => handleBulkResolution("resolve")}
                >
                  Оставить карточку для всех
                </Button>
                <Button
                  type="primary"
                  loading={actionLoadingKey === "bulk-apply"}
                  onClick={() => handleBulkResolution("apply")}
                >
                  Принять OCR для всех
                </Button>
              </Space>
            ) : (
              <Text type="secondary">
                Это уведомление: исправление ФИО должно происходить в карточке
                сотрудника и/или в самих документах, а не через принятие OCR здесь.
              </Text>
            )}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
};

export default OcrConflictsAdminSection;
