import { Button, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import ExistingEmployeeOcrLab from "@/modules/employees/ui/ExistingEmployeeOcrLab";

const { Paragraph, Title } = Typography;

const ExistingEmployeeOcrPage = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        maxWidth: 1480,
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
        Existing Employee OCR
      </Title>
      <Paragraph type="secondary">
        Временная страница для запуска OCR по уже загруженным документам
        сотрудников через существующие `fileId`, без повторной загрузки файлов.
      </Paragraph>

      <ExistingEmployeeOcrLab />
    </div>
  );
};

export default ExistingEmployeeOcrPage;
