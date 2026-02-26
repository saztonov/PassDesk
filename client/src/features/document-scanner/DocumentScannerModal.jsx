import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Spin } from "antd";
import {
  CameraOutlined,
  RotateRightOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";
import { Scanner } from "scanic";

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  mode = "document",
}) => {
  const webcamRef = useRef(null);
  const scannerRef = useRef(null);

  const [state, setState] = useState({
    initializing: false,
    ready: false,
    scannerAvailable: true,
    processing: false,
    capturedImage: null,
    processedImage: null,
    error: null,
  });

  const {
    initializing,
    ready,
    scannerAvailable,
    processing,
    capturedImage,
    processedImage,
    error,
  } = state;

  const isPassportMode = mode === "passport";
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const resetCapture = useCallback(() => {
    setState((prev) => ({
      ...prev,
      capturedImage: null,
      processedImage: null,
      processing: false,
    }));
  }, []);

  useEffect(() => {
    if (!visible) {
      setState((prev) => ({
        ...prev,
        ready: false,
        capturedImage: null,
        processedImage: null,
        processing: false,
        error: null,
      }));
      return;
    }

    let cancelled = false;

    const initScanner = async () => {
      setState((prev) => ({
        ...prev,
        initializing: true,
        error: null,
      }));

      try {
        if (!scannerRef.current || typeof scannerRef.current.scan !== "function") {
          scannerRef.current = new Scanner();
        }

        if (typeof scannerRef.current.initialize === "function") {
          await scannerRef.current.initialize();
        }

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            initializing: false,
            ready: true,
            scannerAvailable: true,
          }));
        }
      } catch (initError) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            initializing: false,
            ready: false,
            scannerAvailable: false,
            error: null,
          }));
        }
        scannerRef.current = null;
        console.error("Scanic init error:", initError);
      }
    };

    initScanner();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const videoConstraints = useMemo(
    () => ({
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }),
    [],
  );

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current || processing) {
      return;
    }

    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      setState((prev) => ({
        ...prev,
        error: "Не удалось получить кадр с камеры",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      capturedImage: screenshot,
      processedImage: null,
      processing: true,
      error: null,
    }));

    try {
      if (
        !ready ||
        !scannerAvailable ||
        !scannerRef.current ||
        typeof scannerRef.current.scan !== "function"
      ) {
        setState((prev) => ({
          ...prev,
          processedImage: screenshot,
          processing: false,
        }));
        return;
      }

      const imageElement = await loadImage(screenshot);
      const result = await scannerRef.current.scan(imageElement, {
        mode: "extract",
        output: "canvas",
        maxProcessingDimension: 1200,
      });

      if (result?.success && result?.output) {
        let outputDataUrl = screenshot;

        if (typeof result.output === "string") {
          outputDataUrl = result.output;
        } else if (typeof result.output.toDataURL === "function") {
          outputDataUrl = result.output.toDataURL("image/jpeg", 0.92);
        }

        setState((prev) => ({
          ...prev,
          processedImage: outputDataUrl,
          processing: false,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        processedImage: screenshot,
        processing: false,
      }));
    } catch (scanError) {
      console.error("Scanic scan error:", scanError);
      setState((prev) => ({
        ...prev,
        processedImage: screenshot,
        processing: false,
        error: "Авто-обрезка не сработала. Можно сохранить исходное фото.",
      }));
    }
  }, [processing, ready, scannerAvailable]);

  const handleSave = useCallback(async () => {
    const output = processedImage || capturedImage;
    if (!output) {
      return;
    }

    const blob = await fetch(output).then((res) => res.blob());
    onCapture(blob);
    onCancel();
  }, [capturedImage, onCancel, onCapture, processedImage]);

  return (
    <Modal
      title={isPassportMode ? "Фото паспорта" : "Сканирование документа"}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={isMobileViewport ? "100vw" : 840}
      centered={!isMobileViewport}
      style={isMobileViewport ? { top: 0, maxWidth: "100vw", paddingBottom: 0 } : undefined}
      styles={{ body: { padding: 12 } }}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {(initializing || processing) && <Spin />}

        {error && <Alert type="warning" showIcon message={error} />}

        {!capturedImage ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
            }}
          >
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: "18% 12%",
                border: "2px dashed rgba(82, 196, 26, 0.9)",
                borderRadius: 10,
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          <img
            src={processedImage || capturedImage}
            alt="scan-preview"
            style={{ width: "100%", borderRadius: 8, maxHeight: "62vh", objectFit: "contain" }}
          />
        )}

        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {!capturedImage ? (
            <Button
              type="primary"
              icon={<CameraOutlined />}
              onClick={handleCapture}
              loading={processing}
            >
              Снять
            </Button>
          ) : (
            <>
              <Button icon={<RotateRightOutlined />} onClick={resetCapture}>
                Переснять
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={processing}
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
