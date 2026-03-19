import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
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
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import ocrService from "@/services/ocrService";

const { Paragraph, Text, Title } = Typography;

const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  aspectRatio: { ideal: 4 / 3 },
};

const DOCUMENT_TYPE_OPTIONS = [
  { label: "Паспорт РФ", value: "passport_rf" },
  { label: "Иностранный паспорт", value: "foreign_passport" },
  { label: "Патент", value: "patent" },
  { label: "КИГ (лиц.)", value: "kig" },
  { label: "КИГ (спин.)", value: "kig_back" },
  { label: "ИНН", value: "inn" },
  { label: "СНИЛС", value: "snils" },
  { label: "Банковские реквизиты", value: "bank_details" },
  { label: "Виза", value: "visa" },
];

const createEmptyFrameState = () => ({
  url: "",
  file: null,
  dimensions: null,
  scan: {
    loading: false,
    error: "",
    normalized: null,
  },
  ocr: {
    loading: false,
    error: "",
    normalized: null,
  },
});

const loadImageFromUrl = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть изображение"));
    image.src = url;
  });

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть изображение"));
    };

    image.src = url;
  });

const createObjectUrl = (blob) => URL.createObjectURL(blob);

const formatError = (error) =>
  error?.response?.data?.message || error?.message || "Неизвестная ошибка";

const toScanNormalized = (response) =>
  response?.data?.normalized || response?.normalized || null;

const toRecognizeNormalized = (response) =>
  response?.data?.normalized || response?.normalized || null;

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

const buildOverlayPolygon = (normalized) => {
  const corners = normalized?.corners;
  if (!normalized?.detected || !Array.isArray(corners) || corners.length !== 4) {
    return "";
  }

  return corners
    .map((point) => `${(Number(point.x) / 1000) * 100},${(Number(point.y) / 1000) * 100}`)
    .join(" ");
};

const createCapturedFile = async (dataUrl) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], `document-capture-${Date.now()}.jpg`, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
};

