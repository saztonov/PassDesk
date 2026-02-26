import { useCallback, useMemo, useRef, useState } from "react";
import { Button, Modal, Space } from "antd";
import {
  CameraOutlined,
  RotateRightOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";

const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

const buildFrameStyle = (frame) => ({
  position: "absolute",
  top: `${frame.top * 100}%`,
  left: `${frame.left * 100}%`,
  width: `${frame.width * 100}%`,
  height: `${frame.height * 100}%`,
  border: "2px dashed rgba(82, 196, 26, 0.9)",
  borderRadius: 10,
  pointerEvents: "none",
});

const cropByFrame = async (dataUrl, frame) => {
  const img = await loadImageFromDataUrl(dataUrl);
  const sx = Math.max(0, Math.floor(img.width * frame.left));
  const sy = Math.max(0, Math.floor(img.height * frame.top));
  const sw = Math.max(1, Math.floor(img.width * frame.width));
  const sh = Math.max(1, Math.floor(img.height * frame.height));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create image blob"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
};

export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  mode = "document",
}) => {
  const webcamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [saving, setSaving] = useState(false);

  const isPassportMode = mode === "passport";
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const scanFrame = useMemo(() => {
    // Нормализованные координаты рамки (доли от размера кадра).
    if (isPassportMode) {
      return isMobileViewport
        ? { top: 0.26, left: 0.08, width: 0.84, height: 0.48 }
        : { top: 0.18, left: 0.12, width: 0.76, height: 0.56 };
    }

    return isMobileViewport
      ? { top: 0.12, left: 0.1, width: 0.8, height: 0.74 }
      : { top: 0.1, left: 0.16, width: 0.68, height: 0.78 };
  }, [isMobileViewport, isPassportMode]);

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
  }, []);

  const videoConstraints = useMemo(
    () => ({
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }),
    [],
  );

  const handleCapture = useCallback(() => {
    if (!webcamRef.current || saving) {
      return;
    }

    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      return;
    }

    setCapturedImage(screenshot);
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!capturedImage || saving) {
      return;
    }

    setSaving(true);
    try {
      let blob;
      try {
        blob = await cropByFrame(capturedImage, scanFrame);
      } catch (error) {
        console.error("Document crop error:", error);
        blob = await fetch(capturedImage).then((res) => res.blob());
      }
      onCapture(blob);
      onCancel();
    } finally {
      setSaving(false);
    }
  }, [capturedImage, onCancel, onCapture, saving, scanFrame]);

  return (
    <Modal
      title={isPassportMode ? "Фото паспорта" : "Сканирование документа"}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={isMobileViewport ? "100vw" : 840}
      centered={!isMobileViewport}
      style={
        isMobileViewport ? { top: 0, maxWidth: "100vw", paddingBottom: 0 } : undefined
      }
      styles={{
        body: {
          padding: isMobileViewport ? 8 : 12,
          maxHeight: isMobileViewport ? "calc(100vh - 56px)" : undefined,
          overflowY: isMobileViewport ? "auto" : undefined,
        },
      }}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {!capturedImage ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
              maxHeight: isMobileViewport ? "calc(100vh - 240px)" : undefined,
            }}
          >
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                maxHeight: isMobileViewport ? "calc(100vh - 240px)" : undefined,
                objectFit: "cover",
              }}
            />
            <div
              style={buildFrameStyle(scanFrame)}
            />
          </div>
        ) : (
          <img
            src={capturedImage}
            alt="scan-preview"
            style={{ width: "100%", borderRadius: 8, maxHeight: "62vh", objectFit: "contain" }}
          />
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {!capturedImage && (
            <div
              style={{
                width: "100%",
                textAlign: "center",
                color: "#8c8c8c",
                fontSize: 12,
              }}
            >
              Поместите документ в рамку. При сохранении кадр будет обрезан по ней.
            </div>
          )}
          {!capturedImage ? (
            <Button
              type="primary"
              icon={<CameraOutlined />}
              onClick={handleCapture}
              loading={saving}
              block={isMobileViewport}
            >
              Снять
            </Button>
          ) : (
            <>
              <Button
                icon={<RotateRightOutlined />}
                onClick={resetCapture}
                style={isMobileViewport ? { flex: 1 } : undefined}
              >
                Переснять
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
                style={isMobileViewport ? { flex: 1 } : undefined}
              >
                Сохранить
              </Button>
            </>
          )}
        </div>
      </Space>
    </Modal>
  );
};
