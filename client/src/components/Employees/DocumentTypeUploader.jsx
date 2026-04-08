import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Col, Row, Spin, List, Space, Tag, Alert } from "antd";
import { FileViewer } from "../../shared/ui/FileViewer";
import { employeeService } from "../../services/employeeService";
import DocumentTypeUploaderItem from "@/modules/employees/ui/DocumentTypeUploaderItem";
import DocumentTypeUploaderSampleModal from "@/modules/employees/ui/DocumentTypeUploaderSampleModal";
import EmployeeDocumentPreviewPane from "@/modules/employees/ui/EmployeeDocumentPreviewPane";
import {
  DEFAULT_DOCUMENT_TYPES,
  DOCUMENT_TYPE_UPLOADER_STYLES,
  normalizeDocumentTypes,
  splitIntoColumns,
} from "@/modules/employees/lib/documentTypeUploaderUtils";
import { applyDocumentTypeProfile } from "@/modules/employees/lib/documentTypeProfiles";
import { SUPPORTED_FORMATS } from "@/shared/constants/fileTypes";
import {
  createAiScannedDocument,
  isAiDocumentScanEnabled,
} from "@/shared/lib/aiDocumentScanner";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const resolveFileExtension = (fileName = "") =>
  String(fileName || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();

const isImageFile = (file) => {
  const mimeType = String(file?.type || "")
    .trim()
    .toLowerCase();
  const extension = resolveFileExtension(file?.name);

  return mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension);
};

const prepareFileForUpload = async ({ file, documentType, messageApi }) => {
  if (!isAiDocumentScanEnabled() || !isImageFile(file)) {
    return file;
  }

  const messageKey = `ai-scan-${documentType}-${file.name}-${file.size}`;
  messageApi.loading({
    content: `AI: подготавливаем scan-копию (${file.name})...`,
    key: messageKey,
    duration: 0,
  });

  try {
    const scannedFile = await createAiScannedDocument({
      file,
      documentType,
    });
    messageApi.success({
      content: `AI: scan-копия готова (${file.name})`,
      key: messageKey,
      duration: 2,
    });
    return scannedFile;
  } catch (scanError) {
    console.error("AI scan failed:", scanError);
    const fallbackMessage =
      scanError?.userMessage ||
      scanError?.response?.data?.message ||
      scanError?.message ||
      "AI scan не сработал";
    messageApi.warning({
      content: `${fallbackMessage}. Загружаем исходное фото (${file.name})`,
      key: messageKey,
      duration: 3,
    });
    return file;
  }
};

/**
 * Компонент для загрузки документов по типам с автоматической загрузкой
 * Каждый тип документа имеет отдельную кнопку с множественным выбором файлов
 */
