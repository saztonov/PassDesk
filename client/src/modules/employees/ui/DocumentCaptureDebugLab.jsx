import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Image,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import Webcam from "react-webcam";
import {
  CameraOutlined,
  ReloadOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import {
  BASE_VIDEO_CONSTRAINTS,
  buildVisiblePreviewCanvas,
  captureLayoutByMode,
  clamp,
  createPreviewUrl,
  prepareCaptureBlob,
} from "@/modules/employees/lib/documentCaptureUtils";
import ocrService from "@/services/ocrService";
import { detectDocumentCornersWithOpenCv } from "@/shared/lib/openCvDocumentScanner";

const { Paragraph, Text, Title } = Typography;

const OCR_DOCUMENT_OPTIONS = [
  { label: "Паспорт РФ", value: "passport_rf" },
  { label: "Иностранный паспорт", value: "foreign_passport" },
  { label: "Патент", value: "patent" },
  { label: "КИГ", value: "kig" },
  { label: "ИНН", value: "inn" },
  { label: "СНИЛС", value: "snils" },
  { label: "Банковские реквизиты", value: "bank_details" },
  { label: "Виза", value: "visa" },
];

const CAPTURE_MODE_OPTIONS = [
  { label: "Паспорт", value: "passport" },
  { label: "Документ", value: "document" },
];

const DETECTION_STATUS_META = {
  idle: { color: "default", text: "Ожидание камеры" },
  searching: { color: "processing", text: "Ищу контур" },
  detected: { color: "success", text: "Контур найден" },
  not_found: { color: "warning", text: "Контур не найден" },
};

const OCR_STATUS_META = {
  idle: { color: "default", text: "OCR не запускался" },
  processing: { color: "processing", text: "OCR выполняется" },
  success: { color: "success", text: "OCR завершен" },
  error: { color: "error", text: "Ошибка OCR" },
};

const toResponseData = (response) => response?.data || response || {};

const toNormalizedPayload = (responseData = {}) =>
  responseData.normalized || responseData?.data?.normalized || null;

const formatError = (error) =>
  error?.response?.data?.message || error?.message || "Неизвестная ошибка";

const createCapturedFile = (blob) =>
  new File([blob], `document-capture-${Date.now()}.jpg`, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now(),
  });

const flattenNormalizedPayload = (value, prefix = "") => {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, entryValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (entryValue === null || entryValue === undefined || entryValue === "") {
      return [];
    }

    if (Array.isArray(entryValue)) {
      const arrayValue = entryValue
        .map((item) =>
          typeof item === "object" ? JSON.stringify(item, null, 0) : String(item),
        )
        .join(", ");
      return arrayValue ? [{ key: nextKey, value: arrayValue }] : [];
    }

    if (typeof entryValue === "object") {
      return flattenNormalizedPayload(entryValue, nextKey);
    }

    return [{ key: nextKey, value: String(entryValue) }];
  });
};

