import { useState } from "react";
import {
  Alert,
  Button,
  List,
  Modal,
  Popconfirm,
  Spin,
  Space,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  SUPPORTED_FORMATS,
} from "@/shared/constants/fileTypes";
import { getSampleUrl } from "@/modules/employees/lib/documentTypeUploaderUtils";

const { Text } = Typography;
const { Dragger } = Upload;

const ALLOWED_EXTENSION_SET = new Set(
  ALLOWED_EXTENSIONS.split(",").map((value) => value.trim().toLowerCase()),
);

const resolveFileExtension = (fileName = "") => {
  const normalizedName = String(fileName || "")
    .trim()
    .toLowerCase();
  if (!normalizedName.includes(".")) {
    return "";
  }

  return `.${normalizedName.split(".").pop()}`;
};

const isHeicFamilyFile = (file) => {
  const mimeType = String(file?.type || "")
    .trim()
    .toLowerCase();
  const extension = resolveFileExtension(file?.name);

  return (
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    extension === ".heic" ||
    extension === ".heif"
  );
};

const resolveDisplayName = (file) =>
  file.fileName ||
  file.file_name ||
  file.filename ||
  file.original_name ||
  file.originalName ||
  "Неизвестный файл";

const validateUploadFile = (file, messageApi) => {
  if (isHeicFamilyFile(file)) {
    messageApi.error(
      `❌ ${file.name}: формат HEIC/HEIF пока не поддерживается\n✅ Конвертируйте фото в JPG/PNG и загрузите снова`,
    );
    return Upload.LIST_IGNORE;
  }

  const mimeType = String(file?.type || "")
    .trim()
    .toLowerCase();
  const extension = resolveFileExtension(file?.name);
  const isSupportedType =
    ALLOWED_MIME_TYPES.includes(mimeType) ||
    (extension && ALLOWED_EXTENSION_SET.has(extension));

  if (!isSupportedType) {
    messageApi.error(
      `❌ ${file.name}: неподдерживаемый тип файла\n✅ Поддерживаются: ${SUPPORTED_FORMATS}`,
    );
    return Upload.LIST_IGNORE;
  }

  const fileSizeMB = file.size / 1024 / 1024;
  if (fileSizeMB > 100) {
    messageApi.error(
      `❌ ${file.name}: размер файла ${fileSizeMB.toFixed(2)}MB превышает максимум 100MB`,
    );
    return Upload.LIST_IGNORE;
  }

  return false;
};

const stopRowClick = (event) => {
  event.stopPropagation();
};

const stopRowInteraction = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

