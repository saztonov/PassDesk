import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Grid, Modal, Space, Typography } from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  CheckOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { detectDocumentCornersWithOpenCv } from "@/shared/lib/openCvDocumentScanner";

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
    frameWidth: 0.9,
    frameHeight: 0.64,
    cropPadding: 0.06,
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

const computeVisibleSourceRect = (
  sourceWidth,
  sourceHeight,
  viewportAspect,
) => {
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

const buildPreviewFrameCanvas = (video, maxDimension = 960) => {
  const sourceWidth = video.videoWidth || video.clientWidth || 0;
  const sourceHeight = video.videoHeight || video.clientHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const mapCornersToViewport = (corners, sourceWidth, sourceHeight, viewportRect) => {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return [];
  }

  if (!viewportRect.width || !viewportRect.height) {
    return [];
  }

  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportRect.width / viewportRect.height,
  );

  return corners.map((point) => ({
    x: clamp(
      ((point.x - visibleRect.x) / visibleRect.width) * viewportRect.width,
      0,
      viewportRect.width,
    ),
    y: clamp(
      ((point.y - visibleRect.y) / visibleRect.height) * viewportRect.height,
      0,
      viewportRect.height,
    ),
  }));
};

const cropDataUrlByOverlay = async (dataUrl, layout, viewportAspect) => {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const viewport = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect || layout.viewportAspect,
  );
  const frameLeft = (1 - layout.frameWidth) / 2;
  const frameTop = (1 - layout.frameHeight) / 2;
  const padding =
    Math.min(viewport.width, viewport.height) * layout.cropPadding;

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
  const viewportRef = useRef(null);
  const detectionInFlightRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [detectedCorners, setDetectedCorners] = useState([]);
  const [detectionStatus, setDetectionStatus] = useState("idle");

  const captureLayout = useMemo(
    () => captureLayoutByMode[mode] || captureLayoutByMode.document,
    [mode],
  );
  const mobileViewportStyle = useMemo(() => {
    if (!isMobile) {
      return {};
    }

    return {
      flex: 1,
      minHeight: 0,
      width: "100%",
      margin: "12px auto 0",
    };
  }, [isMobile]);
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
    setDetectedCorners([]);
    setDetectionStatus("idle");
  };

  useEffect(() => {
    if (!open || capturedDataUrl || cameraError) {
      setDetectedCorners([]);
      setDetectionStatus("idle");
      return undefined;
    }

    let cancelled = false;
    let timerId = null;

    setDetectionStatus("searching");

    const runDetection = async () => {
      if (cancelled || detectionInFlightRef.current) {
        return;
      }

      const video = webcamRef.current?.video;
      const viewportElement = viewportRef.current;
      if (
        !video ||
        video.readyState < 2 ||
        !viewportElement ||
        viewportElement.clientWidth === 0 ||
        viewportElement.clientHeight === 0
      ) {
        timerId = window.setTimeout(runDetection, 250);
        return;
      }

      const previewCanvas = buildPreviewFrameCanvas(video, mode === "passport" ? 960 : 840);
      if (!previewCanvas) {
        timerId = window.setTimeout(runDetection, 250);
        return;
      }

      detectionInFlightRef.current = true;

      try {
        const corners = await detectDocumentCornersWithOpenCv(
          previewCanvas,
          mode,
          { preview: true },
        );

        if (cancelled) {
          return;
        }

        const viewportRect = {
          width: viewportElement.clientWidth,
          height: viewportElement.clientHeight,
        };
        const projectedCorners = mapCornersToViewport(
          corners,
          previewCanvas.width,
          previewCanvas.height,
          viewportRect,
        );

        setDetectedCorners(
          projectedCorners.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          ) && projectedCorners.length === 4
            ? projectedCorners
            : [],
        );
        setDetectionStatus(projectedCorners.length === 4 ? "detected" : "searching");
      } catch {
        if (!cancelled) {
          setDetectedCorners([]);
          setDetectionStatus("not_found");
        }
      } finally {
        detectionInFlightRef.current = false;
        if (!cancelled) {
          timerId = window.setTimeout(runDetection, 280);
        }
      }
    };

    timerId = window.setTimeout(runDetection, 120);

    return () => {
      cancelled = true;
      detectionInFlightRef.current = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [cameraError, capturedDataUrl, mode, open]);

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

    const viewportElement = viewportRef.current;
    const viewportAspect =
      viewportElement &&
      viewportElement.clientWidth > 0 &&
      viewportElement.clientHeight > 0
        ? viewportElement.clientWidth / viewportElement.clientHeight
        : captureLayout.viewportAspect;

    setCapturing(true);
    try {
      const blob = await cropDataUrlByOverlay(
        capturedDataUrl,
        captureLayout,
        viewportAspect,
      );
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
        ref={viewportRef}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: isMobile ? 18 : 16,
          background: "#101418",
          width: "100%",
          ...mobileViewportStyle,
        }}
      >
        {capturedDataUrl ? (
          <img
            src={capturedDataUrl}
            alt="Предпросмотр документа"
            style={{
              display: "block",
              width: "100%",
              height: isMobile ? "100%" : "auto",
              aspectRatio: isMobile
                ? undefined
                : `${captureLayout.viewportAspect}`,
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
              height: isMobile ? "100%" : "auto",
              aspectRatio: isMobile
                ? undefined
                : `${captureLayout.viewportAspect}`,
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
          {!capturedDataUrl ? (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 2,
                padding: "6px 10px",
                borderRadius: 999,
                background:
                  detectionStatus === "detected"
                    ? "rgba(31, 232, 151, 0.16)"
                    : "rgba(255, 184, 0, 0.18)",
                border:
                  detectionStatus === "detected"
                    ? "1px solid rgba(31, 232, 151, 0.48)"
                    : "1px solid rgba(255, 184, 0, 0.4)",
                color: "#fff",
                fontSize: 12,
                lineHeight: 1.2,
                fontWeight: 600,
              }}
            >
              {detectionStatus === "detected"
                ? "OpenCV: контур найден"
                : detectionStatus === "not_found"
                  ? "OpenCV: контур не найден"
                  : "OpenCV: ищу контур"}
            </div>
          ) : null}

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

        {!capturedDataUrl ? (
          <svg
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            viewBox={`0 0 ${viewportRef.current?.clientWidth || 1} ${
              viewportRef.current?.clientHeight || 1
            }`}
            preserveAspectRatio="none"
          >
            {detectedCorners.length === 4 ? (
              <>
                <polygon
                  points={detectedCorners.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="rgba(31, 232, 151, 0.12)"
                  stroke="rgba(31, 232, 151, 0.96)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {detectedCorners.map((point, index) => (
                  <circle
                    key={`${point.x}-${point.y}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="5"
                    fill="rgba(31, 232, 151, 1)"
                    stroke="rgba(6, 10, 14, 0.64)"
                    strokeWidth="2"
                  />
                ))}
              </>
            ) : null}
          </svg>
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
          (capturedDataUrl
            ? captureLayout.helperText
            : detectionStatus === "detected"
              ? "OpenCV нашёл границы документа. Зелёная рамка показывает область захвата."
              : detectionStatus === "not_found"
                ? "OpenCV пока не видит контур документа. Уменьшите блики и держите телефон параллельно."
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
        {capturedDataUrl ? (
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
              loading={capturing}
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
