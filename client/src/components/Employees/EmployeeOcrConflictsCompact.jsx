import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckOutlined,
  EyeOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { employeeService } from "@/services/employeeService";
import ocrService from "@/services/ocrService";
import { FileViewer } from "@/shared/ui/FileViewer";

const { Text } = Typography;

const toResponseData = (response) => response?.data || response || {};

const formatValue = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return normalized;
};

const formatDateTime = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";

const getCardSource = (sources = []) =>
  sources.find((source) => source.documentType === "employee_card") || null;

const getOcrSources = (sources = []) =>
  sources.filter((source) => source.documentType !== "employee_card");

const EmployeeOcrConflictsCompact = ({ employee, user, onChanged }) => {
  const { message } = App.useApp();
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState(null);
  const [fileLoadingKey, setFileLoadingKey] = useState(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  const employeeId = employee?.id;
  const canResolveConflicts = user?.role === "admin" || user?.role === "manager";

  const loadConflicts = useCallback(async () => {
    if (!employeeId) {
      setConflicts([]);
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    try {
      const response = await ocrService.getConflicts({
        employeeId,
        status: "open",
        limit: 200,
      });
      const payload = toResponseData(response);
      const items = Array.isArray(payload.items) ? payload.items : [];
      setConflicts(items.filter((item) => item.type === "employee_vs_ocr"));
    } catch (error) {
      console.error("Failed to load employee OCR conflicts:", error);
      setConflicts([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [employeeId]);

  useEffect(() => {
    setHasLoaded(false);
    loadConflicts();
  }, [loadConflicts]);

  const notifySummaryChanged = useCallback(async () => {
    if (typeof onChanged === "function") {
      await onChanged(employeeId);
    }
  }, [employeeId, onChanged]);

  const handleResolve = useCallback(
    async (conflictId) => {
      const loadingKey = `resolve:${conflictId}`;
      setActionLoadingKey(loadingKey);
      try {
        await ocrService.resolveConflict(conflictId);
        setConflicts((prev) => prev.filter((item) => item.id !== conflictId));
        message.success("Оставили значение карточки");
        await notifySummaryChanged();
      } catch (error) {
        console.error("Failed to resolve OCR conflict:", error);
        message.error("Не удалось обработать конфликт");
      } finally {
        setActionLoadingKey(null);
      }
    },
    [message, notifySummaryChanged],
  );

  const handleApply = useCallback(
    async (conflictId) => {
      const loadingKey = `apply:${conflictId}`;
      setActionLoadingKey(loadingKey);
      try {
        await ocrService.applyConflict(conflictId);
        setConflicts((prev) => prev.filter((item) => item.id !== conflictId));
        message.success("Приняли значение из OCR");
        await notifySummaryChanged();
      } catch (error) {
        console.error("Failed to apply OCR conflict:", error);
        message.error("Не удалось применить значение OCR");
      } finally {
        setActionLoadingKey(null);
      }
    },
    [message, notifySummaryChanged],
  );

  const handleOpenSourceFile = useCallback(
    async (source) => {
      const fileId = source?.fileId;
      if (!employeeId || !fileId) {
        return;
      }

      const loadingKey = `${employeeId}:${fileId}`;
      setFileLoadingKey(loadingKey);
      try {
        const response = await employeeService.getFileViewLink(employeeId, fileId);
        const viewUrl = response?.data?.viewUrl || response?.viewUrl;
        if (!viewUrl) {
          throw new Error("Empty viewUrl");
        }
        setViewingFile({
          url: viewUrl,
          name: source?.fileName || "Файл",
          mimeType: source?.mimeType || "",
          fileId,
        });
        setViewerVisible(true);
      } catch (error) {
        console.error("Failed to open OCR source file:", error);
        message.error("Не удалось открыть файл-источник");
      } finally {
        setFileLoadingKey(null);
      }
    },
    [employeeId, message],
  );

  const handleDownloadFromViewer = useCallback(async () => {
    if (!employeeId || !viewingFile?.fileId) {
      return;
    }

    try {
      const response = await employeeService.getFileDownloadLink(
        employeeId,
        viewingFile.fileId,
      );
      const downloadUrl = response?.data?.downloadUrl || response?.downloadUrl;
      if (downloadUrl) {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to download OCR source file:", error);
      message.error("Не удалось скачать файл-источник");
    }
  }, [employeeId, message, viewingFile?.fileId]);

  const modalColumns = useMemo(
    () => [
      {
        title: "Поле",
        dataIndex: "fieldLabel",
        key: "fieldLabel",
        width: 180,
        render: (value) => <Text strong>{value || "—"}</Text>,
      },
      {
        title: "Карточка",
        key: "currentValue",
        width: 180,
        render: (_, record) => formatValue(getCardSource(record.sources)?.value),
      },
      {
        title: "OCR",
        key: "ocrValue",
        render: (_, record) => (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            {getOcrSources(record.sources).map((source) => (
              <div key={`${record.id}-${source.fileId || source.documentType}`}>
                <Space wrap size={[6, 6]}>
                  <Tag color="gold">{source.documentLabel || source.documentType || "OCR"}</Tag>
                  <Text type="secondary">{source.fileName || "—"}</Text>
                  {source.fileId ? (
                    <Button
                      size="small"
                      type="link"
                      icon={<EyeOutlined />}
                      loading={fileLoadingKey === `${employeeId}:${source.fileId}`}
                      onClick={() => handleOpenSourceFile(source)}
                      style={{ paddingInline: 0 }}
                    >
                      Открыть файл
                    </Button>
                  ) : null}
                </Space>
                <div>{formatValue(source.value)}</div>
              </div>
            ))}
          </Space>
        ),
      },
      {
        title: "Обновлено",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 170,
        render: (value) => formatDateTime(value),
      },
      {
        title: "Действия",
        key: "actions",
        width: canResolveConflicts ? 180 : 1,
        render: (_, record) => {
          if (!canResolveConflicts) {
            return null;
          }

          return (
            <Space size={4}>
              <Tooltip title="Оставить значение карточки">
                <Popconfirm
                  title="Оставить текущее значение карточки?"
                  okText="Оставить"
                  cancelText="Отмена"
                  onConfirm={() => handleResolve(record.id)}
                >
                  <Button
                    size="small"
                    loading={actionLoadingKey === `resolve:${record.id}`}
                  >
                    Оставить
                  </Button>
                </Popconfirm>
              </Tooltip>
              <Tooltip title="Принять значение из OCR">
                <Popconfirm
                  title="Принять значение из OCR?"
                  okText="Принять"
                  cancelText="Отмена"
                  onConfirm={() => handleApply(record.id)}
                >
                  <Button
                    size="small"
                    type="primary"
                    loading={actionLoadingKey === `apply:${record.id}`}
                    icon={<CheckOutlined />}
                  >
                    Принять
                  </Button>
                </Popconfirm>
              </Tooltip>
            </Space>
          );
        },
      },
    ],
    [
      actionLoadingKey,
      canResolveConflicts,
      employeeId,
      fileLoadingKey,
      handleApply,
      handleOpenSourceFile,
      handleResolve,
    ],
  );

  if (!employeeId) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Расхождения появятся после сохранения карточки и OCR-проверки файлов."
      />
    );
  }

  return (
    <>
      <div
        style={{
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: 12,
          background: "#fff",
        }}
      >
        <Space
          style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}
          align="center"
          wrap
        >
          <Space align="center">
            <WarningOutlined style={{ color: "#faad14" }} />
            <Text strong>
              Расхождения OCR
              {hasLoaded ? `: ${conflicts.length}` : ""}
            </Text>
          </Space>
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={loadConflicts}
          >
            Обновить
          </Button>
        </Space>

        {hasLoaded && conflicts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Открытых расхождений нет."
          />
        ) : (
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={modalColumns}
            dataSource={conflicts}
            pagination={false}
            scroll={{ x: 980 }}
          />
        )}
      </div>

      <FileViewer
        visible={viewerVisible}
        fileUrl={viewingFile?.url}
        fileName={viewingFile?.name}
        mimeType={viewingFile?.mimeType}
        onClose={() => {
          setViewerVisible(false);
          setViewingFile(null);
        }}
        onDownload={handleDownloadFromViewer}
      />
    </>
  );
};

export default EmployeeOcrConflictsCompact;
