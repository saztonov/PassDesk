import { useEffect, useMemo, useRef, useState } from "react";
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
import Webcam from "react-webcam";
import {
  CameraOutlined,
  ReloadOutlined,
  ScanOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { detectDocumentCornersWithOpenCv } from "@/shared/lib/openCvDocumentScanner";

const { Paragraph, Text, Title } = Typography;

const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  aspectRatio: { ideal: 4 / 3 },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const DocumentCaptureDebugLab = () => {
  const webcamRef = useRef(null);
  const liveFrameUrlRef = useRef("");
  const staticImageUrlRef = useRef("");
  const [cameraError, setCameraError] = useState("");
  const [cameraFrame, setCameraFrame] = useState({
    url: "",
    dimensions: null,
    corners: [],
    loading: false,
    error: "",
  });
  const [staticImage, setStaticImage] = useState({
    url: "",
    meta: null,
    dimensions: null,
    corners: [],
    loading: false,
    error: "",
  });

  useEffect(
    () => () => {
      if (liveFrameUrlRef.current) {
        URL.revokeObjectURL(liveFrameUrlRef.current);
      }
      if (staticImageUrlRef.current) {
        URL.revokeObjectURL(staticImageUrlRef.current);
      }
    },
    [],
  );

  const cameraOverlayPolygon = useMemo(() => {
    if (cameraFrame.corners.length !== 4 || !cameraFrame.dimensions) {
      return "";
    }

    return cameraFrame.corners
      .map((point) => {
        const x = (point.x / cameraFrame.dimensions.width) * 100;
        const y = (point.y / cameraFrame.dimensions.height) * 100;
        return `${clamp(x, 0, 100)},${clamp(y, 0, 100)}`;
      })
      .join(" ");
  }, [cameraFrame.corners, cameraFrame.dimensions]);

  const staticOverlayPolygon = useMemo(() => {
    if (staticImage.corners.length !== 4 || !staticImage.dimensions) {
      return "";
    }

    return staticImage.corners
      .map((point) => {
        const x = (point.x / staticImage.dimensions.width) * 100;
        const y = (point.y / staticImage.dimensions.height) * 100;
        return `${clamp(x, 0, 100)},${clamp(y, 0, 100)}`;
      })
      .join(" ");
  }, [staticImage.corners, staticImage.dimensions]);

  const resetCameraFrame = () => {
    if (liveFrameUrlRef.current) {
      URL.revokeObjectURL(liveFrameUrlRef.current);
      liveFrameUrlRef.current = "";
    }
    setCameraFrame({
      url: "",
      dimensions: null,
      corners: [],
      loading: false,
      error: "",
    });
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
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const url = createObjectUrl(blob);
      const image = await loadImageFromUrl(dataUrl);
      liveFrameUrlRef.current = url;

      setCameraFrame({
        url,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
        corners: [],
        loading: false,
        error: "",
      });
    } catch (error) {
      setCameraError(error?.message || "Не удалось подготовить кадр");
    }
  };

  const analyzeCameraFrame = async () => {
    if (!cameraFrame.url) {
      setCameraError("Сначала снимите кадр");
      return;
    }

    setCameraFrame((prev) => ({
      ...prev,
      loading: true,
      error: "",
      corners: [],
    }));

    try {
      const image = await loadImageFromUrl(cameraFrame.url);
      const corners = await detectDocumentCornersWithOpenCv(image, "passport", {
        preview: true,
        allowWeak: true,
      });

      setCameraFrame((prev) => ({
        ...prev,
        loading: false,
        corners,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
      }));
    } catch (error) {
      setCameraFrame((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "OpenCV не смог найти контур",
      }));
    }
  };

  const handleStaticFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (staticImageUrlRef.current) {
      URL.revokeObjectURL(staticImageUrlRef.current);
      staticImageUrlRef.current = "";
    }

    const url = createObjectUrl(file);
    staticImageUrlRef.current = url;
    setStaticImage({
      url,
      meta: {
        name: file.name,
        size: file.size,
        type: file.type || "unknown",
        updatedAt: new Date().toLocaleTimeString(),
      },
      dimensions: null,
      corners: [],
      loading: true,
      error: "",
    });

    try {
      const image = await loadImageFromFile(file);
      const corners = await detectDocumentCornersWithOpenCv(image, "passport", {
        preview: true,
        allowWeak: true,
      });

      setStaticImage((prev) => ({
        ...prev,
        loading: false,
        corners,
        dimensions: {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        },
      }));
    } catch (error) {
      setStaticImage((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "OpenCV не смог найти контур",
      }));
    }
  };

  const resetStaticImage = () => {
    if (staticImageUrlRef.current) {
      URL.revokeObjectURL(staticImageUrlRef.current);
      staticImageUrlRef.current = "";
    }
    setStaticImage({
      url: "",
      meta: null,
      dimensions: null,
      corners: [],
      loading: false,
      error: "",
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Camera Frame Test
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Здесь нет live auto-detection. Сначала просто снимается кадр с камеры,
          потом отдельной кнопкой запускается OpenCV. Если этот экран работает
          стабильно, значит фриз был именно в цикле live detection.
        </Paragraph>

        {cameraError ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            message={cameraError}
            showIcon
          />
        ) : null}

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
          {cameraFrame.url ? (
            <>
              <img
                src={cameraFrame.url}
                alt="Camera frame"
                style={{ display: "block", width: "100%" }}
              />
              {cameraOverlayPolygon ? (
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
                    points={cameraOverlayPolygon}
                    fill="rgba(31, 232, 151, 0.16)"
                    stroke="rgba(31, 232, 151, 0.98)"
                    strokeWidth="0.45"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </>
          ) : (
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
          )}
        </div>

        <Space wrap style={{ marginTop: 16 }}>
          <Button
            type="primary"
            icon={<CameraOutlined />}
            onClick={captureCameraFrame}
          >
            Снять кадр
          </Button>
          <Button
            icon={<ScanOutlined />}
            disabled={!cameraFrame.url}
            loading={cameraFrame.loading}
            onClick={analyzeCameraFrame}
          >
            Найти контур
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetCameraFrame}>
            Сбросить
          </Button>
        </Space>

        {cameraFrame.error ? (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            message={cameraFrame.error}
            showIcon
          />
        ) : null}

        {cameraFrame.url ? (
          <>
            <Space style={{ marginTop: 12 }} wrap>
              <Tag color={cameraOverlayPolygon ? "green" : "orange"}>
                {cameraOverlayPolygon ? "Контур найден" : "Контур не найден"}
              </Tag>
              {cameraFrame.dimensions ? (
                <Tag>
                  {cameraFrame.dimensions.width}x{cameraFrame.dimensions.height}
                </Tag>
              ) : null}
            </Space>

            {cameraFrame.dimensions ? (
              <Descriptions
                column={1}
                size="small"
                bordered
                style={{ marginTop: 12, maxWidth: 720 }}
              >
                <Descriptions.Item label="Ширина">
                  {cameraFrame.dimensions.width}
                </Descriptions.Item>
                <Descriptions.Item label="Высота">
                  {cameraFrame.dimensions.height}
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
          изображении.
        </Paragraph>

        <Space wrap>
          <Button icon={<UploadOutlined />}>
            <label style={{ cursor: "pointer" }}>
              Загрузить фото
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleStaticFile}
              />
            </label>
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetStaticImage}>
            Очистить
          </Button>
        </Space>

        {staticImage.loading ? (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            message="OpenCV анализирует изображение"
            showIcon
          />
        ) : null}

        {staticImage.error ? (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            message={staticImage.error}
            showIcon
          />
        ) : null}

        {staticImage.url ? (
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
                src={staticImage.url}
                alt="Static OpenCV test"
                style={{
                  display: "block",
                  width: "100%",
                  borderRadius: 12,
                }}
              />
              {staticOverlayPolygon ? (
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
                    points={staticOverlayPolygon}
                    fill="rgba(31, 232, 151, 0.16)"
                    stroke="rgba(31, 232, 151, 0.98)"
                    strokeWidth="0.45"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </div>

            <Space style={{ marginTop: 12 }} wrap>
              <Tag color={staticOverlayPolygon ? "green" : "orange"}>
                {staticOverlayPolygon ? "Контур найден" : "Контур не найден"}
              </Tag>
              {staticImage.dimensions ? (
                <Tag>
                  {staticImage.dimensions.width}x{staticImage.dimensions.height}
                </Tag>
              ) : null}
            </Space>

            {staticImage.meta ? (
              <Descriptions
                column={1}
                size="small"
                bordered
                style={{ marginTop: 12, maxWidth: 720 }}
              >
                <Descriptions.Item label="Файл">
                  <Text copyable>{staticImage.meta.name}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Тип">
                  {staticImage.meta.type}
                </Descriptions.Item>
                <Descriptions.Item label="Размер">
                  {staticImage.meta.size} bytes
                </Descriptions.Item>
                <Descriptions.Item label="Проверено">
                  {staticImage.meta.updatedAt}
                </Descriptions.Item>
              </Descriptions>
            ) : null}
          </>
        ) : null}
      </Card>
    </Space>
  );
};

export default DocumentCaptureDebugLab;
