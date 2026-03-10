import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Image,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  CameraOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

const { Paragraph, Text, Title } = Typography;

const SCANDIT_LIBRARY_LOCATION =
  "https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-id@8.2.1/sdc-lib/";
const LICENSE_STORAGE_KEY = "document-capture-debug:scandit-license";
const DEFAULT_LICENSE_KEY = import.meta.env.VITE_SCANDIT_LICENSE_KEY || "";

const STATUS_LABELS = {
  idle: { color: "default", text: "Не запущен" },
  loading: { color: "processing", text: "Инициализация" },
  running: { color: "success", text: "Сканер запущен" },
  captured: { color: "success", text: "Документ считан" },
  rejected: { color: "warning", text: "Документ отклонен" },
  error: { color: "error", text: "Ошибка" },
  stopping: { color: "default", text: "Останавливаю" },
};

const createEmptySession = () => ({
  core: null,
  context: null,
  view: null,
  camera: null,
  idCapture: null,
  overlay: null,
  listener: null,
});

const disposeSession = async (sessionRef) => {
  const session = sessionRef.current;
  sessionRef.current = createEmptySession();

  if (session.idCapture && session.listener) {
    session.idCapture.removeListener(session.listener);
  }

  try {
    if (session.camera && session.core?.FrameSourceState?.Off) {
      await session.camera.switchToDesiredState(session.core.FrameSourceState.Off);
    }
  } catch (stopError) {
    console.error("Failed to stop Scandit camera", stopError);
  }

  try {
    session.view?.detachFromElement();
  } catch (detachError) {
    console.error("Failed to detach Scandit view", detachError);
  }

  try {
    await session.context?.dispose?.();
  } catch (disposeError) {
    console.error("Failed to dispose Scandit context", disposeError);
  }
};

const getInitialLicenseKey = () => {
  if (DEFAULT_LICENSE_KEY) {
    return DEFAULT_LICENSE_KEY;
  }

  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(LICENSE_STORAGE_KEY) || "";
};

const formatDateResult = (dateResult) => {
  if (!dateResult?.year) {
    return "n/a";
  }

  const day = String(dateResult.day || 1).padStart(2, "0");
  const month = String(dateResult.month || 1).padStart(2, "0");

  return `${day}.${month}.${dateResult.year}`;
};

const createCapturedIdSummary = (capturedId) => ({
  "Тип документа": capturedId.document?.documentType || "unknown",
  "Полное имя": capturedId.fullName || "n/a",
  Имя: capturedId.firstName || "n/a",
  Фамилия: capturedId.lastName || "n/a",
  "Номер документа": capturedId.documentNumber || "n/a",
  "Страна выдачи": capturedId.issuingCountryIso || "n/a",
  Гражданство: capturedId.nationalityISO || "n/a",
  "Дата рождения": formatDateResult(capturedId.dateOfBirth),
  "Дата выдачи": formatDateResult(capturedId.dateOfIssue),
  "Дата окончания": formatDateResult(capturedId.dateOfExpiry),
  Адрес: capturedId.address || "n/a",
  "Полнота захвата": capturedId.isCapturingComplete ? "complete" : "partial",
});

const createImagePreviews = (capturedId, idSideEnum) => {
  const previews = [
    {
      key: "front",
      title: "Cropped document",
      src: capturedId.images.getCroppedDocument(idSideEnum.Front),
    },
    {
      key: "frame",
      title: "Frame",
      src: capturedId.images.frame,
    },
    {
      key: "face",
      title: "Face",
      src: capturedId.images.face,
    },
  ];

  return previews.filter((image) => image.src);
};

const formatError = (error) => {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || error.name || "Unknown error";
};

