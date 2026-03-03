import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Space } from "antd";
import {
  CameraOutlined,
  RetweetOutlined,
  SaveOutlined,
} from "@ant-design/icons";

const buildFrameStyle = (frame) => ({
  position: "absolute",
  top: `${frame.top * 100}%`,
  left: `${frame.left * 100}%`,
  width: `${frame.width * 100}%`,
  height: `${frame.height * 100}%`,
  border: "2px dashed rgba(82, 196, 26, 0.95)",
  borderRadius: 14,
  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.35)",
  pointerEvents: "none",
});

const resolveCoveredVideoGeometry = ({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
}) => {
  const sourceAspect = sourceWidth / sourceHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  if (viewportAspect > sourceAspect) {
    const renderedWidth = viewportWidth;
    const renderedHeight = viewportWidth / sourceAspect;
    return {
      renderedWidth,
      renderedHeight,
      offsetX: 0,
      offsetY: (viewportHeight - renderedHeight) / 2,
    };
  }

  const renderedHeight = viewportHeight;
  const renderedWidth = viewportHeight * sourceAspect;
  return {
    renderedWidth,
    renderedHeight,
    offsetX: (viewportWidth - renderedWidth) / 2,
    offsetY: 0,
  };
};

const captureVideoFrame = async ({
  video,
  frame,
  mimeType = "image/jpeg",
  viewportWidth,
  viewportHeight,
}) => {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Видео с камеры еще не готово");
  }

  const safeViewportWidth = Math.max(1, viewportWidth || video.clientWidth || sourceWidth);
  const safeViewportHeight = Math.max(
    1,
    viewportHeight || video.clientHeight || sourceHeight,
  );
  const geometry = resolveCoveredVideoGeometry({
    sourceWidth,
    sourceHeight,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
  });

  const frameLeftPx = safeViewportWidth * frame.left;
  const frameTopPx = safeViewportHeight * frame.top;
  const frameWidthPx = safeViewportWidth * frame.width;
  const frameHeightPx = safeViewportHeight * frame.height;

  const visibleLeft = frameLeftPx - geometry.offsetX;
  const visibleTop = frameTopPx - geometry.offsetY;
  const scaleX = sourceWidth / geometry.renderedWidth;
  const scaleY = sourceHeight / geometry.renderedHeight;

  const cropX = Math.max(0, Math.round(visibleLeft * scaleX));
  const cropY = Math.max(0, Math.round(visibleTop * scaleY));
  const cropWidth = Math.min(
    sourceWidth - cropX,
    Math.max(1, Math.round(frameWidthPx * scaleX)),
  );
  const cropHeight = Math.min(
    sourceHeight - cropY,
    Math.max(1, Math.round(frameHeightPx * scaleY)),
  );

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas context недоступен");
  }

  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.96);
  });

  if (!blob) {
    throw new Error("Не удалось сохранить снимок");
  }

  const previewUrl = canvas.toDataURL(mimeType, 0.96);
  return { blob, previewUrl };
};

export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  mode = "document",
}) => {
  const videoRef = useRef(null);
  const viewportRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const isPassportMode = mode === "passport";
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const scanFrame = useMemo(() => {
    if (isPassportMode) {
      return isMobileViewport
        ? { top: 0.24, left: 0.08, width: 0.84, height: 0.5 }
        : { top: 0.16, left: 0.16, width: 0.68, height: 0.58 };
    }

    return isMobileViewport
      ? { top: 0.09, left: 0.08, width: 0.84, height: 0.8 }
      : { top: 0.08, left: 0.2, width: 0.6, height: 0.82 };
  }, [isMobileViewport, isPassportMode]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
    setCapturedBlob(null);
  }, []);

  useEffect(() => {
    if (!visible || capturedImage) {
      return undefined;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Камера не поддерживается в этом браузере");
        return;
      }

      setCameraError("");
      setCameraReady(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        if (!cancelled) {
          setCameraReady(true);
        }
      } catch (error) {
        console.error("Failed to start custom document scanner:", error);
        setCameraError(
          "Не удалось открыть камеру. Проверь разрешение браузера и HTTPS.",
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [capturedImage, stopStream, visible]);

  useEffect(() => {
    if (!visible) {
      resetCapture();
      setCameraError("");
      stopStream();
    }
  }, [resetCapture, stopStream, visible]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || saving || !cameraReady) {
      return;
    }

    try {
      const { blob, previewUrl } = await captureVideoFrame({
        video: videoRef.current,
        frame: scanFrame,
        viewportWidth: viewportRef.current?.clientWidth,
        viewportHeight: viewportRef.current?.clientHeight,
      });
      setCapturedBlob(blob);
      setCapturedImage(previewUrl);
      stopStream();
    } catch (error) {
      console.error("Failed to capture custom scanner image:", error);
      setCameraError("Не удалось снять фото. Попробуйте еще раз.");
    }
  }, [cameraReady, saving, scanFrame, stopStream]);

  const handleRetake = useCallback(() => {
    resetCapture();
    setCameraError("");
  }, [resetCapture]);

  const handleSave = useCallback(async () => {
    if (!capturedBlob || saving) {
      return;
    }

    setSaving(true);
    try {
      await onCapture(capturedBlob);
      onCancel();
    } finally {
      setSaving(false);
    }
  }, [capturedBlob, onCancel, onCapture, saving]);

  const handleClose = useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <Modal
      title={isPassportMode ? "Фото паспорта" : "Фото документа"}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={isMobileViewport ? "100vw" : 860}
      centered={!isMobileViewport}
      style={isMobileViewport ? { top: 0, maxWidth: "100vw", paddingBottom: 0 } : undefined}
      styles={{
        body: {
          padding: isMobileViewport ? 8 : 12,
          maxHeight: isMobileViewport ? "calc(100vh - 56px)" : undefined,
          overflowY: isMobileViewport ? "auto" : undefined,
        },
      }}
      destroyOnHidden
      maskClosable={false}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {cameraError ? (
          <Alert type="error" showIcon message={cameraError} />
        ) : null}

        {!capturedImage ? (
          <div
            ref={viewportRef}
            style={{
              position: "relative",
              width: "100%",
              borderRadius: 12,
              overflow: "hidden",
              background: "#000",
              minHeight: isMobileViewport ? 420 : 520,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "cover",
                background: "#000",
              }}
            />
            <div style={buildFrameStyle(scanFrame)} />
            {!cameraReady ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 14,
                  background: "rgba(0, 0, 0, 0.35)",
                }}
              >
                Открываем камеру...
              </div>
            ) : null}
          </div>
        ) : (
          <img
            src={capturedImage}
            alt="scan-preview"
            style={{
              width: "100%",
              borderRadius: 12,
              maxHeight: isMobileViewport ? "60vh" : "68vh",
              objectFit: "contain",
              background: "#111",
            }}
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
          {!capturedImage ? (
            <>
              <div
                style={{
                  width: "100%",
                  textAlign: "center",
                  color: "#8c8c8c",
                  fontSize: 12,
                }}
              >
                Поместите документ в рамку. Снимок будет сохранен по области рамки.
              </div>
              <Button
                type="primary"
                icon={<CameraOutlined />}
                onClick={handleCapture}
                loading={saving}
                disabled={!cameraReady}
                block={isMobileViewport}
              >
                Снять
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<RetweetOutlined />}
                onClick={handleRetake}
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