const DocumentTypeUploader = ({
  employeeId,
  ensureEmployeeId,
  onFilesUpdated,
  onUploadComplete,
  onRerunOcr,
  ocrProcessingMap = null,
  readonly = false,
  profileCode,
  profilesConfig,
  viewerMode = "modal",
  columnsCount = 3,
  showInfoBanner = true,
  embeddedViewerHeight = 360,
  compact = false,
}) => {
  const { message } = App.useApp();
  const [dataState, setDataState] = useState({
    uploadingTypes: {},
    allFiles: [],
    documentTypes: DEFAULT_DOCUMENT_TYPES,
    loadingDocumentTypes: false,
  });
  const [uploadQueue, setUploadQueue] = useState([]);
  const [lastQueueNotice, setLastQueueNotice] = useState(null);
  const lastCompletedCountRef = useRef(0);
  const lastQueueLengthRef = useRef(0);
  const [uiState, setUiState] = useState({
    viewerVisible: false,
    viewingFile: null,
    sampleModalVisible: false,
    selectedSampleDocType: null,
  });
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState(null);
  const uploadingRef = useRef(new Set());
  const ensureEmployeeIdPromiseRef = useRef(null);
  const effectiveEmployeeId = employeeId || resolvedEmployeeId;
  const { uploadingTypes, allFiles, documentTypes, loadingDocumentTypes } =
    dataState;
  const {
    viewerVisible,
    viewingFile,
    sampleModalVisible,
    selectedSampleDocType,
  } = uiState;

  // server-backed queue
  const profileDocumentTypes = useMemo(
    () =>
      applyDocumentTypeProfile({
        documentTypes,
        profileCode,
        profilesConfig,
      }),
    [documentTypes, profileCode, profilesConfig],
  );

  const resolveEmployeeId = useCallback(async () => {
    if (effectiveEmployeeId) {
      return effectiveEmployeeId;
    }
    if (!ensureEmployeeId) {
      message.error("Сначала сохраните черновик сотрудника");
      return null;
    }

    if (ensureEmployeeIdPromiseRef.current) {
      return ensureEmployeeIdPromiseRef.current;
    }

    ensureEmployeeIdPromiseRef.current = (async () => {
      try {
        const newEmployeeId = await ensureEmployeeId();
        if (newEmployeeId) {
          setResolvedEmployeeId(newEmployeeId);
          return newEmployeeId;
        }
        message.error("Не удалось создать черновик сотрудника");
        return null;
      } catch {
        message.error("Не удалось создать черновик сотрудника");
        return null;
      } finally {
        ensureEmployeeIdPromiseRef.current = null;
      }
    })();

    return ensureEmployeeIdPromiseRef.current;
  }, [effectiveEmployeeId, ensureEmployeeId, message]);

  const fetchAllFiles = useCallback(
    async (targetEmployeeId = effectiveEmployeeId, options = {}) => {
      try {
        if (!targetEmployeeId) {
          setDataState((prev) => ({ ...prev, allFiles: [] }));
          return;
        }
        const response = await employeeService.getFiles(
          targetEmployeeId,
          options,
        );
        const files = response?.data || response || [];
        setDataState((prev) => ({ ...prev, allFiles: files }));
      } catch (error) {
        console.error("Error loading files:", error);
        message.error("Ошибка загрузки файлов");
      }
    },
    [effectiveEmployeeId, message],
  );

  useEffect(() => {
    fetchAllFiles();
  }, [fetchAllFiles]);

  const fetchDocumentTypes = useCallback(async () => {
    setDataState((prev) => ({ ...prev, loadingDocumentTypes: true }));
    try {
      const response = await employeeService.getDocumentTypes();
      const types = response?.data || response || [];
      setDataState((prev) => ({
        ...prev,
        documentTypes: normalizeDocumentTypes(types),
      }));
    } catch (error) {
      console.error("Error loading document types:", error);
      setDataState((prev) => ({
        ...prev,
        documentTypes: DEFAULT_DOCUMENT_TYPES,
      }));
      message.warning(
        "Не удалось загрузить типы документов из БД. Используется базовый список.",
      );
    } finally {
      setDataState((prev) => ({ ...prev, loadingDocumentTypes: false }));
    }
  }, [message]);

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  const getFilesForType = useCallback(
    (documentType) =>
      allFiles.filter((file) => file.documentType === documentType),
    [allFiles],
  );

  const getDocumentTypeLabel = useCallback(
    (documentTypeValue) =>
      profileDocumentTypes.find((item) => item.value === documentTypeValue)
        ?.label || documentTypeValue,
    [profileDocumentTypes],
  );

  const getQueuedCountForType = useCallback(
    (documentTypeValue) =>
      uploadQueue.filter(
        (item) =>
          item.documentType === documentTypeValue &&
          item.status !== "completed" &&
          item.status !== "done",
      ).length,
    [uploadQueue],
  );

  const handleOpenSample = useCallback((docType) => {
    setUiState((prev) => ({
      ...prev,
      selectedSampleDocType: docType,
      sampleModalVisible: true,
    }));
  }, []);

  const fetchUploadQueue = useCallback(async () => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const response = await employeeService.getUploadQueue(
        effectiveEmployeeId,
      );
      const queueItems = Array.isArray(response?.data) ? response.data : [];
      setUploadQueue(queueItems);
      const completedCount = queueItems.filter(
        (item) => item.status === "completed" || item.status === "done",
      ).length;
      if (completedCount > lastCompletedCountRef.current) {
        lastCompletedCountRef.current = completedCount;
        await fetchAllFiles(effectiveEmployeeId, { force: true });
      }
    } catch (error) {
      console.error("Failed to load upload queue:", error);
    }
  }, [effectiveEmployeeId, fetchAllFiles]);

  useEffect(() => {
    fetchUploadQueue();
  }, [fetchUploadQueue]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }

    if (uploadQueue.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      fetchUploadQueue();
    }, 3000);

    return () => clearInterval(interval);
  }, [effectiveEmployeeId, fetchUploadQueue, uploadQueue.length]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }
    if (uploadQueue.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      fetchAllFiles(effectiveEmployeeId, { force: true });
    }, 2000);

    return () => clearInterval(interval);
  }, [effectiveEmployeeId, fetchAllFiles, uploadQueue.length]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }
    const previousLength = lastQueueLengthRef.current;
    if (previousLength > 0 && uploadQueue.length === 0) {
      fetchAllFiles(effectiveEmployeeId, { force: true });
    }
    lastQueueLengthRef.current = uploadQueue.length;
  }, [effectiveEmployeeId, fetchAllFiles, uploadQueue.length]);

  const handleUploadSubmit = async (fileList, documentType) => {
    if (!Array.isArray(fileList) || fileList.length === 0) {
      return false;
    }

    if (uploadingTypes[documentType]) {
      return false;
    }

    const currentEmployeeId = await resolveEmployeeId();
    if (!currentEmployeeId) {
      return false;
    }

    const uploadKey = fileList
      .map((file) => `${file.name}_${file.size}`)
      .join("|");
    if (uploadingRef.current.has(uploadKey)) {
      return false;
    }

    uploadingRef.current.add(uploadKey);

    const optimisticItems = fileList.map((fileObj, index) => {
      const actualFile = fileObj.originFileObj || fileObj;
      return {
        id: `local-${Date.now()}-${index}`,
        fileName: actualFile?.name || "Файл",
        documentType,
        status: "queued",
        attempts: 0,
        error: null,
      };
    });
    setUploadQueue((prev) => [...optimisticItems, ...prev]);

    const runQueueRequest = async () => {
      try {
      const formData = new FormData();
      for (const fileObj of fileList) {
        const actualFile = fileObj.originFileObj || fileObj;
        const fileToUpload = await prepareFileForUpload({
          file: actualFile,
          documentType,
          messageApi: message,
        });
        formData.append("files", fileToUpload);
      }
      formData.append("documentType", documentType);

      const queued = await employeeService.enqueueFiles(
        currentEmployeeId,
        formData,
      );

      const queuedItems = Array.isArray(queued?.data) ? queued.data : [];
      if (queuedItems.length > 0) {
        setUploadQueue(queuedItems);
      } else {
        await fetchUploadQueue();
      }

      const label = getDocumentTypeLabel(documentType);
      setLastQueueNotice({
        type: "success",
        text: `В очередь: ${label} • ${fileList.length}`,
        ts: Date.now(),
      });
      message.success(`В очередь: ${label} • ${fileList.length}`);

      return true;
    } catch (error) {
      console.error(`Error enqueue ${documentType}:`, error);
      setUploadQueue((prev) =>
        prev.filter((item) => !item.id?.startsWith("local-")),
      );
      setLastQueueNotice({
        type: "error",
        text:
          error?.response?.data?.message ||
          "Ошибка очереди загрузки",
        ts: Date.now(),
      });
      message.error(error?.response?.data?.message || "Ошибка очереди загрузки");
      return false;
    } finally {
      uploadingRef.current.delete(uploadKey);
    }
    };

    void runQueueRequest();
    return true;
  };

  useEffect(() => {
    if (!lastQueueNotice) return;
    const timer = setTimeout(() => setLastQueueNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [lastQueueNotice]);

  const handleDeleteFile = async (fileId) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      await employeeService.deleteFile(effectiveEmployeeId, fileId);
      message.success("Файл удален");
      await fetchAllFiles();
      if (onFilesUpdated) {
        onFilesUpdated();
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      message.error("Ошибка удаления файла");
    }
  };

  const handleDownloadFile = async (file) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const downloadLink = await employeeService.getFileDownloadLink(
        effectiveEmployeeId,
        file.id,
      );
      const url = downloadLink?.data?.downloadUrl || downloadLink?.downloadUrl;

      if (url && typeof url === "string") {
        window.open(url, "_blank");
      } else {
        console.error("❌ No download URL found in response:", downloadLink);
        message.error("Ошибка при получении ссылки скачивания");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      message.error("Ошибка скачивания файла");
    }
  };

  const handleViewFile = async (file) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const viewLink = await employeeService.getFileViewLink(
        effectiveEmployeeId,
        file.id,
      );
      const url = viewLink?.data?.viewUrl || viewLink?.viewUrl;

      if (url && typeof url === "string") {
        setUiState((prev) => ({
          ...prev,
          viewingFile: {
            url,
            mimeType: file.mimeType || "application/pdf",
            fileName: file.fileName,
            fileId: file.id,
          },
          viewerVisible: true,
        }));
      } else {
        console.error("❌ No view URL found in response:", viewLink);
        message.error("Ошибка при получении ссылки просмотра");
      }
    } catch (error) {
      console.error("Error viewing file:", error);
      message.error("Ошибка просмотра файла");
    }
  };

  const handleDownloadViewingFile = async () => {
    if (!effectiveEmployeeId || !viewingFile?.fileId) {
      return;
    }
    try {
      const downloadLink = await employeeService.getFileDownloadLink(
        effectiveEmployeeId,
        viewingFile.fileId,
      );
      const url = downloadLink?.data?.downloadUrl || downloadLink?.downloadUrl;

      if (url && typeof url === "string") {
        window.open(url, "_blank");
      } else {
        message.error("Ошибка при получении ссылки скачивания");
      }
    } catch (error) {
      console.error("Error downloading preview file:", error);
      message.error("Ошибка скачивания файла");
    }
  };

  const documentTypeColumns = useMemo(
    () => splitIntoColumns(profileDocumentTypes, columnsCount),
    [columnsCount, profileDocumentTypes],
  );

  const colSpan = useMemo(() => {
    if (columnsCount === 1) return { xs: 24, sm: 24, lg: 24 };
    if (columnsCount === 2) return { xs: 24, sm: 12, lg: 12 };
    return { xs: 24, sm: 12, lg: 8 };
  }, [columnsCount]);

  const documentTypeList = (
    <Row gutter={[16, 16]}>
      {documentTypeColumns.map((column) => (
        <Col
          key={`doc-column-${column.map((docType) => docType.value).join("|")}`}
          {...colSpan}
        >
          <div className="document-uploader-column">
            {column.map((docType) => (
              <DocumentTypeUploaderItem
                key={docType.value}
                docType={docType}
                filesOfType={getFilesForType(docType.value)}
                readonly={readonly}
                employeeId={effectiveEmployeeId}
                canEnsureEmployeeId={typeof ensureEmployeeId === "function"}
                uploading={uploadingTypes[docType.value]}
                messageApi={message}
                onOpenSample={handleOpenSample}
                onUploadSubmit={handleUploadSubmit}
                onViewFile={handleViewFile}
                onDownloadFile={handleDownloadFile}
                onDeleteFile={handleDeleteFile}
                onRerunOcr={onRerunOcr}
                ocrProcessingMap={ocrProcessingMap}
                compact={compact}
                queuedCount={getQueuedCountForType(docType.value)}
              />
            ))}
          </div>
        </Col>
      ))}
    </Row>
  );

  const renderQueueStatus = (item) => {
    if (item.status === "uploading" || item.status === "active") {
      return <Tag color="blue">Загрузка…</Tag>;
    }
    if (item.status === "done" || item.status === "completed") {
      return <Tag color="green">Готово</Tag>;
    }
    if (item.status === "error" || item.status === "failed") {
      return <Tag color="red">Ошибка</Tag>;
    }
    if (item.attempts > 0) {
      return <Tag color="orange">Повтор {item.attempts}</Tag>;
    }
    return <Tag>В очереди</Tag>;
  };

  if (viewerMode === "inline") {
    const closeViewer = () =>
      setUiState((prev) => ({ ...prev, viewingFile: null, viewerVisible: false }));

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <style>{DOCUMENT_TYPE_UPLOADER_STYLES}</style>

        {/* Список документов — скрываем через display:none чтобы сохранить скролл */}
        <div style={{ overflowY: "auto", height: "100%", display: viewingFile ? "none" : "block" }}>
          {documentTypeList}
        </div>

        {/* Viewer — занимает всю высоту когда открыт */}
        {viewingFile ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <EmployeeDocumentPreviewPane
              viewingFile={viewingFile}
              fill
              onBack={closeViewer}
              onDownload={handleDownloadViewingFile}
            />
          </div>
        ) : null}

        <DocumentTypeUploaderSampleModal
          visible={sampleModalVisible}
          docType={selectedSampleDocType}
          onClose={() =>
            setUiState((prev) => ({ ...prev, sampleModalVisible: false }))
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0" }}>
      <style>{DOCUMENT_TYPE_UPLOADER_STYLES}</style>

      {showInfoBanner ? (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            backgroundColor: "#f0f5ff",
            borderRadius: 4,
            fontSize: "12px",
            color: "#1890ff",
            border: "1px solid #b3d8ff",
          }}
        >
          ℹ️ Нажмите «Загрузить» напротив нужного типа документа. Далее в модалке
          выберите или перетащите файлы (поддерживаемые форматы:{" "}
          {SUPPORTED_FORMATS})
          {loadingDocumentTypes && (
            <span style={{ marginLeft: 8 }}>
              <Spin size="small" />
            </span>
          )}
        </div>
      ) : null}

      {lastQueueNotice && (
        <Alert
          type={lastQueueNotice.type}
          message={lastQueueNotice.text}
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {uploadQueue.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Очередь загрузки
          </div>
          <List
            size="small"
            dataSource={uploadQueue}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>{item.fileName || "Файл"}</span>
                    {renderQueueStatus(item)}
                  </Space>
                  <Space style={{ color: "#8c8c8c", fontSize: 12 }}>
                    <span>{getDocumentTypeLabel(item.documentType)}</span>
                    {item.error && (
                      <>
                        <span>•</span>
                        <span style={{ color: "#cf1322" }}>{item.error}</span>
                      </>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {documentTypeList}

      {viewerMode === "modal" && viewingFile && (
        <FileViewer
          visible={viewerVisible}
          fileUrl={viewingFile.url}
          fileName={viewingFile.fileName}
          mimeType={viewingFile.mimeType}
          onClose={() =>
            setUiState((prev) => ({ ...prev, viewerVisible: false }))
          }
        />
      )}

      <DocumentTypeUploaderSampleModal
        visible={sampleModalVisible}
        docType={selectedSampleDocType}
        onClose={() =>
          setUiState((prev) => ({ ...prev, sampleModalVisible: false }))
        }
      />
    </div>
  );
};

export default DocumentTypeUploader;
