import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileZipOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { employeeService } from "@/services/employeeService";
import { counterpartyService } from "@/services/counterpartyService";
import { usePageTitle } from "@/hooks/usePageTitle";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const STATUS_OPTIONS = [
  { value: "uploaded", label: "Загружен" },
  { value: "not_uploaded", label: "Не загружен" },
  { value: "expiring", label: "Срок истекает" },
];

const statusColorMap = {
  uploaded: "blue",
  not_uploaded: "default",
  expiring: "orange",
};

const statusLabelMap = {
  uploaded: "Загружен",
  not_uploaded: "Не загружен",
  expiring: "Срок истекает",
};

const normalizeDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ru-RU");
};

const extractFileName = (contentDisposition, fallback) => {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }
  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i);
  return plainMatch?.[1] || fallback;
};

const saveBlobResponse = (response, fallbackName) => {
  const fileName = extractFileName(
    response.headers?.["content-disposition"],
    fallbackName,
  );
  const blob = response.data;
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const CounterpartyDocumentsPage = () => {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  usePageTitle("Документы контрагента", isMobile);

  const [tableLoading, setTableLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);

  const [counterparties, setCounterparties] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);

  const [counterpartyId, setCounterpartyId] = useState(undefined);
  const [documentType, setDocumentType] = useState(undefined);
  const [status, setStatus] = useState(undefined);
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
  });
  const [detailsGroupKey, setDetailsGroupKey] = useState(null);
  const [selectedEmployeeKeys, setSelectedEmployeeKeys] = useState([]);

  const currentFilters = useMemo(
    () => ({
      counterpartyId,
      documentType,
      status,
      employeeSearch,
    }),
    [counterpartyId, documentType, status, employeeSearch],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map();

    items.forEach((item) => {
      const key = `${item.employeeId}::${item.counterpartyId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          employeeId: item.employeeId,
          employeeFullName: item.employeeFullName,
          counterpartyId: item.counterpartyId,
          counterpartyName: item.counterpartyName,
          documents: [],
        });
      }
      groups.get(key).documents.push(item);
    });

    return Array.from(groups.values()).map((group) => {
      const stats = group.documents.reduce(
        (acc, doc) => {
          const effectiveStatus = doc.fileId ? doc.status : "not_uploaded";
          acc.total += 1;
          acc.byStatus[effectiveStatus] =
            (acc.byStatus[effectiveStatus] || 0) + 1;
          return acc;
        },
        {
          total: 0,
          byStatus: {
            uploaded: 0,
            not_uploaded: 0,
            expiring: 0,
          },
        },
      );

      return {
        ...group,
        stats,
      };
    });
  }, [items]);

  const selectedDetailsGroup = useMemo(
    () => groupedItems.find((item) => item.key === detailsGroupKey) || null,
    [groupedItems, detailsGroupKey],
  );

  const selectedEmployeeIds = useMemo(
    () =>
      groupedItems
        .filter((item) => selectedEmployeeKeys.includes(item.key))
        .map((item) => item.employeeId),
    [groupedItems, selectedEmployeeKeys],
  );

  useEffect(() => {
    setSelectedEmployeeKeys((prev) =>
      prev.filter((key) => groupedItems.some((item) => item.key === key)),
    );
  }, [groupedItems]);

  const exportFilters = useMemo(
    () => ({
      ...currentFilters,
      ...(selectedEmployeeIds.length > 0
        ? { employeeIds: selectedEmployeeIds.join(",") }
        : {}),
    }),
    [currentFilters, selectedEmployeeIds],
  );

  const loadReferences = useCallback(async () => {
    try {
      const [counterpartyResponse, documentTypesResponse] = await Promise.all([
        counterpartyService.getAvailable(),
        employeeService.getDocumentTypes(),
      ]);

      const availableCounterparties = counterpartyResponse?.data?.data || [];
      const availableDocumentTypes = documentTypesResponse?.data || [];

      setCounterparties(availableCounterparties);
      setDocumentTypes(availableDocumentTypes);

      if (availableCounterparties.length === 1) {
        setCounterpartyId(availableCounterparties[0].id);
      }
    } catch (error) {
      console.error("Error loading references for documents table:", error);
      message.error(
        error?.response?.data?.message || "Ошибка загрузки фильтров",
      );
    }
  }, [message]);

  const loadTableData = useCallback(
    async ({ page = pagination.page, limit = pagination.limit } = {}) => {
      try {
        setTableLoading(true);
        const response = await employeeService.getDocumentsTable({
          page,
          limit,
          ...currentFilters,
        });
        const data = response?.data || {};
        const nextItems = data?.items || [];
        const nextPagination = data?.pagination || {};
        setItems(nextItems);
        setPagination({
          page: nextPagination.page || page,
          limit: nextPagination.limit || limit,
          total: nextPagination.total || 0,
        });
      } catch (error) {
        console.error("Error loading documents table:", error);
        message.error(
          error?.response?.data?.message ||
            "Ошибка загрузки таблицы документов",
        );
      } finally {
        setTableLoading(false);
      }
    },
    [currentFilters, message, pagination.limit, pagination.page],
  );

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    loadTableData({ page: 1, limit: pagination.limit });
  }, [
    counterpartyId,
    documentType,
    status,
    employeeSearch,
    loadTableData,
    pagination.limit,
  ]);

  const handleSearchApply = () => {
    setEmployeeSearch(employeeSearchInput.trim());
  };

  const handleResetFilters = () => {
    setCounterpartyId(undefined);
    setDocumentType(undefined);
    setStatus(undefined);
    setEmployeeSearchInput("");
    setEmployeeSearch("");
    setDetailsGroupKey(null);
    setSelectedEmployeeKeys([]);
  };

  const handleDownloadDocument = async (row) => {
    if (!row?.fileId || !row?.employeeId) {
      message.warning("Для этой строки документ не загружен");
      return;
    }
    try {
      const response = await employeeService.getFileDownloadLink(
        row.employeeId,
        row.fileId,
      );
      const downloadUrl = response?.data?.downloadUrl;
      if (!downloadUrl) {
        throw new Error("Download URL missing");
      }
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Error downloading employee document:", error);
      message.error(
        error?.response?.data?.message || "Ошибка скачивания файла",
      );
    }
  };

  const handleDeleteDocument = async (row) => {
    if (!row?.fileId || !row?.employeeId) return;
    try {
      setDeleteLoadingId(row.fileId);
      await employeeService.deleteFile(row.employeeId, row.fileId);
      message.success("Файл удален");
      await loadTableData();
    } catch (error) {
      console.error("Error deleting employee document:", error);
      message.error(error?.response?.data?.message || "Ошибка удаления файла");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleDownloadZip = async () => {
    try {
      setZipLoading(true);
      const response =
        await employeeService.downloadDocumentsZip(exportFilters);
      saveBlobResponse(response, "counterparty_documents.zip");
      message.success("Архив сформирован");
    } catch (error) {
      console.error("Error exporting documents zip:", error);
      message.error(
        error?.response?.data?.message || "Ошибка выгрузки архива ZIP",
      );
    } finally {
      setZipLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExcelLoading(true);
      const response =
        await employeeService.exportDocumentsExcel(exportFilters);
      saveBlobResponse(response, "counterparty_documents.xlsx");
      message.success("Excel сформирован");
    } catch (error) {
      console.error("Error exporting documents excel:", error);
      message.error(
        error?.response?.data?.message || "Ошибка выгрузки таблицы Excel",
      );
    } finally {
      setExcelLoading(false);
    }
  };

  const columns = [
    {
      title: "ФИО сотрудника",
      dataIndex: "employeeFullName",
      key: "employeeFullName",
      width: 220,
      render: (value) => value || "-",
    },
    {
      title: "Контрагент",
      dataIndex: "counterpartyName",
      key: "counterpartyName",
      width: 200,
      render: (value) => value || "-",
    },
    {
      title: "Документы",
      key: "documentsSummary",
      width: 320,
      render: (_, row) => (
        <Space size={[4, 8]} wrap>
          <Tag color="blue">Всего: {row.stats.total}</Tag>
          <Tag color="orange">Истекает: {row.stats.byStatus.expiring || 0}</Tag>
          <Tag>Не загружено: {row.stats.byStatus.not_uploaded || 0}</Tag>
        </Space>
      ),
    },
    {
      title: "Детали",
      key: "actions",
      width: 180,
      render: (_, row) => (
        <Button
          size="small"
          type="primary"
          icon={<SearchOutlined />}
          onClick={() => setDetailsGroupKey(row.key)}
        >
          Документы ({row.stats.total})
        </Button>
      ),
    },
  ];

  const detailsColumns = [
    {
      title: "Тип документа",
      key: "documentType",
      width: 240,
      render: (_, row) => (
        <Space size={8}>
          <span>{row.documentTypeName || row.documentType || "-"}</span>
          {row.isRequired && <Tag color="red">Обяз.</Tag>}
        </Space>
      ),
    },
    {
      title: "Серия/Номер",
      dataIndex: "seriesNumber",
      key: "seriesNumber",
      width: 170,
      render: (value) => value || "-",
    },
    {
      title: "Дата выдачи",
      dataIndex: "issueDate",
      key: "issueDate",
      width: 140,
      render: (value) => normalizeDate(value),
    },
    {
      title: "Срок действия",
      dataIndex: "expiryDate",
      key: "expiryDate",
      width: 140,
      render: (value) => normalizeDate(value),
    },
    {
      title: "Статус",
      dataIndex: "statusLabel",
      key: "status",
      width: 150,
      render: (_, row) => {
        const effectiveStatus = row.fileId ? row.status : "not_uploaded";
        const effectiveLabel = row.fileId
          ? row.statusLabel || statusLabelMap[row.status] || row.status
          : statusLabelMap.not_uploaded;
        return (
          <Tag color={statusColorMap[effectiveStatus] || "default"}>
            {effectiveLabel}
          </Tag>
        );
      },
    },
    {
      title: "Действия",
      key: "actions",
      width: 180,
      fixed: "right",
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!row.fileId}
            onClick={() => handleDownloadDocument(row)}
          >
            Скачать
          </Button>
          <Popconfirm
            title="Удалить документ?"
            description="Файл будет удален без возможности восстановления"
            okText="Удалить"
            cancelText="Отмена"
            onConfirm={() => handleDeleteDocument(row)}
            disabled={!row.fileId}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!row.fileId}
              loading={Boolean(row.fileId) && deleteLoadingId === row.fileId}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space
        direction="vertical"
        size={16}
        style={{ width: "100%", minHeight: 0 }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Документы контрагента
          </Title>
          <Text type="secondary">
            Централизованный просмотр документов сотрудников с фильтрацией,
            выгрузкой и управлением файлами
          </Text>
        </div>

        <Card size="small">
          <Row gutter={[12, 12]} align="bottom">
            <Col xs={24} md={12} lg={6}>
              <Text type="secondary">Контрагент</Text>
              <Select
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Все контрагенты"
                allowClear
                showSearch
                optionFilterProp="label"
                value={counterpartyId}
                onChange={setCounterpartyId}
                options={counterparties.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Text type="secondary">Тип документа</Text>
              <Select
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Все типы"
                allowClear
                showSearch
                optionFilterProp="label"
                value={documentType}
                onChange={setDocumentType}
                options={documentTypes.map((item) => ({
                  value: item.code || item.value,
                  label: item.name || item.label || item.code,
                }))}
              />
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Text type="secondary">Статус документа</Text>
              <Select
                style={{ width: "100%", marginTop: 4 }}
                placeholder="Все статусы"
                allowClear
                value={status}
                onChange={setStatus}
                options={STATUS_OPTIONS}
              />
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Text type="secondary">Сотрудник (ФИО)</Text>
              <Input
                style={{ marginTop: 4 }}
                placeholder="Введите ФИО"
                value={employeeSearchInput}
                onChange={(event) => setEmployeeSearchInput(event.target.value)}
                onPressEnter={handleSearchApply}
              />
            </Col>
          </Row>

          <Space style={{ marginTop: 12 }} wrap>
            <Button icon={<SearchOutlined />} onClick={handleSearchApply}>
              Применить поиск
            </Button>
            <Button onClick={handleResetFilters}>Сбросить фильтры</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadTableData({ page: 1 })}
            >
              Обновить
            </Button>
          </Space>
        </Card>

        <Space wrap>
          <Button
            type="primary"
            icon={<FileZipOutlined />}
            loading={zipLoading}
            onClick={handleDownloadZip}
          >
            {selectedEmployeeIds.length > 0
              ? `Скачать ZIP (${selectedEmployeeIds.length})`
              : "Скачать все документы"}
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            loading={excelLoading}
            onClick={handleExportExcel}
          >
            {selectedEmployeeIds.length > 0
              ? `Excel (${selectedEmployeeIds.length})`
              : "Экспортировать в Excel"}
          </Button>
          {selectedEmployeeIds.length > 0 && (
            <Button onClick={() => setSelectedEmployeeKeys([])}>
              Снять выбор
            </Button>
          )}
        </Space>

        <Card size="small">
          <Table
            rowKey="key"
            loading={tableLoading}
            dataSource={groupedItems}
            columns={columns}
            scroll={{ x: 980 }}
            rowSelection={{
              selectedRowKeys: selectedEmployeeKeys,
              onChange: (keys) => setSelectedEmployeeKeys(keys),
              preserveSelectedRowKeys: true,
            }}
            pagination={{
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.total,
              showSizeChanger: true,
              pageSizeOptions: ["50", "100", "200"],
              showTotal: (total) => `Всего строк документов: ${total}`,
            }}
            onChange={(nextPagination) => {
              loadTableData({
                page: nextPagination.current || 1,
                limit: nextPagination.pageSize || pagination.limit,
              });
            }}
          />
        </Card>

        <Modal
          title={
            selectedDetailsGroup ? selectedDetailsGroup.employeeFullName : ""
          }
          open={Boolean(selectedDetailsGroup)}
          onCancel={() => setDetailsGroupKey(null)}
          footer={null}
          width={1200}
          destroyOnClose
        >
          {selectedDetailsGroup && (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text type="secondary">
                Контрагент: {selectedDetailsGroup.counterpartyName || "-"}
              </Text>
              <Table
                rowKey={(row) =>
                  `${row.employeeId}-${row.documentType}-${row.fileId || "empty"}`
                }
                dataSource={selectedDetailsGroup.documents}
                columns={detailsColumns}
                pagination={false}
                scroll={{ x: 1200, y: 520 }}
              />
            </Space>
          )}
        </Modal>
      </Space>
    </div>
  );
};

export default CounterpartyDocumentsPage;
