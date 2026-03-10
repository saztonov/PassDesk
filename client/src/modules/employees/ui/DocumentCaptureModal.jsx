import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const captureLayoutByMode = {
  passport: {
    helperText:
      "Наведите камеру на разворот паспорта и держите телефон параллельно документу.",
    viewportAspect: 4 / 3,
    frameWidth: 0.9,
    frameHeight: 0.64,
    cropPadding: 0.06,
    previewMaxDimension: 960,
  },
  document: {
    helperText: "Поместите документ целиком в кадр и избегайте бликов.",
    viewportAspect: 3 / 4,
    frameWidth: 0.78,
    frameHeight: 0.68,
    cropPadding: 0.05,
    previewMaxDimension: 840,
  },
};

const loadImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть снимок"));
    image.src = dataUrl;
  });

const canvasToBlob = (canvas, mimeType = "image/jpeg", quality = 0.98) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Не удалось подготовить снимок"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
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

const buildVisiblePreviewCanvas = (video, viewportAspect, maxDimension) => {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const scale = Math.min(
    1,
    maxDimension / Math.max(visibleRect.width, visibleRect.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(visibleRect.width * scale));
  canvas.height = Math.max(1, Math.round(visibleRect.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(
    video,
    visibleRect.x,
    visibleRect.y,
    visibleRect.width,
    visibleRect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return { canvas, visibleRect };
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const estimateOutputSize = (corners) => {
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);

  return {
    width: Math.max(64, Math.round(Math.max(top, bottom))),
    height: Math.max(64, Math.round(Math.max(left, right))),
  };
};

const solveLinearSystem = (matrix, vector) => {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-8) {
      return null;
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const pivotValue = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      if (factor === 0) {
        continue;
      }

      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

const buildProjectiveTransform = (sourceCorners, outputWidth, outputHeight) => {
  const destinationCorners = [
    { x: 0, y: 0 },
    { x: outputWidth - 1, y: 0 },
    { x: outputWidth - 1, y: outputHeight - 1 },
    { x: 0, y: outputHeight - 1 },
  ];
  const matrix = [];
  const vector = [];

  for (let index = 0; index < 4; index += 1) {
    const { x: u, y: v } = destinationCorners[index];
    const { x, y } = sourceCorners[index];

    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    vector.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    vector.push(y);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) {
    return null;
  }

  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
    1,
  ];
};

const projectPoint = (transform, x, y) => {
  const denominator = transform[6] * x + transform[7] * y + transform[8];
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  return {
    x: (transform[0] * x + transform[1] * y + transform[2]) / denominator,
    y: (transform[3] * x + transform[4] * y + transform[5]) / denominator,
  };
};

const sampleRgba = (src, srcWidth, srcHeight, x, y) => {
  const fx = clamp(x, 0, srcWidth - 1);
  const fy = clamp(y, 0, srcHeight - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(srcWidth - 1, x0 + 1);
  const y1 = Math.min(srcHeight - 1, y0 + 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const idx00 = (y0 * srcWidth + x0) * 4;
  const idx10 = (y0 * srcWidth + x1) * 4;
  const idx01 = (y1 * srcWidth + x0) * 4;
  const idx11 = (y1 * srcWidth + x1) * 4;

  const top = [0, 1, 2, 3].map(
    (offset) => src[idx00 + offset] + (src[idx10 + offset] - src[idx00 + offset]) * dx,
  );
  const bottom = [0, 1, 2, 3].map(
    (offset) => src[idx01 + offset] + (src[idx11 + offset] - src[idx01 + offset]) * dx,
  );

  return top.map((value, index) =>
    Math.round(value + (bottom[index] - value) * dy),
  );
};

const warpQuad = (source, corners) => {
  const { width, height } = estimateOutputSize(corners);
  const output = new ImageData(width, height);
  const { data: src, width: srcWidth, height: srcHeight } = source;
  const transform = buildProjectiveTransform(corners, width, height);

  if (!transform) {
    throw new Error("Не удалось выровнять документ по найденному контуру");
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mapped = projectPoint(transform, x, y);
      if (!mapped) {
        continue;
      }

      const [r, g, b, a] = sampleRgba(src, srcWidth, srcHeight, mapped.x, mapped.y);
      const idx = (y * width + x) * 4;
      output.data[idx] = r;
      output.data[idx + 1] = g;
      output.data[idx + 2] = b;
      output.data[idx + 3] = a;
    }
  }

  return output;
};

const buildGuideCropBlob = async (image, layout, viewportAspect) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const frameLeft = (1 - layout.frameWidth) / 2;
  const frameTop = (1 - layout.frameHeight) / 2;
  const padding = Math.min(visibleRect.width, visibleRect.height) * layout.cropPadding;

  const cropX = Math.max(0, visibleRect.x + visibleRect.width * frameLeft - padding);
  const cropY = Math.max(0, visibleRect.y + visibleRect.height * frameTop - padding);
  const cropRight = Math.min(
    sourceWidth,
    visibleRect.x + visibleRect.width * (frameLeft + layout.frameWidth) + padding,
  );
  const cropBottom = Math.min(
    sourceHeight,
    visibleRect.y + visibleRect.height * (frameTop + layout.frameHeight) + padding,
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

  return canvasToBlob(canvas);
};

const buildWarpedCaptureBlob = async (image, normalizedCorners, viewportAspect) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const visibleRect = computeVisibleSourceRect(
    sourceWidth,
    sourceHeight,
    viewportAspect,
  );
  const sourceCorners = normalizedCorners.map((point) => ({
    x: visibleRect.x + visibleRect.width * point.x,
    y: visibleRect.y + visibleRect.height * point.y,
  }));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!sourceContext) {
    throw new Error("Canvas недоступен для подготовки снимка");
  }

  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const sourceImageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const warped = warpQuad(sourceImageData, sourceCorners);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = warped.width;
  outputCanvas.height = warped.height;
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("Canvas недоступен для сборки снимка");
  }

  outputContext.putImageData(warped, 0, 0);
  return canvasToBlob(outputCanvas);
};

const prepareCaptureBlob = async ({
  dataUrl,
  normalizedCorners,
  viewportAspect,
  layout,
}) => {
  const image = await loadImage(dataUrl);

  if (Array.isArray(normalizedCorners) && normalizedCorners.length === 4) {
    try {
      return await buildWarpedCaptureBlob(image, normalizedCorners, viewportAspect);
    } catch {
      // Fallback to guide crop if perspective warp failed.
    }
  }

  return buildGuideCropBlob(image, layout, viewportAspect);
};

const createPreviewUrl = (blob) => URL.createObjectURL(blob);

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
