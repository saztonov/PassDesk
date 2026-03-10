import { useMemo, useRef, useState } from "react";
import { App, Button, Modal, Space, Typography } from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  CheckOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

const BASE_VIDEO_CONSTRAINTS = {
  facingMode: { ideal: "environment" },
  width: { ideal: 2560 },
  height: { ideal: 1440 },
};

const captureLayoutByMode = {
  passport: {
    helperText:
      "Заполните рамку разворотом паспорта почти целиком и держите телефон параллельно документу.",
    viewportAspect: 4 / 3,
    frameWidth: 0.68,
    frameHeight: 0.9,
    cropPadding: 0.05,
  },
  document: {
    helperText: "Поместите документ целиком в рамку и избегайте бликов.",
    viewportAspect: 3 / 4,
    frameWidth: 0.78,
    frameHeight: 0.68,
    cropPadding: 0.05,
  },
};

const loadImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть снимок"));
    image.src = dataUrl;
  });

const computeVisibleSourceRect = (sourceWidth, sourceHeight, viewportAspect) => {
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > viewportAspect) {
    const visibleWidth = sourceHeight * viewportAspect;
    return {
      x: (sourceWidth - visibleWidth) / 2,
      y: 0,
      width: visibleWidth,
      height: sourceHeight,
    };
  }

  const visibleHeight = sourceWidth / viewportAspect;
  return {
    x: 0,
    y: (sourceHeight - visibleHeight) / 2,
    width: sourceWidth,
    height: visibleHeight,
  };
};

const cropDataUrlByOverlay = async (dataUrl, layout) => {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const viewport = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    layout.viewportAspect,
  );
  const frameLeft = (1 - layout.frameWidth) / 2;
  const frameTop = (1 - layout.frameHeight) / 2;
  const padding = Math.min(viewport.width, viewport.height) * layout.cropPadding;

  const cropX = Math.max(0, viewport.x + viewport.width * frameLeft - padding);
  const cropY = Math.max(0, viewport.y + viewport.height * frameTop - padding);
  const cropRight = Math.min(
    sourceWidth,
    viewport.x + viewport.width * (frameLeft + layout.frameWidth) + padding,
  );
  const cropBottom = Math.min(
    sourceHeight,
    viewport.y + viewport.height * (frameTop + layout.frameHeight) + padding,
  );
  const cropWidth = Math.max(64, Math.round(cropRight - cropX));
  const cropHeight = Math.max(64, Math.round(cropBottom - cropY));

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas недоступен для кадрирования снимка");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось подготовить снимок"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.98,
    );
  });
};

const DocumentCaptureModal = ({
  open,
  mode = "document",
  onCancel,
  onCapture,
  onFallback,
}) => {
  const { message } = App.useApp();
  const webcamRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState("");
  const [cameraError, setCameraError] = useState("");

  const captureLayout = useMemo(
    () => captureLayoutByMode[mode] || captureLayoutByMode.document,
    [mode],
  );
  const videoConstraints = useMemo(
    () => ({
      ...BASE_VIDEO_CONSTRAINTS,
      aspectRatio:
        mode === "passport"
          ? { ideal: captureLayout.viewportAspect }
          : undefined,
    }),
    [captureLayout.viewportAspect, mode],
  );

  const resetPreview = () => {
    setCapturedDataUrl("");
    setCameraError("");
  };

  const handleTakePhoto = async () => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) {
      message.error("Не удалось получить кадр с камеры");
      return;
    }

    setCapturedDataUrl(dataUrl);
  };

  const handleConfirmCapture = async () => {
    if (!capturedDataUrl) {
      return;
    }

    setCapturing(true);
    try {
      const blob = await cropDataUrlByOverlay(capturedDataUrl, captureLayout);
      await onCapture?.(blob);
    } finally {
      setCapturing(false);
    }
  };

  const handleCameraError = () => {
    setCameraError(
      "Не удалось открыть live-камеру. Можно продолжить через системную камеру.",
    );
  };

  const handleUseFallback = () => {
    resetPreview();
    onFallback?.();
  };

  const handleClose = () => {
    resetPreview();
    onCancel?.();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title="Фото документа"
      destroyOnClose
      centered
      width={420}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 16,
          background: "#101418",
        }}
      >
        {capturedDataUrl ? (
          <img
            src={capturedDataUrl}
            alt="Предпросмотр документа"
            style={{
              display: "block",
              width: "100%",
              aspectRatio: `${captureLayout.viewportAspect}`,
              objectFit: "cover",
            }}
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={1}
            forceScreenshotSourceSize
            imageSmoothing
            minScreenshotWidth={1920}
            minScreenshotHeight={1080}
            videoConstraints={videoConstraints}
            onUserMediaError={handleCameraError}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: `${captureLayout.viewportAspect}`,
              objectFit: "cover",
            }}
          />
        )}

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            background:
              "linear-gradient(rgba(10,14,18,0.50), rgba(10,14,18,0.28))",
            opacity: capturedDataUrl ? 0.4 : 1,
          }}
        >
          <div
            style={{
              width: `${captureLayout.frameWidth * 100}%`,
              height: `${captureLayout.frameHeight * 100}%`,
              borderRadius: mode === "passport" ? 8 : 24,
              border: "2px solid rgba(255,255,255,0.94)",
              boxShadow:
                "0 0 0 999px rgba(6, 10, 14, 0.42), 0 0 0 1px rgba(255,255,255,0.18) inset",
              position: "relative",
            }}
          >
            {mode !== "passport" ? (
              <div
                style={{
                  position: "absolute",
                  inset: 14,
                  borderRadius: 18,
                  border: "1px dashed rgba(255,255,255,0.42)",
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <Typography.Text
        type="secondary"
        style={{ display: "block", marginTop: 12 }}
      >
        {cameraError || captureLayout.helperText}
      </Typography.Text>

      <Space style={{ width: "100%", justifyContent: "space-between", marginTop: 16 }}>
        {capturedDataUrl ? (
          <>
            <Button icon={<ReloadOutlined />} onClick={resetPreview}>
              Переснять
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={capturing}
              onClick={handleConfirmCapture}
            >
              Использовать
            </Button>
          </>
        ) : (
          <>
            <Button icon={<ReloadOutlined />} onClick={handleUseFallback}>
              Другой способ
            </Button>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              onClick={handleTakePhoto}
            >
              Снять
            </Button>
          </>
        )}
      </Space>
    </Modal>
  );
};

export default DocumentCaptureModal;
