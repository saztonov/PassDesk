import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  CameraOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import DocumentCaptureModal from "@/modules/employees/ui/DocumentCaptureModal";
import { detectDocumentCornersWithOpenCv } from "@/shared/lib/openCvDocumentScanner";

const { Paragraph, Text, Title } = Typography;

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const DocumentCaptureDebugLab = () => {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState("");
  const [capturedMeta, setCapturedMeta] = useState(null);
  const [testingImageUrl, setTestingImageUrl] = useState("");
  const [testingMeta, setTestingMeta] = useState(null);
  const [testingState, setTestingState] = useState({
    loading: false,
    error: "",
    corners: [],
    dimensions: null,
  });

  const overlayPolygon = useMemo(() => {
    if (testingState.corners.length !== 4 || !testingState.dimensions) {
      return "";
    }

    return testingState.corners
      .map((point) => {
        const x = (point.x / testingState.dimensions.width) * 100;
        const y = (point.y / testingState.dimensions.height) * 100;
        return `${clamp(x, 0, 100)},${clamp(y, 0, 100)}`;
      })
      .join(" ");
  }, [testingState.corners, testingState.dimensions]);

  const handleCameraCapture = async (blob) => {
    const url = URL.createObjectURL(blob);
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }

    setCapturedPreviewUrl(url);
    setCapturedMeta({
      size: blob.size,
      type: blob.type,
      updatedAt: new Date().toLocaleTimeString(),
    });
    setCameraOpen(false);
  };

  const handleTestingFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const url = URL.createObjectURL(file);
    if (testingImageUrl) {
      URL.revokeObjectURL(testingImageUrl);
    }

    setTestingImageUrl(url);
    setTestingMeta({
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      updatedAt: new Date().toLocaleTimeString(),
    });
    setTestingState({
      loading: true,
      error: "",
      corners: [],
      dimensions: null,
    });

    try {
      const image = await loadImageFromFile(file);
      const corners = await detectDocumentCornersWithOpenCv(image, "passport", {
        preview: true,
        allowWeak: true,
      });

      setTestingState({
        loading: false,
        error: "",
        corners,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
      });
    } catch (error) {
      setTestingState({
        loading: false,
        error: error?.message || "OpenCV не смог найти контур",
        corners: [],
        dimensions: null,
      });
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Live Camera Test
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Открывает текущий `DocumentCaptureModal` в изоляции от формы
          сотрудника. Если контур не появляется здесь, проблема не в upload
          flow, а в live OpenCV detection.
        </Paragraph>

        <Space wrap>
          <Button
            type="primary"
            icon={<CameraOutlined />}
            onClick={() => setCameraOpen(true)}
          >
            Открыть камеру
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (capturedPreviewUrl) {
                URL.revokeObjectURL(capturedPreviewUrl);
              }
              setCapturedPreviewUrl("");
              setCapturedMeta(null);
            }}
          >
            Сбросить результат
          </Button>
        </Space>

        {capturedPreviewUrl ? (
          <>
            <Divider />
            <img
              src={capturedPreviewUrl}
              alt="Captured debug preview"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 520,
                borderRadius: 12,
                border: "1px solid rgba(5, 5, 5, 0.08)",
              }}
            />
            {capturedMeta ? (
              <Descriptions
                column={1}
                size="small"
                bordered
                style={{ marginTop: 12, maxWidth: 520 }}
              >
                <Descriptions.Item label="Тип">
                  {capturedMeta.type}
                </Descriptions.Item>
                <Descriptions.Item label="Размер">
                  {capturedMeta.size} bytes
                </Descriptions.Item>
                <Descriptions.Item label="Обновлено">
                  {capturedMeta.updatedAt}
                </Descriptions.Item>
              </Descriptions>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Static Image Test
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Загружает фото и показывает, какой контур OpenCV нашёл на статичном
          изображении. Это помогает понять, валится ли алгоритм именно на
          конкретном кадре.
        </Paragraph>

        <Space wrap>
          <Button icon={<UploadOutlined />}>
            <label style={{ cursor: "pointer" }}>
              Загрузить фото
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleTestingFile}
              />
            </label>
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (testingImageUrl) {
                URL.revokeObjectURL(testingImageUrl);
              }
              setTestingImageUrl("");
              setTestingMeta(null);
              setTestingState({
                loading: false,
                error: "",
                corners: [],
                dimensions: null,
              });
            }}
          >
            Очистить
          </Button>
        </Space>

        {testingState.loading ? (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            message="OpenCV анализирует изображение"
            showIcon
          />
        ) : null}

        {testingState.error ? (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            message={testingState.error}
            showIcon
          />
        ) : null}

        {testingImageUrl ? (
          <>
            <Divider />
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 720,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <img
                src={testingImageUrl}
                alt="Static OpenCV test"
                style={{
                  display: "block",
                  width: "100%",
                  borderRadius: 12,
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

            <Space style={{ marginTop: 12 }} wrap>
              <Tag color={overlayPolygon ? "green" : "orange"}>
                {overlayPolygon ? "Контур найден" : "Контур не найден"}
              </Tag>
              {testingState.dimensions ? (
                <Tag>
                  {testingState.dimensions.width}x{testingState.dimensions.height}
                </Tag>
              ) : null}
            </Space>

            {testingMeta ? (
              <Descriptions
                column={1}
                size="small"
                bordered
                style={{ marginTop: 12, maxWidth: 720 }}
              >
                <Descriptions.Item label="Файл">
                  <Text copyable>{testingMeta.name}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Тип">
                  {testingMeta.type}
                </Descriptions.Item>
                <Descriptions.Item label="Размер">
                  {testingMeta.size} bytes
                </Descriptions.Item>
                <Descriptions.Item label="Проверено">
                  {testingMeta.updatedAt}
                </Descriptions.Item>
              </Descriptions>
            ) : null}
          </>
        ) : null}
      </Card>

      <DocumentCaptureModal
        open={cameraOpen}
        mode="passport"
        onCancel={() => setCameraOpen(false)}
        onFallback={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />
    </Space>
  );
};

export default DocumentCaptureDebugLab;
