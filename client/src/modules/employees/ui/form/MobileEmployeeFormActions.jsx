import { FileOutlined, SaveOutlined } from "@ant-design/icons";
import { Button } from "antd";

const MobileEmployeeFormActions = ({
  loading,
  canSave,
  onSaveDraft,
  onSave,
  onCancel,
  inline = false,
}) => (
  <div
    style={{
      position: inline ? "static" : "fixed",
      bottom: inline ? "auto" : 0,
      left: inline ? "auto" : 0,
      right: inline ? "auto" : 0,
      padding: inline
        ? "12px 0 0 0"
        : "12px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
      background: inline ? "transparent" : "#fff",
      borderTop: inline ? "none" : "1px solid #f0f0f0",
      zIndex: inline ? "auto" : 1000,
      maxWidth: inline ? "100%" : "100vw",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <Button
      size="large"
      style={{ minHeight: 46, fontSize: 16 }}
      block
      icon={<FileOutlined />}
      onClick={onSaveDraft}
      loading={loading}
    >
      Сохранить
    </Button>

    <div style={{ display: "flex", gap: 10 }}>
      <Button
        type="primary"
        size="large"
        style={{ flex: 1, minHeight: 46, fontSize: 16 }}
        icon={<SaveOutlined />}
        onClick={onSave}
        loading={loading}
        disabled={!canSave}
      >
        Отправить
      </Button>
      <Button
        size="large"
        style={{
          flex: 1,
          minHeight: 46,
          fontSize: 16,
          borderColor: "#ff4d4f",
          color: "#ff4d4f",
        }}
        onClick={onCancel}
        disabled={loading}
      >
        Отмена
      </Button>
    </div>
  </div>
);

export default MobileEmployeeFormActions;
