import { useMemo, useRef, useState } from "react";
import { App, Button, Modal, Space, Typography } from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  CheckOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

const videoConstraints = {
  facingMode: { ideal: "environment" },
};

const overlayCopyByMode = {
  passport: "Совместите разворот паспорта с рамкой и держите камеру ровно.",
  document: "Поместите документ целиком в рамку и избегайте бликов.",
};

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
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

  const helperText = useMemo(
    () => overlayCopyByMode[mode] || overlayCopyByMode.document,
    [mode],
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
      const blob = await dataUrlToBlob(capturedDataUrl);
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
              aspectRatio: "3 / 4",
              objectFit: "cover",
            }}
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.95}
            videoConstraints={videoConstraints}
            onUserMediaError={handleCameraError}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "3 / 4",
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
              width: "78%",
              height: mode === "passport" ? "58%" : "68%",
              borderRadius: 24,
              border: "2px solid rgba(255,255,255,0.94)",
              boxShadow:
                "0 0 0 999px rgba(6, 10, 14, 0.42), 0 0 0 1px rgba(255,255,255,0.18) inset",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 14,
                borderRadius: 18,
                border: "1px dashed rgba(255,255,255,0.42)",
              }}
            />
          </div>
        </div>
      </div>

      <Typography.Text
        type="secondary"
        style={{ display: "block", marginTop: 12 }}
      >
        {cameraError || helperText}
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
