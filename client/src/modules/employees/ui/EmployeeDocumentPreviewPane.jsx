import { useEffect, useState } from "react";
import { Button, Space, Spin, Typography } from "antd";
import {
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
  onDownload,
  height = 360,
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
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Text strong ellipsis style={{ maxWidth: 260 }}>
          {viewingFile.fileName}
        </Text>
        <Space size="small" wrap>
          <Text type="secondary" style={{ minWidth: 48, textAlign: "center" }}>
            {zoom}%
          </Text>
          <Button
            type="text"
            size="small"
            icon={<ZoomOutOutlined />}
            disabled={zoom <= 50}
            onClick={() => setZoom((prev) => Math.max(prev - 10, 50))}
          />
          <Button
            type="text"
            size="small"
            icon={<ZoomInOutlined />}
            disabled={zoom >= 300}
            onClick={() => setZoom((prev) => Math.min(prev + 10, 300))}
          />
          {isImage ? (
            <Button
              type="text"
              size="small"
              icon={<RotateLeftOutlined />}
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
            />
          ) : null}
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={onDownload}
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </Space>
      </div>

      <Spin spinning={loading} tip="Загрузка...">
        <div
          style={{
            height,
            overflow: "auto",
            background: "#fafafa",
            display: "flex",
            alignItems: isPdf ? "stretch" : "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          {isImage ? (
            <img
              src={viewingFile.url}
              alt={viewingFile.fileName}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-in-out",
              }}
            />
          ) : null}

          {isPdf ? (
            <iframe
              title={viewingFile.fileName}
              src={viewingFile.url}
              onLoad={() => setLoading(false)}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "#fff",
              }}
            />
          ) : null}

          {!isImage && !isPdf ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text type="secondary">Предпросмотр этого типа файла недоступен</Text>
            </div>
          ) : null}
        </div>
      </Spin>
    </div>
  );
};

export default EmployeeDocumentPreviewPane;
