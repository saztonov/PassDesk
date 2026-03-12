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

const OcrConflictsAdminSection = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
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

  const loadData = useCallback(
    async ({ page = 1, limit = tableState.pagination.limit } = {}) => {
      setLoading(true);
      try {
        const response = await ocrService.getConflicts({
          page,
          limit,
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
        title: "Поле",
        dataIndex: "fieldLabel",
        key: "fieldLabel",
        width: 150,
        render: (value) => <Text strong>{value || "—"}</Text>,
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
        render: (_, record) => buildValuePreview(record.sources || []),
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
            Таблица показывает расхождения ФИО между паспортом, переводом,
            ИНН, СНИЛС, КИГ, патентом и банковскими реквизитами.
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
              <Tag color="orange">{drawerRecord.fieldLabel || "—"}</Tag>
              <Tag>{(drawerRecord.sources || []).length} источника(ов)</Tag>
            </Space>

            <Text type="secondary">
              Последняя проверка: {formatDateTime(drawerRecord.createdAt)}
            </Text>

            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {(drawerRecord.sources || []).map((source) => (
                <div
                  key={`${drawerRecord.id}-${source.fileId || source.documentType}`}
                  style={{
                    padding: 12,
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    background: "#fafafa",
                  }}
                >
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Space wrap>
                      <Tag color="gold">{getDocumentLabel(source.documentType)}</Tag>
                      <Text type="secondary">{source.fileName || "—"}</Text>
                    </Space>
                    <div>
                      <Text type="secondary">Значение в документе</Text>
                      <div>{formatValue(source.value)}</div>
                    </div>
                    <Text type="secondary">
                      OCR подтвержден: {formatDateTime(source.createdAt)}
                    </Text>
                  </Space>
                </div>
              ))}
            </Space>

            <Text type="secondary">
              Это уведомление: исправление ФИО должно происходить в карточке
              сотрудника и/или в самих документах, а не через принятие OCR здесь.
            </Text>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
};

export default OcrConflictsAdminSection;
