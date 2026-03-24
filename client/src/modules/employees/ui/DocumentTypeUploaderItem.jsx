import { Button, List, Popconfirm, Space, Spin, Tooltip, Upload } from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  SUPPORTED_FORMATS,
} from "@/shared/constants/fileTypes";
import { getSampleUrl } from "@/modules/employees/lib/documentTypeUploaderUtils";

const ALLOWED_EXTENSION_SET = new Set(
  ALLOWED_EXTENSIONS.split(",").map((value) => value.trim().toLowerCase()),
);

const resolveFileExtension = (fileName = "") => {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  if (!normalizedName.includes(".")) {
    return "";
  }

  return `.${normalizedName.split(".").pop()}`;
};

const isHeicFamilyFile = (file) => {
  const mimeType = String(file?.type || "").trim().toLowerCase();
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

  const mimeType = String(file?.type || "").trim().toLowerCase();
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

const DocumentTypeUploaderItem = ({
  docType,
  filesOfType,
  readonly,
  employeeId,
  canEnsureEmployeeId = false,
  uploading,
  messageApi,
  onOpenSample,
  onUploadChange,
  onViewFile,
  onDownloadFile,
  onDeleteFile,
  compact = false,
}) => {
  const uploadDisabled = uploading || (!employeeId && !canEnsureEmployeeId);
  const countNode = uploading ? (
    <Spin size="small" />
  ) : (
    <>
      <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 4 }} />
      {filesOfType.length}
    </>
  );

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
            <span className="document-uploader-count">{countNode}</span>
          </div>
        </div>

        {!readonly ? (
          <div className="document-uploader-actions">
            <Upload
              accept={ALLOWED_EXTENSIONS}
              multiple={true}
              beforeUpload={(file) => validateUploadFile(file, messageApi)}
              onChange={(info) => onUploadChange(info, docType.value)}
              showUploadList={false}
              disabled={uploadDisabled}
            >
              <Button
                size="small"
                loading={uploading}
                className="document-uploader-button"
                disabled={uploadDisabled}
                icon={compact ? <UploadOutlined /> : undefined}
                block={compact}
              >
                {uploading ? "Загруз." : "Загрузить"}
              </Button>
            </Upload>
          </div>
        ) : null}
      </div>

      {filesOfType.length > 0 && (
        <div className="document-uploader-files">
          <List
            size="small"
            dataSource={filesOfType}
            renderItem={(file) => (
              <List.Item className={compact ? "document-uploader-file-item-compact" : ""}>
                <List.Item.Meta
                  title={
                    <span style={{ fontSize: "12px" }}>
                      {resolveDisplayName(file)}
                    </span>
                  }
                />
                {!readonly && (
                  <Space size="small">
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => onViewFile(file)}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => onDownloadFile(file)}
                    />
                    <Popconfirm
                      title="Удалить файл?"
                      description="Вы уверены, что хотите удалить этот файл?"
                      onConfirm={() => onDeleteFile(file.id)}
                      okText="Да"
                      cancelText="Отмена"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  </Space>
                )}
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default DocumentTypeUploaderItem;
