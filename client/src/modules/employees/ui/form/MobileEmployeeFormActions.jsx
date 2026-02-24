import { FileOutlined, SaveOutlined } from "@ant-design/icons";
import { Button } from "antd";

const MobileEmployeeFormActions = ({
  loading,
  canSave,
  onSaveDraft,
  onSave,
  onCancel,
}) => (
  <div
    style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      padding: "8px 12px",
      background: "#fff",
      borderTop: "1px solid #f0f0f0",
      zIndex: 1000,
      maxWidth: "100vw",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Button
      size="small"
      block
      icon={<FileOutlined />}
      onClick={onSaveDraft}
      loading={loading}
    >
      Сохранить
    </Button>

    <div style={{ display: "flex", gap: 6 }}>
      <Button
        type="primary"
        size="small"
        style={{ flex: 1 }}
        icon={<SaveOutlined />}
        onClick={onSave}
        loading={loading}
        disabled={!canSave}
      >
        Отправить
      </Button>
      <Button
        size="small"
        style={{
          flex: 1,
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
