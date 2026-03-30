import { useEffect, useState } from "react";
import { Button, Space, Spin, Typography } from "antd";
import {
  ArrowLeftOutlined,
  CloseOutlined,
  DownloadOutlined,
  RotateLeftOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

const EmployeeDocumentPreviewPane = ({
  viewingFile,
  onClose,
  onBack,
  onDownload,
  height = 360,
  fill = false,
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);

  const isImage = viewingFile?.mimeType?.startsWith("image/");
  const isPdf = viewingFile?.mimeType?.includes("pdf");

  useEffect(() => {
    setZoom(100);
    setRotation(0);
    setLoading(Boolean(viewingFile));
  }, [viewingFile]);

  if (!viewingFile) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
        ...(fill ? { display: "flex", flexDirection: "column", height: "100%" } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {onBack ? (
            <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ flexShrink: 0 }} />
          ) : null}
          <Text ellipsis style={{ fontSize: 12, maxWidth: 200 }}>
            {viewingFile.fileName}
          </Text>
        </div>
        <Space size={0}>
          <Text type="secondary" style={{ fontSize: 11, minWidth: 36, textAlign: "center" }}>
            {zoom}%
          </Text>
          <Button type="text" size="small" icon={<ZoomOutOutlined />} disabled={zoom <= 50} onClick={() => setZoom((prev) => Math.max(prev - 10, 50))} />
          <Button type="text" size="small" icon={<ZoomInOutlined />} disabled={zoom >= 300} onClick={() => setZoom((prev) => Math.min(prev + 10, 300))} />
          {isImage ? (
            <Button type="text" size="small" icon={<RotateLeftOutlined />} onClick={() => setRotation((prev) => (prev + 90) % 360)} />
          ) : null}
          <Button type="text" size="small" icon={<DownloadOutlined />} onClick={onDownload} />
          {onClose && !onBack ? (
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
          ) : null}
        </Space>
      </div>

      {fill ? (
        /* fill-режим: кастомный overlay чтобы не ломать flex-цепочку высоты */
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "auto",
            background: "#fafafa",
            display: "flex",
            alignItems: zoom > 100 ? "flex-start" : (isPdf ? "stretch" : "center"),
            justifyContent: zoom > 100 ? "flex-start" : "center",
            padding: 12,
          }}
        >
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.7)", zIndex: 1 }}>
              <Spin tip="Загрузка..." />
            </div>
          )}
          {isImage ? (
            <img
              src={viewingFile.url}
              alt={viewingFile.fileName}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              style={zoom > 100
                ? { width: `${zoom}%`, height: "auto", maxWidth: "none", flexShrink: 0, transform: `rotate(${rotation}deg)`, transition: "width 0.15s ease" }
                : { maxWidth: "100%", maxHeight: "100%", transform: `scale(${zoom / 100}) rotate(${rotation}deg)`, transformOrigin: "center center", transition: "transform 0.15s ease" }
              }
            />
          ) : null}
          {isPdf ? (
            <iframe
              title={viewingFile.fileName}
              src={viewingFile.url}
              onLoad={() => setLoading(false)}
              style={{ width: `${zoom}%`, minWidth: "100%", height: "100%", border: "none", background: "#fff" }}
            />
          ) : null}
          {!isImage && !isPdf ? (
            <Text type="secondary">Предпросмотр этого типа файла недоступен</Text>
          ) : null}
        </div>
      ) : (
        <Spin spinning={loading} tip="Загрузка...">
          <div
            style={{
              height,
              overflow: "auto",
              background: "#fafafa",
              display: "flex",
              alignItems: zoom > 100 ? "flex-start" : (isPdf ? "stretch" : "center"),
              justifyContent: zoom > 100 ? "flex-start" : "center",
              padding: 12,
            }}
          >
            {isImage ? (
              <img
                src={viewingFile.url}
                alt={viewingFile.fileName}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
                style={zoom > 100
                  ? { width: `${zoom}%`, height: "auto", maxWidth: "none", flexShrink: 0, transform: `rotate(${rotation}deg)`, transition: "width 0.15s ease" }
                  : { maxWidth: "100%", maxHeight: "100%", transform: `scale(${zoom / 100}) rotate(${rotation}deg)`, transformOrigin: "center center", transition: "transform 0.15s ease" }
                }
              />
            ) : null}
            {isPdf ? (
              <iframe
                title={viewingFile.fileName}
                src={viewingFile.url}
                onLoad={() => setLoading(false)}
                style={{ width: `${zoom}%`, minWidth: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            ) : null}
            {!isImage && !isPdf ? (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Text type="secondary">Предпросмотр этого типа файла недоступен</Text>
              </div>
            ) : null}
          </div>
        </Spin>
      )}
    </div>
  );
};

export default EmployeeDocumentPreviewPane;
