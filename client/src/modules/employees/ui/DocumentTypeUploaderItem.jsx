import { Button, List, Popconfirm, Space, Spin, Tooltip, Upload } from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  SUPPORTED_FORMATS,
} from "@/shared/constants/fileTypes";
import { getSampleUrl } from "@/modules/employees/lib/documentTypeUploaderUtils";

const resolveDisplayName = (file) =>
  file.fileName ||
  file.file_name ||
  file.filename ||
  file.original_name ||
  file.originalName ||
  "Неизвестный файл";

const validateUploadFile = (file, messageApi) => {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
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
}) => {
  const uploadDisabled = uploading || (!employeeId && !canEnsureEmployeeId);

  return (
    <div className="document-uploader-item">
      <div className="document-uploader-header">
        <span className="document-uploader-label">
          <Tooltip title={docType.label}>{docType.label}</Tooltip>
        </span>
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

        {!readonly ? (
          <>
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
              >
                {uploading ? "Загруз." : "Загрузить"}
              </Button>
            </Upload>

            <span className="document-uploader-count">
              {uploading ? (
                <Spin size="small" />
              ) : (
                <>
                  <CheckCircleOutlined
                    style={{ color: "#52c41a", marginRight: 4 }}
                  />
                  {filesOfType.length}
                </>
              )}
            </span>
          </>
        ) : (
          <span className="document-uploader-count">
            <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 4 }} />
            {filesOfType.length}
          </span>
        )}
      </div>

      {filesOfType.length > 0 && (
        <div className="document-uploader-files">
          <List
            size="small"
            dataSource={filesOfType}
            renderItem={(file) => (
              <List.Item>
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
