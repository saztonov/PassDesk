import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Grid, Modal, Space, Typography } from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  CheckOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  BASE_VIDEO_CONSTRAINTS,
  buildVisiblePreviewCanvas,
  captureLayoutByMode,
  clamp,
  createPreviewUrl,
  prepareCaptureBlob,
} from "@/modules/employees/lib/documentCaptureUtils";
import { detectDocumentCornersWithOpenCv } from "@/shared/lib/openCvDocumentScanner";

const DocumentCaptureModal = ({
  open,
  mode = "document",
  onCancel,
  onCapture,
  onFallback,
}) => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const webcamRef = useRef(null);
  const detectionInFlightRef = useRef(false);
  const previewUrlRef = useRef("");
  const [cameraError, setCameraError] = useState("");
  const [preview, setPreview] = useState(null);
  const [shooting, setShooting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detection, setDetection] = useState({
    status: "idle",
    corners: [],
    misses: 0,
  });

  const captureLayout = useMemo(
    () => captureLayoutByMode[mode] || captureLayoutByMode.document,
    [mode],
  );
  const isPreviewVisible = Boolean(preview?.url);
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

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  const resetPreview = useCallback(() => {
    releasePreview();
    setPreview(null);
  }, [releasePreview]);

  const resetModal = useCallback(() => {
    resetPreview();
    setCameraError("");
    setShooting(false);
    setSubmitting(false);
    setDetection({ status: "idle", corners: [], misses: 0 });
  }, [resetPreview]);

  useEffect(
    () => () => {
      releasePreview();
    },
    [releasePreview],
  );

  useEffect(() => {
    if (!open) {
      resetModal();
      return undefined;
    }

    if (isPreviewVisible || cameraError) {
      return undefined;
    }

    let cancelled = false;
    let timerId = null;

    const schedule = (delay) => {
      timerId = window.setTimeout(runDetection, delay);
    };

    const runDetection = async () => {
      if (cancelled || detectionInFlightRef.current) {
        return;
      }

      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2) {
        schedule(250);
        return;
      }

      const previewCanvas = buildVisiblePreviewCanvas(
        video,
        captureLayout.viewportAspect,
        captureLayout.previewMaxDimension,
      );
      if (!previewCanvas) {
        schedule(250);
        return;
      }

      detectionInFlightRef.current = true;

      try {
        const corners = await detectDocumentCornersWithOpenCv(
          previewCanvas.canvas,
          mode,
          { preview: true },
        );
        if (cancelled) {
          return;
        }

        const normalizedCorners = corners.map((point) => ({
          x: clamp(point.x / previewCanvas.canvas.width, 0, 1),
          y: clamp(point.y / previewCanvas.canvas.height, 0, 1),
        }));

        setDetection({
          status: "detected",
          corners: normalizedCorners,
          misses: 0,
        });
      } catch {
        if (!cancelled) {
          setDetection((previous) => ({
            status: previous.misses >= 3 ? "not_found" : "searching",
            corners: [],
            misses: previous.misses + 1,
          }));
        }
      } finally {
        detectionInFlightRef.current = false;
        if (!cancelled) {
          schedule(350);
        }
      }
    };

    setDetection((previous) => ({
      status: previous.status === "detected" ? "detected" : "searching",
      corners: previous.corners,
      misses: previous.misses,
    }));
    schedule(120);

    return () => {
      cancelled = true;
      detectionInFlightRef.current = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    cameraError,
    captureLayout.previewMaxDimension,
    captureLayout.viewportAspect,
    isPreviewVisible,
    mode,
    open,
    resetModal,
  ]);

  const handleTakePhoto = async () => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) {
      message.error("Не удалось получить кадр с камеры");
      return;
    }

    setShooting(true);
    try {
      const blob = await prepareCaptureBlob({
        dataUrl,
        normalizedCorners: detection.corners,
        viewportAspect: captureLayout.viewportAspect,
        layout: captureLayout,
      });
      const url = createPreviewUrl(blob);
      releasePreview();
      previewUrlRef.current = url;
      setPreview({ url, blob });
    } catch (error) {
      message.error(error?.message || "Не удалось подготовить снимок");
    } finally {
      setShooting(false);
    }
  };

  const handleConfirmCapture = async () => {
    if (!preview?.blob) {
      return;
    }

    setSubmitting(true);
    try {
      await onCapture?.(preview.blob);
      resetModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraError = () => {
    setCameraError(
      "Не удалось открыть live-камеру. Можно продолжить через системную камеру.",
    );
  };

  const handleUseFallback = () => {
    resetModal();
    onFallback?.();
  };

  const handleClose = () => {
    resetModal();
    onCancel?.();
  };

  const detectionPolygon =
    detection.corners.length === 4
      ? detection.corners.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")
      : "";

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title="Фото документа"
      destroyOnClose
      centered
      width={isMobile ? "100vw" : 420}
      style={{
        top: isMobile ? 0 : undefined,
        maxWidth: isMobile ? "100vw" : undefined,
        margin: isMobile ? 0 : undefined,
        paddingBottom: isMobile ? 0 : undefined,
      }}
      styles={{
        content: {
          borderRadius: isMobile ? 0 : 16,
          minHeight: isMobile ? "100dvh" : undefined,
          height: isMobile ? "100dvh" : undefined,
          maxHeight: isMobile ? "100dvh" : undefined,
          padding: isMobile ? 16 : undefined,
          display: isMobile ? "flex" : undefined,
          flexDirection: isMobile ? "column" : undefined,
        },
        header: {
          marginBottom: isMobile ? 12 : undefined,
        },
        body: {
          padding: isMobile ? 0 : 24,
          display: isMobile ? "flex" : undefined,
          flexDirection: isMobile ? "column" : undefined,
          flex: isMobile ? 1 : undefined,
          minHeight: isMobile ? 0 : undefined,
        },
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: isMobile ? 18 : 16,
          background: "#101418",
          width: "100%",
          flex: isMobile ? 1 : undefined,
          minHeight: isMobile ? 0 : undefined,
          marginTop: isMobile ? 12 : 0,
        }}
      >
        {isPreviewVisible ? (
          <img
            src={preview.url}
            alt="Предпросмотр документа"
            style={{
              display: "block",
              width: "100%",
              height: isMobile ? "100%" : "auto",
              aspectRatio: isMobile ? undefined : `${captureLayout.viewportAspect}`,
              objectFit: "contain",
              background: "#0d1217",
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
              height: isMobile ? "100%" : "auto",
              aspectRatio: isMobile ? undefined : `${captureLayout.viewportAspect}`,
              objectFit: "cover",
            }}
          />
        )}

        {!isPreviewVisible ? (
          <>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                background:
                  "linear-gradient(rgba(10,14,18,0.46), rgba(10,14,18,0.28))",
              }}
            >
              <div
                style={{
                  width: `${captureLayout.frameWidth * 100}%`,
                  height: `${captureLayout.frameHeight * 100}%`,
                  borderRadius: mode === "passport" ? 8 : 24,
                  border: "2px solid rgba(255,255,255,0.94)",
                  boxShadow:
                    "0 0 0 999px rgba(6, 10, 14, 0.36), 0 0 0 1px rgba(255,255,255,0.12) inset",
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 2,
                padding: "6px 10px",
                borderRadius: 999,
                background:
                  detection.status === "detected"
                    ? "rgba(31, 232, 151, 0.16)"
                    : "rgba(255, 184, 0, 0.18)",
                border:
                  detection.status === "detected"
                    ? "1px solid rgba(31, 232, 151, 0.48)"
                    : "1px solid rgba(255, 184, 0, 0.4)",
                color: "#fff",
                fontSize: 12,
                lineHeight: 1.2,
                fontWeight: 600,
              }}
            >
              {detection.status === "detected"
                ? "OpenCV: контур найден"
                : detection.status === "not_found"
                  ? "OpenCV: контур не найден"
                  : "OpenCV: ищу контур"}
            </div>

            <svg
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {detectionPolygon ? (
                <>
                  <polygon
                    points={detectionPolygon}
                    fill="rgba(31, 232, 151, 0.16)"
                    stroke="rgba(31, 232, 151, 0.98)"
                    strokeWidth="0.45"
                    strokeLinejoin="round"
                  />
                  {detection.corners.map((point, index) => (
                    <circle
                      key={`${point.x}-${point.y}-${index}`}
                      cx={point.x * 100}
                      cy={point.y * 100}
                      r="0.8"
                      fill="rgba(31, 232, 151, 1)"
                      stroke="rgba(6, 10, 14, 0.72)"
                      strokeWidth="0.24"
                    />
                  ))}
                </>
              ) : null}
            </svg>
          </>
        ) : null}
      </div>

      <Typography.Text
        type="secondary"
        style={{
          display: "block",
          marginTop: 12,
          flexShrink: 0,
          fontSize: isMobile ? 16 : undefined,
        }}
      >
        {cameraError ||
          (isPreviewVisible
            ? "Проверьте кадр. Если контур был найден, снимок уже выровнен по документу."
            : detection.status === "detected"
              ? "OpenCV нашёл контур документа. При съёмке будет использован найденный контур."
              : detection.status === "not_found"
                ? `${captureLayout.helperText} Если контур не находится, снимок будет обрезан по рамке.`
                : "OpenCV ищет границы документа. Держите телефон ровно и уменьшите блики.")}
      </Typography.Text>

      <Space
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginTop: isMobile ? "auto" : 16,
          paddingTop: 16,
          flexShrink: 0,
        }}
      >
        {isPreviewVisible ? (
          <>
            <Button
              icon={<ReloadOutlined />}
              onClick={resetPreview}
              size={isMobile ? "large" : "middle"}
            >
              Переснять
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={submitting}
              onClick={handleConfirmCapture}
              size={isMobile ? "large" : "middle"}
            >
              Использовать
            </Button>
          </>
        ) : (
          <>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleUseFallback}
              size={isMobile ? "large" : "middle"}
            >
              Другой способ
            </Button>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={shooting}
              onClick={handleTakePhoto}
              size={isMobile ? "large" : "middle"}
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
