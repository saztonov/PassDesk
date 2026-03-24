import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { EyeOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { employeeService } from "@/services/employeeService";
import ocrService from "@/services/ocrService";
import { FileViewer } from "@/shared/ui/FileViewer";

const { Paragraph, Text } = Typography;

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

const EmployeeOcrConflictsCompact = ({ employee }) => {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [fileLoadingKey, setFileLoadingKey] = useState(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  const employeeId = employee?.id;

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
      } finally {
        setFileLoadingKey(null);
      }
    },
    [employeeId],
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
    }
  }, [employeeId, viewingFile?.fileId]);

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
        title: "Распознано из файла",
        key: "ocrValue",
        render: (_, record) => (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {getOcrSources(record.sources).map((source) => (
              <div key={`${record.id}-${source.fileId || source.documentType}`}>
                <Space wrap size={[6, 6]} style={{ marginBottom: 4 }}>
                  <Tag color="gold">
                    {source.documentLabel || source.documentType || "OCR"}
                  </Tag>
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
                <div>
                  <Text type="secondary">OCR:</Text>{" "}
                  <Text strong>{formatValue(source.value)}</Text>
                </div>
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
    ],
    [
      employeeId,
      fileLoadingKey,
      handleOpenSourceFile,
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

        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Сравнивается текущее значение в карточке сотрудника и значение,
          которое OCR распознал из конкретного документа.
        </Paragraph>

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
