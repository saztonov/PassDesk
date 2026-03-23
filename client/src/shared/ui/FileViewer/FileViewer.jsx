import { useEffect, useState } from "react";
import { Modal, Spin, Button, Space, message, Row, Col } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  DownloadOutlined,
  RotateLeftOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import styles from "./FileViewer.module.css";

/**
 * Универсальный компонент для просмотра файлов с возможностью увеличения
 * Поддерживает изображения и PDF
 */
export const FileViewer = ({
  fileUrl,
  fileName,
  mimeType,
  visible,
  onClose,
  onDownload,
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);

  // Определяем тип файла
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType?.includes("pdf");

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setZoom(100);
      setRotation(0);
    }
  }, [fileUrl, mimeType, visible]);

  // Обработчик увеличения
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 300));
  };

  // Обработчик уменьшения
  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  // Обработчик ротации
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Обработчик скачивания
  const handleDownloadFile = async () => {
    if (onDownload) {
      try {
        await onDownload();
      } catch (error) {
        message.error("Ошибка скачивания файла");
        console.error("Download error:", error);
      }
    }
  };

  // Сброс параметров при закрытии
  const handleClose = () => {
    setZoom(100);
    setRotation(0);
    onClose();
  };

  // Тулбар управления просмотром
  const toolbar = (
    <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
      <Col>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{fileName}</span>
      </Col>
      <Col>
        <Space size="small">
          {/* Процент увеличения */}
          <span style={{ minWidth: 60, textAlign: "center" }}>{zoom}%</span>

          {/* Кнопки управления */}
          <Button
            type="text"
            size="small"
            icon={<ZoomOutOutlined />}
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            title="Уменьшить"
          />
          <Button
            type="text"
            size="small"
            icon={<ZoomInOutlined />}
            onClick={handleZoomIn}
            disabled={zoom >= 300}
            title="Увеличить"
          />

          {/* Ротация для изображений */}
          {isImage && (
            <Button
              type="text"
              size="small"
              icon={<RotateLeftOutlined />}
              onClick={handleRotate}
              title="Повернуть на 90°"
            />
          )}

          {/* Скачивание */}
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownloadFile}
            title="Скачать файл"
          />

          {/* Закрыть */}
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={handleClose}
            title="Закрыть"
          />
        </Space>
      </Col>
    </Row>
  );

  // Отрендеренное изображение
  const renderImage = () => (
    <div className={styles.imageContainer}>
      <div
        className={styles.imageWrapper}
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          transition: "transform 0.2s ease-in-out",
        }}
      >
        <img
          src={fileUrl}
          alt={fileName}
          className={styles.image}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            message.error("Ошибка загрузки изображения");
          }}
        />
      </div>
    </div>
  );

  // Отрендеренный PDF
  const renderPdf = () => (
    <div className={styles.pdfContainer}>
      <object
        data={fileUrl}
        type="application/pdf"
        width="100%"
        height="100%"
        onLoad={() => setLoading(false)}
        className={styles.pdfObject}
        style={{
          transform: `scale(${zoom / 100})`,
          transition: "transform 0.2s ease-in-out",
        }}
      >
        <p>
          Не удалось загрузить PDF. <br />
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            Открыть в новой вкладке
          </a>
        </p>
      </object>
    </div>
  );

  // Неподдерживаемый тип файла
  const renderUnsupported = () => (
    <div className={styles.unsupportedContainer}>
      <p>Предпросмотр этого типа файла недоступен</p>
      <Button
        type="primary"
        icon={<DownloadOutlined />}
        onClick={handleDownloadFile}
      >
        Скачать файл
      </Button>
    </div>
  );

  return (
    <Modal
      title="Просмотр файла"
      open={visible}
      onCancel={handleClose}
      width="90vw"
      height="90vh"
      style={{
        maxWidth: "90vw",
        maxHeight: "90vh",
      }}
      styles={{
        body: {
          padding: 16,
          height: "calc(90vh - 110px)",
          overflow: "auto",
        },
      }}
      footer={null}
      centered={true}
      closable={false}
      wrapClassName={styles.fullscreenModal}
    >
      {/* Тулбар */}
      {toolbar}

      {/* Контент с загрузкой */}
      <Spin spinning={loading} tip="Загрузка...">
        <div className={styles.contentContainer}>
          {isImage && renderImage()}
          {isPdf && renderPdf()}
          {!isImage && !isPdf && renderUnsupported()}
        </div>
      </Spin>
    </Modal>
  );
};
