import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Button,
  List,
  Popconfirm,
  App,
  Space,
  Tooltip,
  Modal,
  Select,
  Form,
  Tag,
} from "antd";
import {
  UploadOutlined,
  DeleteOutlined,
  FileOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { FileViewer } from "../../shared/ui/FileViewer";
import { employeeService } from "../../services/employeeService";
import {
  ALLOWED_MIME_TYPES,
  SUPPORTED_FORMATS,
  ALLOWED_EXTENSIONS,
} from "../../shared/constants/fileTypes.js";

const { Option } = Select;

// Типы документов
const DOCUMENT_TYPES = [
  { value: "passport", label: "Паспорт" },
  { value: "passport_translation", label: "Перевод паспорта" },
  { value: "inn_document", label: "ИНН" },
  { value: "bank_details", label: "Реквизиты счета" },
  { value: "consent", label: "Согласие на перс.дан. Подрядчик" },
  { value: "patent_front", label: "Лицевая сторона патента (с фото)" },
  { value: "patent_back", label: "Задняя сторона патента" },
  { value: "visa", label: "Виза" },
  { value: "biometric_consent", label: "Согласие на перс.дан. Генподряд" },
  {
    value: "biometric_consent_developer",
    label: "Согласие на перс.дан. Застройщ",
  },
  { value: "diploma", label: "Диплом / Документ об образовании" },
  { value: "snils_card", label: "СНИЛС" },
  { value: "arrival_notice", label: "Уведомление о прибытии (регистрация)" },
  { value: "patent_payment_receipt", label: "Чек об оплате патента" },
  { value: "insurance_policy", label: "Страховой полис" },
  { value: "memo_approval", label: "Служебная записка (согласование)" },
  {
    value: "employment_history_stdr",
    label: "Справка о трудовой деятельности работника (СТДР)",
  },
  { value: "registration_amina", label: "Регистрация (Амина)" },
  { value: "military_id", label: "Военный билет" },
  { value: "other", label: "Иные документы" },
];

const EmployeeFileUpload = ({
  employeeId,
  readonly = false,
  onFilesChange,
  hideUploadButton = false,
}) => {
  const { message } = App.useApp();
  const [state, setState] = useState({
    files: [],
    loading: false,
    uploading: false,
    fileList: [],
    documentTypeModalVisible: false,
    selectedFiles: [],
    viewerVisible: false,
    viewingFile: null,
  });
  const {
    files,
    loading,
    uploading,
    fileList,
    documentTypeModalVisible,
    selectedFiles,
    viewerVisible,
    viewingFile,
  } = state;
  const [form] = Form.useForm();
  const [uploadQueue, setUploadQueue] = useState([]);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    queueRef.current = uploadQueue;
  }, [uploadQueue]);

  const fetchFiles = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      if (!employeeId) {
        setState((prev) => ({ ...prev, files: [] }));
        onFilesChange?.(0);
        return;
      }
      const response = await employeeService.getFiles(employeeId);
      const filesList = response.data || [];
      setState((prev) => ({ ...prev, files: filesList }));

      // Уведомляем родителя об изменении файлов (только для информации, без обновления сотрудника)
      // onFilesChange используется только для обновления отображения количества файлов в таблице
      if (onFilesChange) {
        onFilesChange(filesList.length);
      }
    } catch (error) {
      console.error("Error loading files:", error);
      message.error("Ошибка загрузки списка файлов");
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [employeeId, message, onFilesChange]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Открываем модальное окно выбора типа документа
  const handleSelectFiles = () => {
    if (fileList.length === 0) {
      message.warning("Выберите файлы для загрузки");
      return;
    }
    setState((prev) => ({
      ...prev,
      selectedFiles: fileList,
      documentTypeModalVisible: true,
    }));
  };

  // Загрузка файлов с типом документа
  const enqueueUploads = useCallback((filesToUpload, documentType) => {
    const now = Date.now();
    const queueItems = filesToUpload.map((fileObj, index) => {
      const actualFile = fileObj.originFileObj || fileObj;
      return {
        id: `${now}-${index}-${actualFile?.name || "file"}`,
        file: actualFile,
        documentType,
        status: "queued",
        attempts: 0,
        error: null,
      };
    });

    setUploadQueue((prev) => [...prev, ...queueItems]);
  }, []);

  const updateQueueItem = useCallback((id, patch) => {
    setUploadQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;

    const maxRetries = 2;

    try {
      while (true) {
        const nextItem = queueRef.current.find(
          (item) => item.status === "queued",
        );
        if (!nextItem) {
          break;
        }

        updateQueueItem(nextItem.id, {
          status: "uploading",
          error: null,
        });

        const formData = new FormData();
        formData.append("files", nextItem.file);
        formData.append("documentType", nextItem.documentType);

        try {
          await employeeService.uploadFiles(employeeId, formData);
          updateQueueItem(nextItem.id, { status: "done" });
          await fetchFiles();
        } catch (error) {
          const errorMessage =
            error?.response?.data?.message || "Ошибка загрузки файлов";
          const attempts = nextItem.attempts + 1;
          if (attempts <= maxRetries) {
            updateQueueItem(nextItem.id, {
              status: "queued",
              attempts,
              error: errorMessage,
            });
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else {
            updateQueueItem(nextItem.id, {
              status: "error",
              attempts,
              error: errorMessage,
            });
          }
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [employeeId, fetchFiles, updateQueueItem, uploadQueue]);

  useEffect(() => {
    if (uploadQueue.some((item) => item.status === "queued")) {
      void processQueue();
    }
  }, [processQueue, uploadQueue]);

  const handleUploadWithDocumentType = async () => {
    try {
      const values = await form.validateFields();
      const documentType = values.documentType;

      const uploadMeta = selectedFiles.map((fileObj) => {
        const actualFile = fileObj.originFileObj || fileObj;
        return {
          name: actualFile?.name,
          type: actualFile?.type,
          size: actualFile?.size,
        };
      });

      console.log("📤 Upload employee files queued", {
        employeeId,
        documentType,
        filesCount: selectedFiles.length,
        files: uploadMeta,
      });

      enqueueUploads(selectedFiles, documentType);
      setState((prev) => ({
        ...prev,
        fileList: [],
        selectedFiles: [],
        documentTypeModalVisible: false,
        uploading: false,
      }));
      form.resetFields();
    } catch (error) {
      if (error.errorFields) {
        // Ошибка валидации формы
        return;
      }
      console.error("Error uploading files:", error);
      console.error("Upload response:", {
        status: error.response?.status,
        data: error.response?.data,
      });
      message.error(error.response?.data?.message || "Ошибка загрузки файлов");
    } finally {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, uploading: false }));
      }
    }
  };

  // Отмена выбора типа документа
  const handleCancelDocumentType = () => {
    setState((prev) => ({
      ...prev,
      documentTypeModalVisible: false,
      selectedFiles: [],
    }));
    form.resetFields();
  };

  const handleDelete = async (fileId) => {
    try {
      await employeeService.deleteFile(employeeId, fileId);
      message.success("Файл удален");
      fetchFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      message.error("Ошибка удаления файла");
    }
  };

  const handleDownload = async (file) => {
    try {
      const response = await employeeService.getFileDownloadLink(
        employeeId,
        file.id,
      );
      if (response.data.downloadUrl) {
        // S3 URL теперь имеет правильный заголовок Content-Disposition от бэкэнда
        window.open(response.data.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Error getting download link:", error);
      message.error("Ошибка получения ссылки для скачивания");
    }
  };

  const handleView = async (file) => {
    // Открываем файл во встроенном просмотрщике с увеличением
    try {
      const response = await employeeService.getFileViewLink(
        employeeId,
        file.id,
      );
      if (response.data.viewUrl) {
        setState((prev) => ({
          ...prev,
          viewingFile: {
            url: response.data.viewUrl,
            name: file.originalName,
            mimeType: file.mimeType,
            fileId: file.id,
          },
          viewerVisible: true,
        }));
      }
    } catch (error) {
      console.error("Error getting view link:", error);
      message.error("Ошибка получения ссылки для просмотра");
    }
  };

  const stopFileActionEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  };

  // Скачивание файла из просмотрщика
  const handleDownloadFromViewer = async () => {
    if (viewingFile) {
      try {
        const response = await employeeService.getFileDownloadLink(
          employeeId,
          viewingFile.fileId,
        );
        if (response.data.downloadUrl) {
          // S3 URL теперь имеет правильный заголовок Content-Disposition от бэкэнда
          window.open(response.data.downloadUrl, "_blank");
          message.success("Скачивание начато");
        }
      } catch (error) {
        console.error("Error getting download link:", error);
        message.error("Ошибка получения ссылки для скачивания");
      }
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith("image/")) {
      return <FileImageOutlined style={{ fontSize: 24, color: "#52c41a" }} />;
    } else if (mimeType.includes("pdf")) {
      return <FilePdfOutlined style={{ fontSize: 24, color: "#f5222d" }} />;
    } else if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return <FileExcelOutlined style={{ fontSize: 24, color: "#52c41a" }} />;
    } else if (mimeType.includes("word") || mimeType.includes("document")) {
      return <FileWordOutlined style={{ fontSize: 24, color: "#1890ff" }} />;
    }
    return <FileOutlined style={{ fontSize: 24, color: "#8c8c8c" }} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Получить название типа документа
  const getDocumentTypeName = (documentType) => {
    const type = DOCUMENT_TYPES.find((t) => t.value === documentType);
    return type ? type.label : "Не указан";
  };

  const renderQueueStatus = (item) => {
    if (item.status === "uploading") {
      return <Tag color="blue">Загрузка…</Tag>;
    }
    if (item.status === "done") {
      return <Tag color="green">Готово</Tag>;
    }
    if (item.status === "error") {
      return <Tag color="red">Ошибка</Tag>;
    }
    if (item.attempts > 0) {
      return <Tag color="orange">Повтор {item.attempts}</Tag>;
    }
    return <Tag>В очереди</Tag>;
  };

  const uploadProps = {
    multiple: true,
    accept: ALLOWED_EXTENSIONS,
    fileList: fileList,
    beforeUpload: (file) => {
      // Проверка типа файла
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        message.error(
          `❌ ${file.name}: неподдерживаемый тип файла\n` +
            `✅ Поддерживаются: ${SUPPORTED_FORMATS}`,
        );
        return Upload.LIST_IGNORE;
      }

      // Проверка размера файла (макс. 100 МБ)
      const fileSizeMB = file.size / 1024 / 1024;
      if (fileSizeMB > 100) {
        message.error(
          `❌ ${file.name}: размер файла ${fileSizeMB.toFixed(2)}MB превышает максимум 100MB`,
        );
        return Upload.LIST_IGNORE;
      }

      return false; // Не загружать автоматически
    },
    onChange: (info) => {
      // Обновляем fileList при изменениях
      setState((prev) => ({ ...prev, fileList: info.fileList }));
    },
    onRemove: () => {
      return true; // Разрешить удаление
    },
    showUploadList: true,
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      {!readonly && !hideUploadButton && (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} disabled={uploading}>
              Выбрать файлы
            </Button>
          </Upload>
          {fileList.length > 0 && (
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploading}
              onClick={handleSelectFiles}
            >
              Загрузить {fileList.length} файл(ов)
            </Button>
          )}
          <div style={{ color: "#8c8c8c", fontSize: "12px" }}>
            ✅ Поддерживаемые форматы: {SUPPORTED_FORMATS} (макс. 100 МБ)
          </div>
        </Space>
      )}

      {uploadQueue.length > 0 && (
        <div
          style={{
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
                    <span>{item.file?.name || "Файл"}</span>
                    {renderQueueStatus(item)}
                  </Space>
                  <Space style={{ color: "#8c8c8c", fontSize: 12 }}>
                    <span>{formatFileSize(item.file?.size || 0)}</span>
                    <span>•</span>
                    <span>{getDocumentTypeName(item.documentType)}</span>
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

      <List
        loading={loading}
        dataSource={files}
        locale={{ emptyText: "Нет загруженных файлов" }}
        renderItem={(file) => (
          <List.Item
            actions={[
              <Tooltip key="view" title="Просмотр">
                <Button
                  icon={<EyeOutlined />}
                  size="small"
                  onClick={(event) => {
                    stopFileActionEvent(event);
                    handleView(file);
                  }}
                />
              </Tooltip>,
              <Tooltip key="download" title="Скачать">
                <Button
                  icon={<DownloadOutlined />}
                  size="small"
                  onClick={(event) => {
                    stopFileActionEvent(event);
                    handleDownload(file);
                  }}
                />
              </Tooltip>,
              !readonly && (
                <Popconfirm
                  key="delete"
                  title="Удалить файл?"
                  description="Это действие нельзя отменить"
                  onConfirm={(event) => {
                    stopFileActionEvent(event);
                    handleDelete(file.id);
                  }}
                  onCancel={stopFileActionEvent}
                  okText="Удалить"
                  cancelText="Отмена"
                >
                  <Tooltip title="Удалить">
                    <Button
                      icon={<DeleteOutlined />}
                      size="small"
                      danger
                      onClick={stopFileActionEvent}
                      onMouseDown={stopFileActionEvent}
                    />
                  </Tooltip>
                </Popconfirm>
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={getFileIcon(file.mimeType)}
              title={file.fileName}
              description={
                <Space direction="vertical" size={0}>
                  <Space split="|">
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>
                      {new Date(file.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </Space>
                  {file.documentType && (
                    <span style={{ color: "#1890ff", fontSize: "12px" }}>
                      📄 {getDocumentTypeName(file.documentType)}
                    </span>
                  )}
                </Space>
              }
            />
          </List.Item>
        )}
      />

      {/* Модальное окно для выбора типа документа */}
      <Modal
        title="Выбор типа документа"
        open={documentTypeModalVisible}
        onOk={handleUploadWithDocumentType}
        onCancel={handleCancelDocumentType}
        okText="Загрузить"
        cancelText="Отмена"
        confirmLoading={uploading}
        width={500}
        centered
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            label="Тип документа"
            name="documentType"
            rules={[
              { required: true, message: "Пожалуйста, выберите тип документа" },
            ]}
          >
            <Select
              placeholder="Выберите тип документа"
              size="large"
              autoComplete="off"
            >
              {DOCUMENT_TYPES.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: "#f5f5f5",
              borderRadius: 4,
            }}
          >
            <strong>Выбрано файлов:</strong> {selectedFiles.length}
          </div>
        </Form>
      </Modal>

      {/* Встроенный просмотрщик файлов с увеличением */}
      <FileViewer
        visible={viewerVisible}
        fileUrl={viewingFile?.url}
        fileName={viewingFile?.name}
        mimeType={viewingFile?.mimeType}
        onClose={() => setState((prev) => ({ ...prev, viewerVisible: false }))}
        onDownload={handleDownloadFromViewer}
      />
    </Space>
  );
};

export default EmployeeFileUpload;