const DocumentCaptureDebugLab = () => {
  const scannerHostRef = useRef(null);
  const sessionRef = useRef(createEmptySession());
  const startRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const [licenseKey, setLicenseKey] = useState(getInitialLicenseKey);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [capturedSummary, setCapturedSummary] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [events, setEvents] = useState([]);

  const pushEvent = (message) => {
    const timestamp = new Date().toLocaleTimeString("ru-RU");

    setEvents((previous) => [`${timestamp} ${message}`, ...previous].slice(0, 10));
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      void disposeSession(sessionRef);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (licenseKey) {
      window.localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey);
      return;
    }

    window.localStorage.removeItem(LICENSE_STORAGE_KEY);
  }, [licenseKey]);

  const startScanner = async () => {
    const trimmedLicenseKey = licenseKey.trim();

    if (!trimmedLicenseKey) {
      setError("Добавь Scandit license key");
      return;
    }

    if (!scannerHostRef.current) {
      setError("Контейнер сканера не готов");
      return;
    }

    const requestId = startRequestIdRef.current + 1;
    startRequestIdRef.current = requestId;

    setStatus("loading");
    setError("");
    setRejectionReason("");
    setCapturedSummary(null);
    setCapturedImages([]);
    setEvents([]);
    pushEvent("Запускаю Scandit");

    await disposeSession(sessionRef);

    try {
      const [core, idCaptureSdk] = await Promise.all([
        import("@scandit/web-datacapture-core"),
        import("@scandit/web-datacapture-id"),
      ]);

      if (!mountedRef.current || requestId !== startRequestIdRef.current) {
        return;
      }

      const context = await core.DataCaptureContext.forLicenseKey(
        trimmedLicenseKey,
        {
          libraryLocation: SCANDIT_LIBRARY_LOCATION,
          moduleLoaders: [
            idCaptureSdk.idCaptureLoader({
              enableVIZDocuments: true,
            }),
          ],
        },
      );
      sessionRef.current.context = context;

      const view = await core.DataCaptureView.forContext(context);
      sessionRef.current.view = view;
      view.connectToElement(scannerHostRef.current);

      const settings = new idCaptureSdk.IdCaptureSettings();
      settings.scanner = new idCaptureSdk.FullDocumentScanner();
      settings.acceptedDocuments = [
        new idCaptureSdk.Passport(idCaptureSdk.Region.Russia),
      ];
      settings.setShouldPassImageTypeToResult(
        idCaptureSdk.IdImageType.CroppedDocument,
        true,
      );
      settings.setShouldPassImageTypeToResult(
        idCaptureSdk.IdImageType.Frame,
        true,
      );

      const idCapture = await idCaptureSdk.IdCapture.forContext(
        context,
        settings,
      );
      sessionRef.current.idCapture = idCapture;

      const overlay = await idCaptureSdk.IdCaptureOverlay.withIdCaptureForView(
        idCapture,
        view,
      );
      sessionRef.current.overlay = overlay;
      overlay.showTextHints = true;
      overlay.idLayoutStyle = idCaptureSdk.IdLayoutStyle.Rounded;
      overlay.idLayoutLineStyle = idCaptureSdk.IdLayoutLineStyle.Bold;

      const listener = {
        didLocalizeId: () => {
          if (!mountedRef.current) {
            return;
          }

          pushEvent("Документ локализован");
        },
        didCaptureId: async (capturedId) => {
          if (!mountedRef.current) {
            return;
          }

          pushEvent("Документ считан");
          setStatus("captured");
          setError("");
          setRejectionReason("");
          setCapturedSummary(createCapturedIdSummary(capturedId));
          setCapturedImages(
            createImagePreviews(capturedId, idCaptureSdk.IdSide),
          );

          try {
            await idCapture.setEnabled(false);
          } catch (disableError) {
            console.error("Failed to disable Scandit after capture", disableError);
          }
        },
        didRejectId: (_, reason) => {
          if (!mountedRef.current) {
            return;
          }

          pushEvent(`Документ отклонен: ${reason}`);
          setStatus("rejected");
          setRejectionReason(reason);
        },
        didFailWithError: (_, sdkError) => {
          if (!mountedRef.current) {
            return;
          }

          const message = formatError(sdkError);
          pushEvent(`Ошибка: ${message}`);
          setStatus("error");
          setError(message);
        },
      };

      idCapture.addListener(listener);
      sessionRef.current.listener = listener;
      sessionRef.current.core = core;

      const camera = core.Camera.pickBestGuessForPosition(
        core.CameraPosition.WorldFacing,
      );
      sessionRef.current.camera = camera;
      await camera.applySettings(idCaptureSdk.IdCapture.recommendedCameraSettings);
      await context.setFrameSource(camera);
      await camera.switchToDesiredState(core.FrameSourceState.On);

      if (!mountedRef.current || requestId !== startRequestIdRef.current) {
        await disposeSession(sessionRef);
        return;
      }

      setStatus("running");
      pushEvent("Камера запущена");
    } catch (startError) {
      await disposeSession(sessionRef);

      if (!mountedRef.current) {
        return;
      }

      const message = formatError(startError);
      setStatus("error");
      setError(message);
      pushEvent(`Старт не удался: ${message}`);
    }
  };

  const handleStop = async () => {
    setStatus("stopping");
    pushEvent("Останавливаю сканер");
    await disposeSession(sessionRef);

    if (!mountedRef.current) {
      return;
    }

    setStatus("idle");
  };

  const handleReset = async () => {
    setCapturedSummary(null);
    setCapturedImages([]);
    setRejectionReason("");
    setError("");
    setEvents([]);

    if (sessionRef.current.idCapture) {
      try {
        await sessionRef.current.idCapture.reset();
        await sessionRef.current.idCapture.setEnabled(true);
      } catch (resetError) {
        setError(formatError(resetError));
        setStatus("error");
        return;
      }

      pushEvent("Сессия сканирования сброшена");
      setStatus("running");
      return;
    }

    setStatus("idle");
  };

  const statusMeta = STATUS_LABELS[status] || STATUS_LABELS.idle;
  const isBusy = status === "loading" || status === "stopping";

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space
          direction="vertical"
          size={12}
          style={{ width: "100%" }}
        >
          <div>
            <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
              Scandit ID Capture Test
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              OpenCV полностью убран с этой страницы. Камера запускается только
              по кнопке и работает через Scandit ID Capture.
            </Paragraph>
          </div>

          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            disabled={isBusy}
            placeholder="Scandit license key"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
          />

          <Space wrap>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={status === "loading"}
              disabled={status === "running" || status === "captured"}
              onClick={startScanner}
            >
              Запустить сканер
            </Button>
            <Button
              icon={<PauseCircleOutlined />}
              disabled={status === "idle" || status === "loading"}
              onClick={handleStop}
            >
              Остановить
            </Button>
            <Button
              icon={<ReloadOutlined />}
              disabled={isBusy}
              onClick={handleReset}
            >
              Сбросить
            </Button>
            <Tag color={statusMeta.color}>{statusMeta.text}</Tag>
          </Space>

          <Alert
            type="info"
            showIcon
            message="Что проверяем"
            description={
              <span>
                Страница специально стартует Scandit вручную, чтобы не морозить
                браузер на заходе. Assets грузятся с jsDelivr только для этой
                test page.
              </span>
            }
          />

          {error ? (
            <Alert type="error" showIcon message="Scandit error" description={error} />
          ) : null}

          {rejectionReason ? (
            <Alert
              type="warning"
              showIcon
              message="Документ отклонен"
              description={rejectionReason}
            />
          ) : null}
        </Space>
      </Card>

      <Card
        bodyStyle={{ padding: 0, overflow: "hidden" }}
        title="Camera Preview"
      >
        <div
          ref={scannerHostRef}
          style={{
            width: "100%",
            minHeight: 640,
            background:
              "linear-gradient(180deg, rgba(12,17,29,0.92), rgba(12,17,29,0.78))",
          }}
        />
      </Card>

      <Card title="События">
        {events.length ? (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {events.map((item) => (
              <Text key={item}>{item}</Text>
            ))}
          </Space>
        ) : (
          <Text type="secondary">Пока пусто</Text>
        )}
      </Card>

      <Card title="Результат">
        {capturedSummary ? (
          <Descriptions
            bordered
            column={1}
            size="small"
            items={Object.entries(capturedSummary).map(([label, value]) => ({
              key: label,
              label,
              children: value,
            }))}
          />
        ) : (
          <Text type="secondary">Считанный документ пока не получен</Text>
        )}
      </Card>

      {capturedImages.length ? (
        <Card title="Изображения от Scandit">
          <Space wrap size={16}>
            {capturedImages.map((image) => (
              <div key={image.key} style={{ width: 220 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>
                  {image.title}
                </Text>
                <Image
                  src={image.src}
                  alt={image.title}
                  width={220}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ))}
          </Space>
        </Card>
      ) : null}

      <Card title="Технические заметки">
        <Space direction="vertical" size={4}>
          <Text code>libraryLocation: {SCANDIT_LIBRARY_LOCATION}</Text>
          <Text code>acceptedDocuments: Passport(Region.Russia)</Text>
          <Text code>scanner: FullDocumentScanner</Text>
        </Space>
      </Card>
    </Space>
  );
};

export default DocumentCaptureDebugLab;
