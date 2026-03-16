import { memo } from "react";
import { LinkOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Divider, Upload } from "antd";

const EmployeeImportStepUpload = memo(({
  profileConfig,
  fileName,
  onFileSelect,
  onOpenTemplate,
}) => (
  <div style={{ padding: "40px 20px" }}>
    <div style={{ textAlign: "center", marginBottom: "32px" }}>
      <Upload
        maxCount={1}
        accept=".xlsx,.xls"
        beforeUpload={onFileSelect}
        fileList={fileName ? [{ name: fileName, uid: "-1" }] : []}
        droppable
      >
        <Button icon={<UploadOutlined />} size="large">
          Выберите файл Excel
        </Button>
      </Upload>
      <p style={{ marginTop: "12px", color: "#666", fontSize: "12px" }}>
        или перетащите файл сюда
      </p>
    </div>

    <Divider />

    <div style={{ marginBottom: "24px" }}>
      <h4 style={{ marginBottom: "12px" }}>📋 {profileConfig.uploadTitle}:</h4>
      <p style={{ color: "#666", marginBottom: "8px", fontSize: "12px" }}>
        {profileConfig.uploadDescription}
      </p>
      <div
        style={{
          background: "#f5f5f5",
          padding: "12px",
          borderRadius: "4px",
          fontSize: "12px",
        }}
      >
        {profileConfig.schemaLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>

    {profileConfig.templateUrl ? (
      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ marginBottom: "8px" }}>🔗 Скачать шаблон:</h4>
        <Button
          type="link"
          icon={<LinkOutlined />}
          onClick={onOpenTemplate}
          style={{ padding: 0 }}
        >
          Google таблица с бланком
        </Button>
      </div>
    ) : null}

    <div
      style={{
        background: "#e6f7ff",
        padding: "12px",
        borderRadius: "4px",
        fontSize: "12px",
      }}
    >
      {profileConfig.notes.map((note, index) => (
        <div
          key={note.title}
          style={{ marginBottom: index < profileConfig.notes.length - 1 ? "8px" : 0 }}
        >
          <strong>ℹ️ {note.title}:</strong> {note.text}
        </div>
      ))}
    </div>
  </div>
));

EmployeeImportStepUpload.displayName = "EmployeeImportStepUpload";

export default EmployeeImportStepUpload;