const DocumentCaptureDebugLab = () => {
  const { message } = App.useApp();
  const webcamRef = useRef(null);
  const detectionInFlightRef = useRef(false);
  const previewUrlRef = useRef("");

  const [captureMode, setCaptureMode] = useState("passport");
  const [ocrDocumentType, setOcrDocumentType] = useState("passport_rf");
  const [cameraError, setCameraError] = useState("");
  const [shooting, setShooting] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("idle");
  const [ocrError, setOcrError] = useState("");
  const [ocrResult, setOcrResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [events, setEvents] = useState([]);
  const [detection, setDetection] = useState({
    status: "idle",
    corners: [],
    misses: 0,
  });

  const captureLayout = useMemo(
    () => captureLayoutByMode[captureMode] || captureLayoutByMode.document,
    [captureMode],
  );
  const videoConstraints = useMemo(
    () => ({
      ...BASE_VIDEO_CONSTRAINTS,
      aspectRatio:
        captureMode === "passport"
          ? { ideal: captureLayout.viewportAspect }
          : undefined,
    }),
    [captureLayout.viewportAspect, captureMode],
  );

  const pushEvent = useCallback((messageText) => {
    const timestamp = new Date().toLocaleTimeString("ru-RU");
    setEvents((previous) => [`${timestamp} ${messageText}`, ...previous].slice(0, 12));
  }, []);

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  const resetPreview = useCallback(() => {
    releasePreview();
    setPreview(null);
    setOcrStatus("idle");
    setOcrError("");
    setOcrResult(null);
  }, [releasePreview]);

  useEffect(
    () => () => {
      releasePreview();
    },
    [releasePreview],
  );

  useEffect(() => {
    if (preview?.url || cameraError) {
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
          captureMode,
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
    captureMode,
    preview?.url,
  ]);

  const handleTakePhoto = async () => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) {
      message.error("Не удалось получить кадр с камеры");
      return;
    }

    setShooting(true);
    pushEvent("Снимаю кадр");

    try {
      const blob = await prepareCaptureBlob({
        dataUrl,
        normalizedCorners: detection.corners,
        viewportAspect: captureLayout.viewportAspect,
        layout: captureLayout,
      });
      const url = createPreviewUrl(blob);
      const file = createCapturedFile(blob);
      releasePreview();
      previewUrlRef.current = url;
      setPreview({
        url,
        file,
        scanStrategy:
          detection.corners.length === 4 ? "perspective_warp" : "guide_crop",
      });
      setOcrStatus("idle");
      setOcrError("");
      setOcrResult(null);
      pushEvent(
        detection.corners.length === 4
          ? "Контур найден, снимок выровнен по перспективе"
          : "Контур не найден, снимок обрезан по рамке",
      );
    } catch (error) {
      const messageText = formatError(error);
      setOcrError(messageText);
      setOcrStatus("error");
      pushEvent(`Ошибка подготовки снимка: ${messageText}`);
      message.error(messageText);
    } finally {
      setShooting(false);
    }
  };

  const handleRecognize = async () => {
    if (!preview?.file) {
      return;
    }

    setOcrStatus("processing");
    setOcrError("");
    pushEvent(`Запускаю OCR для ${ocrDocumentType}`);

    try {
      const response = await ocrService.recognizeDocument({
        documentType: ocrDocumentType,
        file: preview.file,
      });
      const responseData = toResponseData(response);
      const normalized = toNormalizedPayload(responseData);

      setOcrResult(responseData);
      setOcrStatus("success");
      pushEvent(
        normalized
          ? `OCR завершен, распознано полей: ${flattenNormalizedPayload(normalized).length}`
          : "OCR завершен, но нормализованных полей нет",
      );
      message.success("OCR распознавание завершено");
    } catch (error) {
      const messageText = formatError(error);
      setOcrStatus("error");
      setOcrError(messageText);
      pushEvent(`Ошибка OCR: ${messageText}`);
      message.error(messageText);
    }
  };

  const handleReset = () => {
    resetPreview();
    setCameraError("");
    setDetection({ status: "idle", corners: [], misses: 0 });
    setEvents([]);
  };

  const handleCameraError = () => {
    setCameraError("Не удалось открыть live-камеру. Проверьте разрешения браузера.");
    pushEvent("Браузер не дал доступ к камере");
  };

  const normalizedResult = toNormalizedPayload(ocrResult) || {};
  const normalizedEntries = flattenNormalizedPayload(normalizedResult);
  const detectionPolygon =
    detection.corners.length === 4
      ? detection.corners.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")
      : "";
  const detectionMeta =
    DETECTION_STATUS_META[detection.status] || DETECTION_STATUS_META.idle;
  const ocrMeta = OCR_STATUS_META[ocrStatus] || OCR_STATUS_META.idle;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
              Computer Vision Document Capture
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Страница работает без SDK: OpenCV ищет контур документа, кадр
              выравнивается в scan-копию, после чего этот снимок отправляется в
              OCR.
            </Paragraph>
          </div>

          <Space wrap>
            <div>
              <Text type="secondary">Режим захвата</Text>
              <Select
                options={CAPTURE_MODE_OPTIONS}
                style={{ width: 180, display: "block", marginTop: 4 }}
                value={captureMode}
                onChange={setCaptureMode}
              />
            </div>
            <div>
              <Text type="secondary">Тип OCR</Text>
              <Select
                options={OCR_DOCUMENT_OPTIONS}
                style={{ width: 220, display: "block", marginTop: 4 }}
                value={ocrDocumentType}
                onChange={setOcrDocumentType}
              />
            </div>
          </Space>

          <Space wrap>
            <Tag color={detectionMeta.color}>{detectionMeta.text}</Tag>
            <Tag color={ocrMeta.color}>{ocrMeta.text}</Tag>
            {preview?.scanStrategy === "perspective_warp" ? (
              <Tag color="success">Scan: perspective warp</Tag>
            ) : null}
            {preview?.scanStrategy === "guide_crop" ? (
              <Tag color="warning">Scan: guide crop</Tag>
            ) : null}
          </Space>

          <Alert
            type="info"
            showIcon
            message="Как это работает"
            description={
              <span>
                1. OpenCV в live-потоке ищет внешний контур документа.
                <br />
                2. По кнопке `Снять` текущий кадр выравнивается в scan-копию.
                <br />
                3. По кнопке `Распознать` scan-копия отправляется в OCR.
              </span>
            }
          />

          {cameraError ? (
            <Alert type="error" showIcon message="Камера" description={cameraError} />
          ) : null}

          {ocrError ? (
            <Alert type="error" showIcon message="OCR" description={ocrError} />
          ) : null}
        </Space>
      </Card>

      <Card bodyStyle={{ padding: 0, overflow: "hidden" }} title="Live Capture">
        <div
          style={{
            position: "relative",
            width: "100%",
            minHeight: 640,
            background:
              "linear-gradient(180deg, rgba(12,17,29,0.92), rgba(12,17,29,0.78))",
          }}
        >
          {preview?.url ? (
            <img
              src={preview.url}
              alt="Scan preview"
              style={{
                display: "block",
                width: "100%",
                minHeight: 640,
                maxHeight: 820,
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
              onUserMedia={() => pushEvent("Камера готова")}
              onUserMediaError={handleCameraError}
              style={{
                display: "block",
                width: "100%",
                minHeight: 640,
                objectFit: "cover",
              }}
            />
          )}

          {!preview?.url ? (
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
                    borderRadius: captureMode === "passport" ? 8 : 24,
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

        <div style={{ padding: 16 }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            {preview?.url
              ? "Ниже показана scan-копия после выравнивания документа."
              : detection.status === "detected"
                ? "OpenCV нашел контур. При съемке будет использовано перспективное выравнивание."
                : detection.status === "not_found"
                  ? `${captureLayout.helperText} Если контур не находится, сработает обрезка по рамке.`
                  : "OpenCV анализирует live-кадр. Держите документ ровно и уменьшите блики."}
          </Text>

          <Space wrap>
            {preview?.url ? (
              <>
                <Button icon={<ReloadOutlined />} onClick={resetPreview}>
                  Переснять
                </Button>
                <Button
                  type="primary"
                  icon={<ScanOutlined />}
                  loading={ocrStatus === "processing"}
                  onClick={handleRecognize}
                >
                  Распознать
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                icon={<CameraOutlined />}
                loading={shooting}
                disabled={Boolean(cameraError)}
                onClick={handleTakePhoto}
              >
                Снять
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Сбросить все
            </Button>
          </Space>
        </div>
      </Card>

      <Card title="OCR Result">
        {ocrStatus === "success" && normalizedEntries.length > 0 ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {preview?.url ? (
              <Image
                src={preview.url}
                alt="Recognized scan"
                style={{ maxWidth: 420, width: "100%" }}
              />
            ) : null}

            <Descriptions bordered size="small" column={1}>
              {normalizedEntries.map((entry) => (
                <Descriptions.Item key={entry.key} label={entry.key}>
                  {entry.value}
                </Descriptions.Item>
              ))}
            </Descriptions>

            <div>
              <Text type="secondary">Raw normalized JSON</Text>
              <Input.TextArea
                readOnly
                autoSize={{ minRows: 8, maxRows: 18 }}
                value={JSON.stringify(normalizedResult, null, 2)}
              />
            </div>
          </Space>
        ) : ocrStatus === "success" ? (
          <Empty description="OCR завершен, но нормализованных полей нет" />
        ) : (
          <Empty description="Снимите документ и запустите OCR" />
        )}
      </Card>

      <Card title="События">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {events.length === 0 ? (
            <Text type="secondary">Событий пока нет</Text>
          ) : (
            events.map((entry) => (
              <Text key={entry} code>
                {entry}
              </Text>
            ))
          )}
        </Space>
      </Card>

      <Card title="Технические заметки">
        <Space direction="vertical" size={4}>
          <Text code>detector: OpenCV contour detection</Text>
          <Text code>scan output: perspective warp or guide crop</Text>
          <Text code>ocr endpoint: POST /ocr/recognize</Text>
          <Text code>capture mode: {captureMode}</Text>
          <Text code>ocr document type: {ocrDocumentType}</Text>
        </Space>
      </Card>
    </Space>
  );
};

export default DocumentCaptureDebugLab;
