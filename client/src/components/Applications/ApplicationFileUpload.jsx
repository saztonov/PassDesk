import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  Button,
  List,
  Popconfirm,
  message,
  Space,
  Tooltip,
} from "antd";
import {
  UploadOutlined,
  DeleteOutlined,
  FileOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { FileViewer } from "../../shared/ui/FileViewer";
import { applicationService } from "../../services/applicationService";

const ApplicationFileUpload = ({
  applicationId,
  readonly = false,
  onFilesChange,
}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await applicationService.getFiles(applicationId);
      const filesList = response.data.data || [];
      setFiles(filesList);

      // Уведомляем родителя об изменении количества файлов
      if (onFilesChange) {
        onFilesChange(filesList.length);
      }
    } catch (error) {
      console.error("Error loading files:", error);
      message.error("Ошибка загрузки списка файлов");
    } finally {
      setLoading(false);
    }
  }, [applicationId, onFilesChange]);

  useEffect(() => {
    if (applicationId) {
      fetchFiles();
    }
  }, [applicationId, fetchFiles]);

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning("Выберите файлы для загрузки");
      return;
    }

    const formData = new FormData();
    fileList.forEach((fileObj) => {
      const actualFile = fileObj.originFileObj || fileObj;
      formData.append("files", actualFile);
    });

    setUploading(true);
    try {
      await applicationService.uploadFiles(applicationId, formData);
      message.success("Файлы успешно загружены");
      setFileList([]);
      fetchFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      message.error(error.response?.data?.message || "Ошибка загрузки файлов");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    try {
      await applicationService.deleteFile(applicationId, fileId);
      message.success("Файл удален");
      fetchFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      message.error("Ошибка удаления файла");
    }
  };

  const handleDownload = async (file) => {
    try {
      const response = await applicationService.getFileDownloadLink(
        applicationId,
        file.id,
      );
      if (response.data.data.downloadUrl) {
        // S3 URL теперь имеет правильный заголовок Content-Disposition от бэкэнда
        window.open(response.data.data.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Error getting download link:", error);
      message.error("Ошибка получения ссылки для скачивания");
    }
  };

  const handleView = async (file) => {
    // Открываем файл во встроенном просмотрщике с увеличением
    try {
      const response = await applicationService.getFileViewLink(
        applicationId,
        file.id,
      );
      if (response.data.data.viewUrl) {
        setViewingFile({
          url: response.data.data.viewUrl,
          name: file.originalName,
          mimeType: file.mimeType,
          fileId: file.id,
        });
        setViewerVisible(true);
      }
    } catch (error) {
      console.error("Error getting view link:", error);
      message.error("Ошибка получения ссылки для просмотра");
    }
  };

  // Скачивание файла из просмотрщика
  const handleDownloadFromViewer = async () => {
    if (viewingFile) {
      try {
        const response = await applicationService.getFileDownloadLink(
          applicationId,
          viewingFile.fileId,
        );
        if (response.data.data.downloadUrl) {
          // S3 URL теперь имеет правильный заголовок Content-Disposition от бэкэнда
          window.open(response.data.data.downloadUrl, "_blank");
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
    }
    return <FileOutlined style={{ fontSize: 24, color: "#8c8c8c" }} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const uploadProps = {
    multiple: true,
    accept: ".jpg,.jpeg,.png,.pdf",
    fileList: fileList,
    beforeUpload: (file) => {
      // Проверка размера файла (макс. 100 МБ)
      const isLt10M = file.size / 1024 / 1024 < 100;
      if (!isLt10M) {
        message.error(`${file.name}: размер файла превышает 100 МБ`);
        return Upload.LIST_IGNORE;
      }

      // Проверка типа файла
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "application/pdf",
      ];

      if (!allowedTypes.includes(file.type)) {
        message.error(`${file.name}: неподдерживаемый тип файла`);
        return Upload.LIST_IGNORE;
      }

      return false; // Не загружать автоматически
    },
    onChange: (info) => {
      // Обновляем fileList при изменениях
      setFileList(info.fileList);
    },
    onRemove: () => {
      return true; // Разрешить удаление
    },
    showUploadList: true,
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      {!readonly && (
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
              onClick={handleUpload}
            >
              Загрузить {fileList.length} файл(ов)
            </Button>
          )}
          <div style={{ color: "#8c8c8c", fontSize: "12px" }}>
            Поддерживаемые форматы: JPG, PNG, PDF (макс. 10 МБ)
          </div>
        </Space>
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
                  onClick={() => handleView(file)}
                />
              </Tooltip>,
              <Tooltip key="download" title="Скачать">
                <Button
                  icon={<DownloadOutlined />}
                  size="small"
                  onClick={() => handleDownload(file)}
                />
              </Tooltip>,
              !readonly && (
                <Popconfirm
                  key="delete"
                  title="Удалить файл?"
                  description="Это действие нельзя отменить"
                  onConfirm={() => handleDelete(file.id)}
                  okText="Удалить"
                  cancelText="Отмена"
                >
                  <Tooltip title="Удалить">
                    <Button icon={<DeleteOutlined />} size="small" danger />
                  </Tooltip>
                </Popconfirm>
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={getFileIcon(file.mimeType)}
              title={file.fileName}
              description={
                <Space split="|">
                  <span>{formatFileSize(file.fileSize)}</span>
                  <span>
                    {new Date(file.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </Space>
              }
            />
          </List.Item>
        )}
      />

      {/* Встроенный просмотрщик файлов с увеличением */}
      <FileViewer
        visible={viewerVisible}
        fileUrl={viewingFile?.url}
        fileName={viewingFile?.name}
        mimeType={viewingFile?.mimeType}
        onClose={() => setViewerVisible(false)}
        onDownload={handleDownloadFromViewer}
      />
    </Space>
  );
};

export default ApplicationFileUpload;
