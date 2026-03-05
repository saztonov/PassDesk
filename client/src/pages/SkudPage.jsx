import { Card, Space, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import SkudAdminSection from "@/components/Admin/Skud/SkudAdminSection";

const { Title } = Typography;

const SkudPage = () => {
  return (
    <div
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined />
            <Title level={3} style={{ margin: 0 }}>
              СКУД
            </Title>
          </Space>
        }
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: 0,
          padding: 0,
        }}
        styles={{
          body: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            padding: 0,
          },
        }}
      >
        <SkudAdminSection />
      </Card>
    </div>
  );
};

export default SkudPage;
