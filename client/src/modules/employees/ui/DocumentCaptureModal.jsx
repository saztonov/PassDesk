import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Grid, Modal, Space, Tag, Typography } from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  CheckOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import ocrService from "@/services/ocrService";
import {
  BASE_VIDEO_CONSTRAINTS,
  captureLayoutByMode,
  captureSourceFrameDataUrl,
  createPreviewUrl,
  dataUrlToBlob,
  normalizeScanCorners,
  prepareCaptureBlob,
} from "@/modules/employees/lib/documentCaptureUtils";

const createCaptureFile = (blob) =>
  new File([blob], `document-scan-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

const computeContainedMediaRect = ({
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
}) => {
  if (!containerWidth || !containerHeight || !sourceWidth || !sourceHeight) {
    return null;
  }

  const scale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
  );
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  return {
    left: Math.max(0, Math.round((containerWidth - width) / 2)),
    top: Math.max(0, Math.round((containerHeight - height) / 2)),
    width,
    height,
  };
};

const toScanNormalized = (response) =>
  response?.data?.normalized || response?.normalized || null;

const resolveScanDocumentType = (mode) =>
  mode === "passport" ? "passport_rf" : undefined;

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
  const cameraViewportRef = useRef(null);
  const previewUrlRef = useRef("");
  const [cameraError, setCameraError] = useState("");
  const [mediaRect, setMediaRect] = useState(null);
  const [preview, setPreview] = useState(null);
  const [shooting, setShooting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanState, setScanState] = useState("idle");
  const [scanMeta, setScanMeta] = useState(null);

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

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  const resetModal = useCallback(() => {
    releasePreview();
    setPreview(null);
    setCameraError("");
    setMediaRect(null);
    setScanState("idle");
    setScanMeta(null);
    setShooting(false);
    setSubmitting(false);
  }, [releasePreview]);

  useEffect(
    () => () => {
      resetModal();
    },
    [resetModal],
  );

  useEffect(() => {
    if (!open) {
      resetModal();
    }
  }, [open, resetModal]);

  useEffect(() => {
    if (!open || preview?.url) {
      return undefined;
    }

    let frameId = 0;
    let observer = null;

    const updateMediaRect = () => {
      const container = cameraViewportRef.current;
      const video = webcamRef.current?.video;
      if (!container) {
        return;
      }

      const nextRect = computeContainedMediaRect({
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        sourceWidth: video?.videoWidth || 0,
        sourceHeight: video?.videoHeight || 0,
      });

      if (!nextRect) {
        return;
      }

      setMediaRect((currentRect) => {
        if (
          currentRect &&
          currentRect.left === nextRect.left &&
          currentRect.top === nextRect.top &&
          currentRect.width === nextRect.width &&
          currentRect.height === nextRect.height
        ) {
          return currentRect;
        }

        return nextRect;
      });
    };

    const tick = () => {
      updateMediaRect();
      frameId = window.requestAnimationFrame(tick);
    };

    tick();

    if (typeof ResizeObserver !== "undefined" && cameraViewportRef.current) {
      observer = new ResizeObserver(updateMediaRect);
      observer.observe(cameraViewportRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [open, preview?.url]);

  const helperMessage = useMemo(() => {
    if (cameraError) {
      return cameraError;
    }

    if (scanState === "scanning") {
      return "Ищем документ на сервере и готовим выровненный preview.";
    }

    if (preview?.url) {
      return scanMeta?.detected
        ? "Документ найден. Проверьте выровненный preview и подтвердите загрузку."
        : "Сервер не нашел документ. Используем fallback crop по рамке.";
    }

    return `${captureLayout.helperText} Держите документ внутри рамки и избегайте бликов.`;
  }, [cameraError, captureLayout.helperText, preview?.url, scanMeta?.detected, scanState]);

  const handleTakePhoto = async () => {
    const video = webcamRef.current?.video;
    const dataUrl = video ? captureSourceFrameDataUrl(video) : null;
    if (!dataUrl) {
      message.error("Не удалось получить кадр с камеры");
      return;
    }

    setShooting(true);
    setScanState("scanning");
    setScanMeta(null);

    try {
      const rawBlob = await dataUrlToBlob(dataUrl);
      const rawFile = new File([rawBlob], `document-capture-${Date.now()}.jpg`, {
        type: rawBlob.type || "image/jpeg",
        lastModified: Date.now(),
      });

      let normalizedCorners = null;
      let detected = false;
      let confidence = null;

      try {
        const scanResponse = await ocrService.scanDocument({
          documentType: resolveScanDocumentType(mode),
          file: rawFile,
        });
        const normalized = toScanNormalized(scanResponse);
        normalizedCorners = normalizeScanCorners(normalized?.corners);
        detected = Boolean(normalized?.detected && normalizedCorners);
        confidence = normalized?.confidence ?? null;
      } catch (scanError) {
        console.error("Server scan failed:", scanError);
      }

      const preparedBlob = await prepareCaptureBlob({
        dataUrl,
        normalizedCorners: detected ? normalizedCorners : undefined,
        viewportAspect: captureLayout.viewportAspect,
        layout: captureLayout,
        cornersSpace: detected ? "source" : "visible",
      });

      const previewUrl = createPreviewUrl(preparedBlob);
      releasePreview();
      previewUrlRef.current = previewUrl;
      setPreview({
        url: previewUrl,
        file: createCaptureFile(preparedBlob),
      });
      setScanMeta({
        detected,
        confidence,
      });
      setScanState(detected ? "detected" : "fallback");
    } catch (error) {
      message.error(error?.message || "Не удалось подготовить scan-копию");
      setScanState("idle");
      setScanMeta(null);
    } finally {
      setShooting(false);
    }
  };

  const handleConfirmCapture = async () => {
    if (!preview?.file) {
      return;
    }

    setSubmitting(true);
    try {
      await onCapture?.(preview.file);
      resetModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetModal();
    onCancel?.();
  };

  const handleUseFallback = () => {
    resetModal();
    onFallback?.();
  };

  const frameStyle = mediaRect
    ? {
        position: "absolute",
        left: mediaRect.left + mediaRect.width * ((1 - captureLayout.frameWidth) / 2),
        top: mediaRect.top + mediaRect.height * ((1 - captureLayout.frameHeight) / 2),
        width: mediaRect.width * captureLayout.frameWidth,
        height: mediaRect.height * captureLayout.frameHeight,
      }
    : null;
  const viewportWidth = cameraViewportRef.current?.clientWidth || 0;
  const viewportHeight = cameraViewportRef.current?.clientHeight || 0;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      title="Фото документа"
      destroyOnClose
      centered
      width={isMobile ? "100vw" : 440}
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
        ref={cameraViewportRef}
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
        {preview?.url ? (
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
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={1}
              forceScreenshotSourceSize
              imageSmoothing
              minScreenshotWidth={1600}
              minScreenshotHeight={900}
              videoConstraints={videoConstraints}
              onUserMediaError={() =>
                setCameraError(
                  "Не удалось открыть live-камеру. Можно продолжить через системную камеру.",
                )
              }
              style={{
                display: "block",
                width: "100%",
                height: isMobile ? "100%" : "auto",
                aspectRatio: isMobile ? undefined : `${captureLayout.viewportAspect}`,
                objectFit: "contain",
                background: "#0d1217",
              }}
            />

            {frameStyle ? (
              <>
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: Math.max(0, frameStyle.top),
                    pointerEvents: "none",
                    background: "rgba(6, 10, 14, 0.34)",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: frameStyle.top,
                    width: Math.max(0, frameStyle.left),
                    height: frameStyle.height,
                    pointerEvents: "none",
                    background: "rgba(6, 10, 14, 0.34)",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: frameStyle.left + frameStyle.width,
                    top: frameStyle.top,
                    width: Math.max(0, viewportWidth - frameStyle.left - frameStyle.width),
                    height: frameStyle.height,
                    pointerEvents: "none",
                    background: "rgba(6, 10, 14, 0.34)",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: frameStyle.top + frameStyle.height,
                    width: "100%",
                    height: Math.max(0, viewportHeight - frameStyle.top - frameStyle.height),
                    pointerEvents: "none",
                    background: "rgba(6, 10, 14, 0.34)",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    ...frameStyle,
                    borderRadius: mode === "passport" ? 10 : 24,
                    border: "2px solid rgba(255,255,255,0.96)",
                    boxShadow:
                      "0 0 0 1px rgba(255,255,255,0.16) inset, 0 12px 24px rgba(0,0,0,0.18)",
                    pointerEvents: "none",
                  }}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      <Space
        size={8}
        style={{
          marginTop: 12,
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <Typography.Text
          type="secondary"
          style={{
            display: "block",
            flex: 1,
            fontSize: isMobile ? 16 : undefined,
          }}
        >
          {helperMessage}
        </Typography.Text>
        {preview?.url ? (
          <Tag color={scanMeta?.detected ? "success" : "default"}>
            {scanMeta?.detected ? "Документ найден" : "Fallback crop"}
          </Tag>
        ) : null}
      </Space>

      <Space
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginTop: isMobile ? "auto" : 16,
          paddingTop: 16,
          flexShrink: 0,
        }}
      >
        {preview?.url ? (
          <>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                releasePreview();
                previewUrlRef.current = "";
                setPreview(null);
                setScanState("idle");
                setScanMeta(null);
              }}
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
              loading={shooting || scanState === "scanning"}
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