const FramePreview = ({ title, frameState }) => {
  const overlayPolygon = useMemo(
    () => buildOverlayPolygon(frameState.scan.normalized),
    [frameState.scan.normalized],
  );
  const normalizedEntries = useMemo(
    () => flattenNormalizedPayload(frameState.ocr.normalized),
    [frameState.ocr.normalized],
  );

  return (
    <Card title={title}>
      {frameState.url ? (
        <>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 720,
              overflow: "hidden",
              borderRadius: 12,
              background: "#101418",
            }}
          >
            <img
              src={frameState.url}
              alt={title}
              style={{
                display: "block",
                width: "100%",
              }}
            />
            {overlayPolygon ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                <polygon
                  points={overlayPolygon}
                  fill="rgba(31, 232, 151, 0.16)"
                  stroke="rgba(31, 232, 151, 0.98)"
                  strokeWidth="0.45"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </div>

          <Space wrap style={{ marginTop: 12 }}>
            <Tag color={overlayPolygon ? "green" : "orange"}>
              {overlayPolygon ? "Контур найден" : "Контур не найден"}
            </Tag>
            {frameState.scan.normalized?.confidence ? (
              <Tag>confidence: {Number(frameState.scan.normalized.confidence).toFixed(2)}</Tag>
            ) : null}
            {frameState.dimensions ? (
              <Tag>
                {frameState.dimensions.width}x{frameState.dimensions.height}
              </Tag>
            ) : null}
          </Space>

          {frameState.scan.error ? (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              message={frameState.scan.error}
              showIcon
            />
          ) : null}

          {frameState.ocr.error ? (
            <Alert
              style={{ marginTop: 12 }}
              type="error"
              message={frameState.ocr.error}
              showIcon
            />
          ) : null}

          {frameState.dimensions ? (
            <Descriptions
              column={1}
              size="small"
              bordered
              style={{ marginTop: 12, maxWidth: 720 }}
            >
              <Descriptions.Item label="Ширина">
                {frameState.dimensions.width}
              </Descriptions.Item>
              <Descriptions.Item label="Высота">
                {frameState.dimensions.height}
              </Descriptions.Item>
            </Descriptions>
          ) : null}

          {frameState.ocr.normalized ? (
            <div style={{ marginTop: 16, maxWidth: 720 }}>
              <Text type="secondary">OCR normalized JSON</Text>
              <Input.TextArea
                readOnly
                autoSize={{ minRows: 8, maxRows: 16 }}
                value={JSON.stringify(frameState.ocr.normalized, null, 2)}
              />

              {normalizedEntries.length > 0 ? (
                <Descriptions
                  column={1}
                  size="small"
                  bordered
                  style={{ marginTop: 12 }}
                >
                  {normalizedEntries.map((entry) => (
                    <Descriptions.Item key={entry.key} label={entry.key}>
                      {entry.value}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <Empty description="Изображение еще не выбрано" />
      )}
    </Card>
  );
};

const DocumentCaptureDebugLab = () => {
  const { message } = App.useApp();
  const webcamRef = useRef(null);
  const cameraUrlRef = useRef("");
  const uploadUrlRef = useRef("");

  const [documentType, setDocumentType] = useState("passport_rf");
  const [cameraError, setCameraError] = useState("");
  const [cameraFrame, setCameraFrame] = useState(createEmptyFrameState);
  const [uploadedFrame, setUploadedFrame] = useState(createEmptyFrameState);

  useEffect(
    () => () => {
      if (cameraUrlRef.current) {
        URL.revokeObjectURL(cameraUrlRef.current);
      }
      if (uploadUrlRef.current) {
        URL.revokeObjectURL(uploadUrlRef.current);
      }
    },
    [],
  );

  const resetCameraFrame = () => {
    if (cameraUrlRef.current) {
      URL.revokeObjectURL(cameraUrlRef.current);
      cameraUrlRef.current = "";
    }
    setCameraFrame(createEmptyFrameState());
  };

  const resetUploadedFrame = () => {
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current);
      uploadUrlRef.current = "";
    }
    setUploadedFrame(createEmptyFrameState());
  };

  const captureCameraFrame = async () => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) {
      setCameraError("Не удалось снять кадр с камеры");
      return;
    }

    setCameraError("");
    resetCameraFrame();

    try {
      const file = await createCapturedFile(dataUrl);
      const url = createObjectUrl(file);
      const image = await loadImageFromUrl(dataUrl);
      cameraUrlRef.current = url;

      setCameraFrame({
        url,
        file,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
        scan: {
          loading: false,
          error: "",
          normalized: null,
        },
        ocr: {
          loading: false,
          error: "",
          normalized: null,
        },
      });
    } catch (error) {
      setCameraError(formatError(error));
    }
  };

  const handleUploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    resetUploadedFrame();

    try {
      const image = await loadImageFromFile(file);
      const url = createObjectUrl(file);
      uploadUrlRef.current = url;

      setUploadedFrame({
        url,
        file,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
        scan: {
          loading: false,
          error: "",
          normalized: null,
        },
        ocr: {
          loading: false,
          error: "",
          normalized: null,
        },
      });
    } catch (error) {
      message.error(formatError(error));
    }
  };

  const runScan = async (frameState, setFrameState) => {
    if (!frameState.file) {
      return;
    }

    setFrameState((previous) => ({
      ...previous,
      scan: {
        loading: true,
        error: "",
        normalized: null,
      },
    }));

    try {
      const response = await ocrService.scanDocument({
        documentType,
        file: frameState.file,
      });
      const normalized = toScanNormalized(response);

      setFrameState((previous) => ({
        ...previous,
        scan: {
          loading: false,
          error: "",
          normalized,
        },
      }));
    } catch (error) {
      setFrameState((previous) => ({
        ...previous,
        scan: {
          loading: false,
          error: formatError(error),
          normalized: null,
        },
      }));
    }
  };

  const runRecognize = async (frameState, setFrameState) => {
    if (!frameState.file) {
      return;
    }

    setFrameState((previous) => ({
      ...previous,
      ocr: {
        loading: true,
        error: "",
        normalized: null,
      },
    }));

    try {
      const response = await ocrService.recognizeDocument({
        documentType,
        file: frameState.file,
      });
      const normalized = toRecognizeNormalized(response);

      setFrameState((previous) => ({
        ...previous,
        ocr: {
          loading: false,
          error: "",
          normalized,
        },
      }));
    } catch (error) {
      setFrameState((previous) => ({
        ...previous,
        ocr: {
          loading: false,
          error: formatError(error),
          normalized: null,
        },
      }));
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Server-Side Scan Debug
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          На этой странице больше нет клиентского OpenCV. Телефон только снимает
          фото, а поиск контура и OCR запускаются по кнопке через backend API.
        </Paragraph>

        <Space wrap>
          <div>
            <Text type="secondary">Тип документа</Text>
            <Select
              style={{ width: 220, display: "block", marginTop: 4 }}
              value={documentType}
              options={DOCUMENT_TYPE_OPTIONS}
              onChange={setDocumentType}
            />
          </div>
        </Space>

        {cameraError ? (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            message={cameraError}
            showIcon
          />
        ) : null}
      </Card>

      <Card title="Camera Capture">
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 720,
            overflow: "hidden",
            borderRadius: 12,
            background: "#101418",
          }}
        >
          {!cameraFrame.url ? (
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={1}
              forceScreenshotSourceSize
              imageSmoothing
              minScreenshotWidth={1600}
              minScreenshotHeight={1200}
              videoConstraints={VIDEO_CONSTRAINTS}
              onUserMediaError={() =>
                setCameraError("Не удалось открыть live-камеру")
              }
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "4 / 3",
                objectFit: "cover",
              }}
            />
          ) : (
            <img
              src={cameraFrame.url}
              alt="Camera capture"
              style={{ display: "block", width: "100%" }}
            />
          )}
        </div>

        <Space wrap style={{ marginTop: 16 }}>
          <Button type="primary" icon={<CameraOutlined />} onClick={captureCameraFrame}>
            Снять кадр
          </Button>
          <Button
            icon={<SearchOutlined />}
            disabled={!cameraFrame.file}
            loading={cameraFrame.scan.loading}
            onClick={() => runScan(cameraFrame, setCameraFrame)}
          >
            Найти контур
          </Button>
          <Button
            icon={<ScanOutlined />}
            disabled={!cameraFrame.file}
            loading={cameraFrame.ocr.loading}
            onClick={() => runRecognize(cameraFrame, setCameraFrame)}
          >
            Распознать
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetCameraFrame}>
            Сбросить
          </Button>
        </Space>
      </Card>

      <FramePreview title="Camera Result" frameState={cameraFrame} />

      <Card title="Uploaded Image">
        <Space wrap>
          <Button icon={<UploadOutlined />}>
            <label style={{ cursor: "pointer" }}>
              Загрузить фото
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleUploadFile}
              />
            </label>
          </Button>
          <Button
            icon={<SearchOutlined />}
            disabled={!uploadedFrame.file}
            loading={uploadedFrame.scan.loading}
            onClick={() => runScan(uploadedFrame, setUploadedFrame)}
          >
            Найти контур
          </Button>
          <Button
            icon={<ScanOutlined />}
            disabled={!uploadedFrame.file}
            loading={uploadedFrame.ocr.loading}
            onClick={() => runRecognize(uploadedFrame, setUploadedFrame)}
          >
            Распознать
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetUploadedFrame}>
            Очистить
          </Button>
        </Space>
      </Card>

      <FramePreview title="Upload Result" frameState={uploadedFrame} />
    </Space>
  );
};

export default DocumentCaptureDebugLab;
