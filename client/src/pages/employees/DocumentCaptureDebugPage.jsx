import { Button, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import DocumentCaptureDebugLab from "@/modules/employees/ui/DocumentCaptureDebugLab";

const { Paragraph, Title } = Typography;

const DocumentCaptureDebugPage = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "24px 16px 40px",
      }}
    >
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/employees")}
        style={{ marginBottom: 16 }}
      >
        Назад
      </Button>

      <Title level={2} style={{ marginTop: 0 }}>
        Document Capture Debug
      </Title>
      <Paragraph type="secondary">
        Изолированная страница для проверки Scandit ID Capture без привязки к
        форме сотрудника и без OpenCV.
      </Paragraph>

      <DocumentCaptureDebugLab />
    </div>
  );
};

export default DocumentCaptureDebugPage;
