import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Col, Row, Spin } from "antd";
import { FileViewer } from "../../shared/ui/FileViewer";
import { employeeService } from "../../services/employeeService";
import DocumentTypeUploaderItem from "@/modules/employees/ui/DocumentTypeUploaderItem";
import DocumentTypeUploaderSampleModal from "@/modules/employees/ui/DocumentTypeUploaderSampleModal";
import {
  DEFAULT_DOCUMENT_TYPES,
  DOCUMENT_TYPE_UPLOADER_STYLES,
  normalizeDocumentTypes,
  splitIntoColumns,
} from "@/modules/employees/lib/documentTypeUploaderUtils";
import { applyDocumentTypeProfile } from "@/modules/employees/lib/documentTypeProfiles";
import { SUPPORTED_FORMATS } from "@/shared/constants/fileTypes";

/**
 * Компонент для загрузки документов по типам с автоматической загрузкой
 * Каждый тип документа имеет отдельную кнопку с множественным выбором файлов
 */
const DocumentTypeUploader = ({
  employeeId,
  ensureEmployeeId,
  onFilesUpdated,
  onUploadComplete,
  readonly = false,
  profileCode,
  profilesConfig,
}) => {
  const { message } = App.useApp();
  const [dataState, setDataState] = useState({
    uploadingTypes: {},
    allFiles: [],
    documentTypes: DEFAULT_DOCUMENT_TYPES,
    loadingDocumentTypes: false,
  });
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

  const fetchAllFiles = useCallback(async (targetEmployeeId = effectiveEmployeeId, options = {}) => {
    try {
      if (!targetEmployeeId) {
        setDataState((prev) => ({ ...prev, allFiles: [] }));
        return;
      }
      const response = await employeeService.getFiles(targetEmployeeId, options);
      const files = response?.data || response || [];
      setDataState((prev) => ({ ...prev, allFiles: files }));
    } catch (error) {
      console.error("Error loading files:", error);
      message.error("Ошибка загрузки файлов");
    }
  }, [effectiveEmployeeId, message]);

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

  const handleOpenSample = useCallback((docType) => {
    setUiState((prev) => ({
      ...prev,
      selectedSampleDocType: docType,
      sampleModalVisible: true,
    }));
  }, []);

  const handleChange = async (info, documentType) => {
    const { fileList } = info;

    if (fileList.length === 0 || uploadingTypes[documentType]) {
      return;
    }

    const currentEmployeeId = await resolveEmployeeId();
    if (!currentEmployeeId) {
      return;
    }

    const uploadKey = fileList
      .map((file) => `${file.name}_${file.size}`)
      .join("|");
    if (uploadingRef.current.has(uploadKey)) {
      return;
    }

    uploadingRef.current.add(uploadKey);
    setDataState((prev) => ({
      ...prev,
      uploadingTypes: { ...prev.uploadingTypes, [documentType]: true },
    }));

    try {
      const formData = new FormData();
      fileList.forEach((fileObj) => {
        const actualFile = fileObj.originFileObj || fileObj;
        formData.append("files", actualFile);
      });
      formData.append("documentType", documentType);

      const uploadResult = await employeeService.uploadFiles(
        currentEmployeeId,
        formData,
      );
      message.success(`${getDocumentTypeLabel(documentType)} загружен(ы)`);

      const uploadedFiles = Array.isArray(uploadResult?.data)
        ? uploadResult.data
        : [];
      if (typeof onUploadComplete === "function" && uploadedFiles.length > 0) {
        for (const uploadedFile of uploadedFiles) {
          await onUploadComplete({
            file: uploadedFile,
            employeeId: currentEmployeeId,
            fileDocumentType: documentType,
          });
        }
      }

      await fetchAllFiles(currentEmployeeId, { force: true });

      if (onFilesUpdated) {
        onFilesUpdated();
      }
    } catch (error) {
      console.error(`Error uploading ${documentType}:`, error);
      message.error("Ошибка загрузки файла");
    } finally {
      setDataState((prev) => ({
        ...prev,
        uploadingTypes: { ...prev.uploadingTypes, [documentType]: false },
      }));
      uploadingRef.current.delete(uploadKey);
    }
  };

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

  const documentTypeColumns = useMemo(
    () => splitIntoColumns(profileDocumentTypes, 3),
    [profileDocumentTypes],
  );

  return (
    <div style={{ padding: "16px 0" }}>
      <style>{DOCUMENT_TYPE_UPLOADER_STYLES}</style>

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
        ℹ️ Укажите тип документа и выберите файл (поддерживаемые форматы:{" "}
        {SUPPORTED_FORMATS})
        {loadingDocumentTypes && (
          <span style={{ marginLeft: 8 }}>
            <Spin size="small" />
          </span>
        )}
      </div>

      <Row gutter={[16, 16]}>
        {documentTypeColumns.map((column) => (
          <Col
            key={`doc-column-${column.map((docType) => docType.value).join("|")}`}
            xs={24}
            sm={12}
            lg={8}
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
                  onUploadChange={handleChange}
                  onViewFile={handleViewFile}
                  onDownloadFile={handleDownloadFile}
                  onDeleteFile={handleDeleteFile}
                />
              ))}
            </div>
          </Col>
        ))}
      </Row>

      {viewingFile && (
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
