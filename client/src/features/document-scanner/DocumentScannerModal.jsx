import { useCallback, useMemo, useRef, useState } from "react";
import { Button, Modal, Space } from "antd";
import {
  CameraOutlined,
  RotateRightOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";

export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  mode = "document",
}) => {
  const webcamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [saving, setSaving] = useState(false);

  const isPassportMode = mode === "passport";
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
  }, []);

  const videoConstraints = useMemo(
    () => ({
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }),
    [],
  );

  const handleCapture = useCallback(() => {
    if (!webcamRef.current || saving) {
      return;
    }

    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      return;
    }

    setCapturedImage(screenshot);
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!capturedImage || saving) {
      return;
    }

    setSaving(true);
    try {
      const blob = await fetch(capturedImage).then((res) => res.blob());
      onCapture(blob);
      onCancel();
    } finally {
      setSaving(false);
    }
  }, [capturedImage, onCancel, onCapture, saving]);

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
            src={capturedImage}
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
              loading={saving}
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
                loading={saving}
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
