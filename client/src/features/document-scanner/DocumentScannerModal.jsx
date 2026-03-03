import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Tag } from "antd";
import {
  CameraOutlined,
  RetweetOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { ScannerDoc } from "@/vendor/scannerdoc";

const syncCanvasSize = (canvas) => {
  if (!canvas) {
    return;
  }

  const width = Math.max(1, Math.round(canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(canvas.clientHeight || 1));
  const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const targetWidth = Math.max(1, Math.round(width * pixelRatio));
  const targetHeight = Math.max(1, Math.round(height * pixelRatio));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

const clearCanvas = (canvas) => {
  const context = canvas?.getContext?.("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
};

const buildStatusMeta = (confidence) => {
  if (confidence >= 0.55) {
    return {
      color: "success",
      label: "Контур найден",
      hint: "Сканер видит документ и выровняет снимок по углам.",
    };
  }

  if (confidence >= 0.25) {
    return {
      color: "warning",
      label: "Контур ищется",
      hint: "Подровняйте документ, чтобы все 4 угла попали в кадр.",
    };
  }

  return {
    color: "default",
    label: "Нет контура",
    hint: "Положите документ на контрастный фон и держите камеру ровно сверху.",
  };
};

const buildCameraErrorMessage = (error) => {
  const errorName = String(error?.name || "");
  const errorMessage = String(error?.message || "").trim();

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Браузер отклонил доступ к камере. Проверь разрешение для сайта в настройках браузера.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Камера уже занята другим приложением или браузер не смог получить видеопоток.";
  }

  if (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError") {
    return "Телефон не поддержал запрошенный режим камеры. Переключил сканер на более совместимый режим.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "На устройстве не найдена доступная камера.";
  }

  if (errorMessage) {
    return `Не удалось открыть камеру в режиме сканера: ${errorMessage}`;
  }

  return "Не удалось открыть камеру в режиме сканера. Попробуй еще раз; если не поможет, используем запасной режим.";
};

export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  onFallback,
  mode = "document",
}) => {
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const scannerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [detection, setDetection] = useState({ confidence: 0, processingMs: 0 });

  const isPassportMode = mode === "passport";
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const statusMeta = useMemo(
    () => buildStatusMeta(detection.confidence),
    [detection.confidence],
  );

  const stopScanner = useCallback(() => {
    resizeObserverRef.current?.disconnect?.();
    resizeObserverRef.current = null;

    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    clearCanvas(previewCanvasRef.current);
    setCameraReady(false);
    setDetection({ confidence: 0, processingMs: 0 });
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

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Камера не поддерживается в этом браузере");
        return;
      }

      setCameraError("");
      setCameraReady(false);
      setDetection({ confidence: 0, processingMs: 0 });
      syncCanvasSize(previewCanvasRef.current);

      try {
        const scanner = new ScannerDoc({
          video: videoRef.current,
          previewCanvas: previewCanvasRef.current,
          detectIntervalMs: 120,
          detectionWidth: isMobileViewport ? 360 : 480,
          smoothing: 0.72,
          constraints: {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 2560 },
              height: { ideal: 1440 },
            },
          },
          onDetect: (result) => {
            if (cancelled) {
              return;
            }
            setDetection({
              confidence: result.confidence,
              processingMs: result.processingMs,
            });
          },
        });

        scannerRef.current = scanner;
        await scanner.start();

        if (cancelled) {
          scanner.stop();
          return;
        }

        syncCanvasSize(previewCanvasRef.current);
        await scanner.detectOnce();
        setCameraReady(true);

        if (
          typeof window !== "undefined" &&
          typeof ResizeObserver !== "undefined" &&
          viewportRef.current
        ) {
          const observer = new ResizeObserver(() => {
            syncCanvasSize(previewCanvasRef.current);
          });
          observer.observe(viewportRef.current);
          resizeObserverRef.current = observer;
        }
      } catch (error) {
        console.error("Failed to start document scanner:", error);
        setCameraError(buildCameraErrorMessage(error));
        stopScanner();
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [capturedImage, isMobileViewport, stopScanner, visible]);

  useEffect(() => {
    if (!visible) {
      resetCapture();
      setCameraError("");
      stopScanner();
    }
  }, [resetCapture, stopScanner, visible]);

  const handleCapture = useCallback(async () => {
    if (!scannerRef.current || saving || !cameraReady) {
      return;
    }

    try {
      await scannerRef.current.detectOnce();
      const result = await scannerRef.current.capture({
        filter: "color",
        mimeType: "image/jpeg",
        quality: 0.95,
        maxWidth: isPassportMode ? 2200 : 2400,
        maxHeight: isPassportMode ? 1600 : 2400,
      });

      setCapturedBlob(result.blob);
      setCapturedImage(result.dataUrl);
      stopScanner();
    } catch (error) {
      console.error("Failed to capture document scan:", error);
      setCameraError("Не удалось снять фото. Попробуйте еще раз.");
    }
  }, [cameraReady, isPassportMode, saving, stopScanner]);

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
      title={isPassportMode ? "Скан паспорта" : "Скан документа"}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={isMobileViewport ? "100vw" : 920}
      centered={!isMobileViewport}
      style={
        isMobileViewport ? { top: 0, maxWidth: "100vw", paddingBottom: 0 } : undefined
      }
      styles={{
        body: {
          padding: isMobileViewport ? 8 : 12,
          maxHeight: isMobileViewport ? "calc(100dvh - 56px)" : undefined,
          overflowY: isMobileViewport ? "auto" : undefined,
        },
      }}
      destroyOnHidden
      maskClosable={false}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {cameraError ? (
          <Alert
            type="error"
            showIcon
            message={cameraError}
            action={
              typeof onFallback === "function" ? (
                <Button size="small" onClick={onFallback}>
                  Системная камера
                </Button>
              ) : null
            }
          />
        ) : null}

        {!capturedImage ? (
          <>
            <div
              ref={viewportRef}
              style={{
                position: "relative",
                width: "100%",
                minHeight: isMobileViewport ? 460 : 560,
                borderRadius: 16,
                overflow: "hidden",
                background: "#050505",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  display: "block",
                  objectFit: "contain",
                  background: "#000",
                }}
              />
              <canvas
                ref={previewCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
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

            <div
              style={{
                display: "flex",
                alignItems: isMobileViewport ? "flex-start" : "center",
                justifyContent: "space-between",
                gap: 12,
                flexDirection: isMobileViewport ? "column" : "row",
              }}
            >
              <div>
                <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                <div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 6 }}>
                  {statusMeta.hint}
                </div>
                <div style={{ color: "#bfbfbf", fontSize: 11, marginTop: 4 }}>
                  Качество детекции: {Math.round(detection.confidence * 100)}%
                  {detection.processingMs > 0
                    ? ` · ${Math.round(detection.processingMs)} мс`
                    : ""}
                </div>
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
            </div>
          </>
        ) : (
          <>
            <img
              src={capturedImage}
              alt="scan-preview"
              style={{
                width: "100%",
                borderRadius: 16,
                maxHeight: isMobileViewport ? "60dvh" : "70dvh",
                objectFit: "contain",
                background: "#111",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
                width: "100%",
              }}
            >
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
            </div>
          </>
        )}
      </Space>
    </Modal>
  );
};