const DocumentTypeUploaderItem = ({
  docType,
  filesOfType,
  readonly,
  employeeId,
  canEnsureEmployeeId = false,
  uploading,
  messageApi,
  onOpenSample,
  onUploadSubmit,
  onViewFile,
  onDownloadFile,
  onDeleteFile,
  onRerunOcr,
  ocrProcessingMap,
  compact = false,
  queuedCount = 0,
  uploadHint = null,
}) => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFileList, setPendingFileList] = useState([]);
  const uploadDisabled = uploading || (!employeeId && !canEnsureEmployeeId);
  const countNode = uploading ? (
    <Spin size="small" />
  ) : (
    <>
      <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 4 }} />
      {filesOfType.length}
    </>
  );

  const openUploadModal = () => {
    if (uploadDisabled) {
      return;
    }

    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (uploading) {
      return;
    }
    setUploadModalOpen(false);
    setPendingFileList([]);
  };

  const handleUpload = async () => {
    if (!pendingFileList.length || uploading) {
      return;
    }

    const isUploaded = await onUploadSubmit(pendingFileList, docType.value);
    if (isUploaded) {
      setUploadModalOpen(false);
      setPendingFileList([]);
    }
  };

  const handlePendingFilesChange = (info) => {
    setPendingFileList(info.fileList);
  };

  return (
    <div
      className={`document-uploader-item${compact ? " document-uploader-item-compact" : ""}`}
    >
      <div className="document-uploader-header">
        <div className="document-uploader-title-group">
          <span className="document-uploader-label">
            <Tooltip title={docType.label}>{docType.label}</Tooltip>
          </span>
          <div className="document-uploader-meta">
            <Tooltip
              title={
                getSampleUrl(docType)
                  ? "Показать образец документа"
                  : "Образец пока не добавлен"
              }
            >
              <Button
                type="text"
                size="small"
                className="document-uploader-info-button"
                icon={<InfoCircleOutlined />}
                onClick={() => onOpenSample(docType)}
              />
            </Tooltip>
            {queuedCount > 0 && (
              <Tooltip title="Файлы в очереди загрузки">
                <span
                  style={{
                    marginRight: 6,
                    color: "#1677ff",
                    fontWeight: 600,
                  }}
                >
                  +{queuedCount}
                </span>
              </Tooltip>
            )}
            <span className="document-uploader-count">{countNode}</span>
          </div>
        </div>

        {!readonly ? (
          <div className="document-uploader-actions">
            <Button
              size="small"
              loading={uploading}
              className="document-uploader-button"
              disabled={uploadDisabled}
              icon={compact ? <UploadOutlined /> : undefined}
              block={compact}
              onClick={openUploadModal}
            >
              {uploading ? "Загруз." : "Загрузить"}
            </Button>
            {uploadHint && !compact ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {uploadHint.status === "queued"
                  ? `В очереди: ${uploadHint.count}`
                  : `Загружено: ${uploadHint.doneCount || uploadHint.count}`}
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {filesOfType.length > 0 && (
        <div className="document-uploader-files">
          <List
            size="small"
            dataSource={filesOfType}
            renderItem={(file) => (
              <List.Item
                className={compact ? "document-uploader-file-item-compact" : ""}
                onClick={() => onViewFile(file)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onViewFile(file);
                  }
                }}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <List.Item.Meta
                  title={
                    <span
                      style={{
                        fontSize: "12px",
                        cursor: "pointer",
                        textDecoration: "underline dotted",
                        textUnderlineOffset: 2,
                      }}
                    >
                      {resolveDisplayName(file)}
                    </span>
                  }
                />
                <Space
                  size="small"
                  onClick={stopRowClick}
                  onMouseDown={stopRowInteraction}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={(event) => {
                      stopRowClick(event);
                      onViewFile(file);
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={(event) => {
                      stopRowClick(event);
                      onDownloadFile(file);
                    }}
                  />
                  {!readonly && typeof onRerunOcr === "function" ? (
                    <Tooltip title="Запустить распознавание заново">
                      <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={Boolean(ocrProcessingMap?.[file.id])}
                        onClick={(event) => {
                          stopRowClick(event);
                          onRerunOcr(file);
                        }}
                      />
                    </Tooltip>
                  ) : null}
                  {!readonly ? (
                    <Popconfirm
                      title="Удалить файл?"
                      description="Вы уверены, что хотите удалить этот файл?"
                      onConfirm={(event) => {
                        stopRowInteraction(event);
                        onDeleteFile(file.id);
                      }}
                      onCancel={stopRowInteraction}
                      okText="Да"
                      cancelText="Отмена"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={stopRowClick}
                        onMouseDown={stopRowInteraction}
                      />
                    </Popconfirm>
                  ) : null}
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {!readonly ? (
        <Modal
          title={`Загрузка документа: ${docType.label}`}
          open={uploadModalOpen}
          onCancel={closeUploadModal}
          onOk={handleUpload}
          okText={
            pendingFileList.length > 0
              ? `Загрузить (${pendingFileList.length})`
              : "Загрузить"
          }
          cancelText="Отмена"
          okButtonProps={{ disabled: pendingFileList.length === 0 }}
          confirmLoading={uploading}
          destroyOnClose
          centered
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={
                <Space direction="vertical" size={0}>
                  <Text type="secondary">Тип документа</Text>
                  <Text strong>{docType.label}</Text>
                </Space>
              }
            />

            <Dragger
              accept={ALLOWED_EXTENSIONS}
              multiple={true}
              fileList={pendingFileList}
              beforeUpload={(file) => validateUploadFile(file, messageApi)}
              onChange={handlePendingFilesChange}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">Перетащите файлы сюда</p>
              <p className="ant-upload-hint">
                или нажмите, чтобы выбрать файлы
              </p>
            </Dragger>

            <Text type="secondary" style={{ fontSize: 12 }}>
              Поддерживаемые форматы: {SUPPORTED_FORMATS} (макс. 100 МБ)
            </Text>
          </Space>
        </Modal>
      ) : null}
    </div>
  );
};

export default DocumentTypeUploaderItem;
