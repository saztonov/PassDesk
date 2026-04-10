import { useState, useEffect, useCallback } from "react";
import { Modal, List, Button, Tooltip, Space, Spin } from "antd";
import {
  FileOutlined,
  EyeOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileExcelOutlined,
  FileWordOutlined,
} from "@ant-design/icons";
import { FileViewer } from "../../shared/ui/FileViewer";
import { employeeService } from "../../services/employeeService";

const EmployeeFilesModal = ({
  visible,
  employeeId,
  employeeName,
  onClose,
  onFilesUpdated,
}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const fetchFiles = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const response = await employeeService.getFiles(employeeId);
        const newFiles = response.data || [];

        // Проверяем, изменилось ли количество файлов
        if (files.length !== newFiles.length) {
          setFiles(newFiles);
          // Вызываем callback для обновления таблицы
          if (onFilesUpdated) {
            onFilesUpdated(newFiles.length);
          }
        } else if (!silent) {
          // Обновляем даже если количество не изменилось, но в явном виде (не silent)
          setFiles(newFiles);
        }
      } catch (error) {
        console.error("Error loading files:", error);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [employeeId, files.length, onFilesUpdated],
  );

  // Загрузка файлов при открытии модального окна
  useEffect(() => {
    if (visible && employeeId) {
      fetchFiles();
    }
  }, [visible, employeeId, fetchFiles]);

  // Периодическая проверка обновления файлов каждые 2 секунды
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      fetchFiles(true); // silent обновление без спинера
    }, 2000);

    return () => clearInterval(interval);
  }, [visible, fetchFiles]);

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith("image/")) {
      return <FileImageOutlined style={{ fontSize: 32, color: "#52c41a" }} />;
    } else if (mimeType.includes("pdf")) {
      return <FilePdfOutlined style={{ fontSize: 32, color: "#f5222d" }} />;
    } else if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return <FileExcelOutlined style={{ fontSize: 32, color: "#52c41a" }} />;
    } else if (mimeType.includes("word") || mimeType.includes("document")) {
      return <FileWordOutlined style={{ fontSize: 32, color: "#1890ff" }} />;
    }
    return <FileOutlined style={{ fontSize: 32, color: "#8c8c8c" }} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
    }
  };

  const handlePreview = async (file) => {
    // Открываем файл во встроенном просмотрщике с увеличением
    try {
      const response = await employeeService.getFileViewLink(
        employeeId,
        file.id,
      );
      if (response.data.viewUrl) {
        setViewingFile({
          url: response.data.viewUrl,
          name: file.fileName,
          mimeType: file.mimeType,
          fileId: file.id,
        });
        setViewerVisible(true);
      }
    } catch (error) {
      console.error("Error getting view link:", error);
    }
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
        }
      } catch (error) {
        console.error("Error getting download link:", error);
      }
    }
  };

  const getFileNameFromDisposition = (disposition) => {
    if (!disposition || typeof disposition !== "string") {
      return null;
    }
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]).replace(/"/g, "");
    }
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    return plainMatch?.[1] || null;
  };

  const handleDownloadAll = async () => {
    if (!employeeId || downloadingZip) {
      return;
    }

    try {
      setDownloadingZip(true);
      const response = await employeeService.downloadEmployeeFilesZip(employeeId);
      const blob = response?.data;
      if (!blob) {
        return;
      }

      const disposition =
        response?.headers?.["content-disposition"] ||
        response?.headers?.["Content-Disposition"];
      const extractedName = getFileNameFromDisposition(disposition);
      const fallbackName = `employee_files_${employeeId}.zip`;
      const fileName = extractedName || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading employee files zip:", error);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <>
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingRight: 28,
            }}
          >
            <span>{`Файлы сотрудника: ${employeeName}`}</span>
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                void handleDownloadAll();
              }}
              loading={downloadingZip}
              disabled={!files.length}
            >
              Сохранить все
            </Button>
          </div>
        }
        open={visible}
        onCancel={onClose}
        width={700}
        footer={[
          <Button key="close" onClick={onClose}>
            Закрыть
          </Button>,
        ]}
      >
        <Spin spinning={loading}>
          <List
            dataSource={files}
            locale={{ emptyText: "Нет загруженных файлов" }}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Tooltip key="preview" title="Просмотр">
                    <Button
                      icon={<EyeOutlined />}
                      size="small"
                      onClick={() => handlePreview(file)}
                    />
                  </Tooltip>,
                  <Tooltip key="download" title="Скачать">
                    <Button
                      icon={<DownloadOutlined />}
                      size="small"
                      onClick={() => handleDownload(file)}
                    />
                  </Tooltip>,
                ]}
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
        </Spin>
      </Modal>

      {/* Встроенный просмотрщик файлов с увеличением */}
      <FileViewer
        visible={viewerVisible}
        fileUrl={viewingFile?.url}
        fileName={viewingFile?.name}
        mimeType={viewingFile?.mimeType}
        onClose={() => setViewerVisible(false)}
        onDownload={handleDownloadFromViewer}
      />
    </>
  );
};

export default EmployeeFilesModal;
