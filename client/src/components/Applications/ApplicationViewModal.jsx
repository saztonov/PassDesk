import { useState, useEffect, useCallback } from "react";
import { Modal, Spin, Typography, Button, Space, Card, App } from "antd";
import {
  FileWordOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { applicationService } from "../../services/applicationService";
import { fileService } from "../../services/fileService";
import BiometricTable from "./BiometricTable";
import dayjs from "dayjs";

const { Title, Text } = Typography;

const ApplicationViewModal = ({ visible, applicationId, onCancel }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [application, setApplication] = useState(null);

  const fetchApplication = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await applicationService.getById(applicationId);
      setApplication(data.data);
    } catch (error) {
      message.error("Ошибка при загрузке заявки");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [applicationId, message]);

  useEffect(() => {
    if (visible && applicationId) {
      fetchApplication();
    }
  }, [visible, applicationId, fetchApplication]);

  const handleExport = async () => {
    try {
      setLoading(true);
      const response = await applicationService.exportToWord(applicationId);

      // Создаем ссылку для скачивания
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Заявка_${application.applicationNumber}.docx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success("Файл успешно экспортирован");
    } catch (error) {
      message.error("Ошибка при экспорте файла");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Обработчик просмотра скана заявки
  const handleViewScan = async () => {
    if (!application?.scanFile?.id) {
      message.error("Файл не найден");
      return;
    }

    try {
      // Используем ID файла для получения ссылки
      const response = await fileService.getFileUrlById(
        application.scanFile.id,
      );
      window.open(response.data.url, "_blank");
    } catch (error) {
      message.error("Ошибка при открытии файла");
      console.error(error);
    }
  };

  // Обработчик скачивания скана заявки
  const handleDownloadScan = async () => {
    if (!application?.scanFile?.id) {
      message.error("Файл не найден");
      return;
    }

    try {
      const response = await fileService.getFileUrlById(
        application.scanFile.id,
      );
      const link = document.createElement("a");
      link.href = response.data.url;
      link.download =
        application.scanFile.originalName ||
        application.scanFile.fileName ||
        "application-scan.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      message.success("Файл скачивается");
    } catch (error) {
      message.error("Ошибка при скачивании файла");
      console.error(error);
    }
  };

  const isBiometric = application?.applicationType === "biometric";

  return (
    <Modal
      title={
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              paddingRight: "40px",
            }}
          >
            <span>{`Заявка ${application?.applicationNumber || ""}`}</span>
            {application?.passValidUntil && (
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "normal",
                  color: "#666",
                }}
              >
                Действует до:{" "}
                {dayjs(application.passValidUntil).format("DD.MM.YYYY")}
              </span>
            )}
          </div>
          {application?.scanFile && (
            <div style={{ fontSize: "14px", fontWeight: "normal" }}>
              <Space>
                <span>Скан заявки:</span>
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={handleViewScan}
                >
                  Просмотр
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadScan}
                >
                  Скачать
                </Button>
              </Space>
            </div>
          )}
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={1200}
      footer={
        isBiometric ? (
          <Space>
            <Button onClick={onCancel}>Закрыть</Button>
            <Button
              type="primary"
              icon={<FileWordOutlined />}
              onClick={handleExport}
              loading={loading}
            >
              Экспорт в Word
            </Button>
          </Space>
        ) : (
          <Button onClick={onCancel}>Закрыть</Button>
        )
      }
    >
      <Spin spinning={loading}>
        {application && (
          <div>
            {/* Примечания к заявке */}
            {application.notes && (
              <Card
                size="small"
                title="Примечания"
                style={{ marginBottom: 16 }}
                styles={{ body: { padding: "12px" } }}
              >
                <Text style={{ whiteSpace: "pre-wrap" }}>
                  {application.notes}
                </Text>
              </Card>
            )}

            {isBiometric &&
              application.employees &&
              application.employees.length > 0 && (
                <BiometricTable
                  employees={application.employees}
                  applicationNumber={application.applicationNumber}
                />
              )}

            {!isBiometric && (
              <div>
                <Title level={5}>
                  Сотрудники: {application.employees?.length || 0}
                </Title>
                {/* Здесь будет отображение файлов для типа "Заказчик" в будущем */}
              </div>
            )}
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default ApplicationViewModal;
