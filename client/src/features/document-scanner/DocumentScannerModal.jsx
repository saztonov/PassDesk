import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Tag } from "antd";
import {
  CameraOutlined,
  RetweetOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { ScannerDoc } from "@/vendor/scannerdoc";

const AUTO_CAPTURE_MIN_CONFIDENCE = 0.62;
const AUTO_CAPTURE_STABLE_DELTA_RATIO = 0.015;
const AUTO_CAPTURE_STABLE_FRAMES = 4;

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

const waitForMountedNode = async (ref, timeoutMs = 2000) => {
  const startedAt = Date.now();

  while (!ref.current) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Scanner viewport is not mounted");
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 16);
    });
  }

  return ref.current;
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

const calculateQuadDeltaRatio = (previousCorners, nextCorners, frameWidth, frameHeight) => {
  if (!previousCorners || !nextCorners || !frameWidth || !frameHeight) {
    return Number.POSITIVE_INFINITY;
  }

  const diagonal = Math.hypot(frameWidth, frameHeight) || 1;
  const totalDistance = previousCorners.reduce((sum, point, index) => {
    const nextPoint = nextCorners[index];
    return sum + Math.hypot(point.x - nextPoint.x, point.y - nextPoint.y);
  }, 0);

  return totalDistance / (previousCorners.length * diagonal);
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
  const autoCaptureLockRef = useRef(false);
  const autoCaptureTimeoutRef = useRef(null);
  const lastDetectionRef = useRef(null);
  const stableFramesRef = useRef(0);

  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [detection, setDetection] = useState({
    confidence: 0,
    processingMs: 0,
    stableFrames: 0,
    autoCaptureArmed: false,
  });

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
    lastDetectionRef.current = null;
    stableFramesRef.current = 0;
    autoCaptureLockRef.current = false;

    if (autoCaptureTimeoutRef.current) {
      window.clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }

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
    setDetection({
      confidence: 0,
      processingMs: 0,
      stableFrames: 0,
      autoCaptureArmed: false,
    });
  }, []);

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
    setCapturedBlob(null);
  }, []);

  const captureScan = useCallback(async () => {
    if (!scannerRef.current || saving || autoCaptureLockRef.current) {
      return false;
    }

    autoCaptureLockRef.current = true;

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
      return true;
    } catch (error) {
      console.error("Failed to capture document scan:", error);
      setCameraError("Не удалось снять фото. Попробуйте еще раз.");
      autoCaptureLockRef.current = false;
      return false;
    }
  }, [isPassportMode, saving, stopScanner]);

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
      setDetection({
        confidence: 0,
        processingMs: 0,
        stableFrames: 0,
        autoCaptureArmed: false,
      });
      syncCanvasSize(previewCanvasRef.current);

      try {
        const videoNode = await waitForMountedNode(videoRef);
        const previewCanvasNode = await waitForMountedNode(previewCanvasRef);

        if (cancelled) {
          return;
        }

        const scanner = new ScannerDoc({
          video: videoNode,
          previewCanvas: previewCanvasNode,
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

            const previousDetection = lastDetectionRef.current;
            const deltaRatio = calculateQuadDeltaRatio(
              previousDetection?.corners,
              result.corners,
              result.frameWidth,
              result.frameHeight,
            );
            const isStable =
              result.confidence >= AUTO_CAPTURE_MIN_CONFIDENCE &&
              deltaRatio <= AUTO_CAPTURE_STABLE_DELTA_RATIO;

            stableFramesRef.current = isStable ? stableFramesRef.current + 1 : 0;
            lastDetectionRef.current = result;

            if (
              isStable &&
              stableFramesRef.current >= AUTO_CAPTURE_STABLE_FRAMES &&
              !autoCaptureLockRef.current &&
              !autoCaptureTimeoutRef.current &&
              !capturedImage
            ) {
              autoCaptureTimeoutRef.current = window.setTimeout(() => {
                autoCaptureTimeoutRef.current = null;
                void captureScan();
              }, 250);
            }

            if (!isStable && autoCaptureTimeoutRef.current) {
              window.clearTimeout(autoCaptureTimeoutRef.current);
              autoCaptureTimeoutRef.current = null;
            }

            setDetection({
              confidence: result.confidence,
              processingMs: result.processingMs,
              stableFrames: stableFramesRef.current,
              autoCaptureArmed:
                isStable && stableFramesRef.current >= AUTO_CAPTURE_STABLE_FRAMES,
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
  }, [capturedImage, captureScan, isMobileViewport, stopScanner, visible]);

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

    await captureScan();
  }, [cameraReady, captureScan, saving]);

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
                <div style={{ color: "#8c8c8c", fontSize: 11, marginTop: 4 }}>
                  {detection.autoCaptureArmed
                    ? "Автоснимок сейчас сработает"
                    : detection.stableFrames > 0
                      ? `Автоснимок: ${detection.stableFrames}/${AUTO_CAPTURE_STABLE_FRAMES}`
                      : "Автоснимок ждёт ровный и стабильный контур"}
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
