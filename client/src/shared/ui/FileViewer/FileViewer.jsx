import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Spin, Button, Space, message, Row, Col } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  DownloadOutlined,
  RotateLeftOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import styles from "./FileViewer.module.css";

const ZOOM_MIN = 50;
const ZOOM_MAX = 300;
const ZOOM_STEP = 10;
const IMAGE_VIEWER_PADDING = 48;

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
  const [imageNaturalSize, setImageNaturalSize] = useState({
    width: 0,
    height: 0,
  });
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });
  const contentRef = useRef(null);

  // Определяем тип файла
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType?.includes("pdf");
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn =
    normalizedRotation === 90 || normalizedRotation === 270;

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setZoom(100);
      setRotation(0);
      setImageNaturalSize({
        width: 0,
        height: 0,
      });
    }
  }, [fileUrl, mimeType, visible]);

  useEffect(() => {
    if (!visible || !contentRef.current) {
      return undefined;
    }

    const element = contentRef.current;
    const updateViewportSize = () => {
      const bounds = element.getBoundingClientRect();
      setViewportSize({
        width: bounds.width,
        height: bounds.height,
      });
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(() => {
      updateViewportSize();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [visible]);

  // Обработчик увеличения
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  };

  // Обработчик уменьшения
  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
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

  const fitScale = useMemo(() => {
    if (
      !isImage ||
      !imageNaturalSize.width ||
      !imageNaturalSize.height ||
      !viewportSize.width ||
      !viewportSize.height
    ) {
      return 1;
    }

    const sourceWidth = isQuarterTurn
      ? imageNaturalSize.height
      : imageNaturalSize.width;
    const sourceHeight = isQuarterTurn
      ? imageNaturalSize.width
      : imageNaturalSize.height;
    const availableWidth = Math.max(viewportSize.width - IMAGE_VIEWER_PADDING, 1);
    const availableHeight = Math.max(
      viewportSize.height - IMAGE_VIEWER_PADDING,
      1,
    );

    return Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1);
  }, [
    imageNaturalSize.height,
    imageNaturalSize.width,
    isImage,
    isQuarterTurn,
    viewportSize.height,
    viewportSize.width,
  ]);

  const imageLayout = useMemo(() => {
    if (!isImage || !imageNaturalSize.width || !imageNaturalSize.height) {
      return null;
    }

    const scale = fitScale * (zoom / 100);
    const baseWidth = Math.max(1, Math.round(imageNaturalSize.width * scale));
    const baseHeight = Math.max(1, Math.round(imageNaturalSize.height * scale));
    const frameWidth = isQuarterTurn ? baseHeight : baseWidth;
    const frameHeight = isQuarterTurn ? baseWidth : baseHeight;

    return {
      baseWidth,
      baseHeight,
      frameWidth,
      frameHeight,
    };
  }, [fitScale, imageNaturalSize.height, imageNaturalSize.width, isImage, isQuarterTurn, zoom]);

  const pdfUrl = useMemo(() => {
    if (!isPdf || !fileUrl) {
      return fileUrl;
    }

    const cleanUrl = String(fileUrl).split("#")[0];
    return `${cleanUrl}#toolbar=0&navpanes=0&scrollbar=1&zoom=${zoom}`;
  }, [fileUrl, isPdf, zoom]);

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
            disabled={zoom <= ZOOM_MIN}
            title="Уменьшить"
          />
          <Button
            type="text"
            size="small"
            icon={<ZoomInOutlined />}
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_MAX}
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
    <div className={styles.imageContainer} ref={contentRef}>
      <div
        className={styles.imageCanvas}
        style={{
          width: imageLayout
            ? `${Math.max(imageLayout.frameWidth, viewportSize.width || 0)}px`
            : "100%",
          height: imageLayout
            ? `${Math.max(imageLayout.frameHeight, viewportSize.height || 0)}px`
            : "100%",
        }}
      >
        <div
          className={styles.imageFrame}
          style={{
            width: imageLayout ? `${imageLayout.frameWidth}px` : undefined,
            height: imageLayout ? `${imageLayout.frameHeight}px` : undefined,
          }}
        >
        <img
          src={fileUrl}
          alt={fileName}
          className={styles.image}
          style={{
            width: imageLayout ? `${imageLayout.baseWidth}px` : undefined,
            height: imageLayout ? `${imageLayout.baseHeight}px` : undefined,
            transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg)`,
          }}
          onLoad={(event) => {
            setImageNaturalSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
            setLoading(false);
          }}
          onError={() => {
            setLoading(false);
            message.error("Ошибка загрузки изображения");
          }}
        />
      </div>
      </div>
    </div>
  );

  // Отрендеренный PDF
  const renderPdf = () => (
    <div className={styles.pdfContainer} ref={contentRef}>
      <iframe
        src={pdfUrl}
        title={fileName}
        className={styles.pdfFrame}
        onLoad={() => setLoading(false)}
      />
      <object
        data={pdfUrl}
        type="application/pdf"
        width="0"
        height="0"
        className={styles.pdfFallback}
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
