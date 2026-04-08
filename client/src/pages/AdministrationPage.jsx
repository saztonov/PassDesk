import { useState, useEffect } from "react";
import { Card, Tabs, Typography, Space, Grid, Segmented } from "antd";
import {
  SettingOutlined,
  TeamOutlined,
  GlobalOutlined,
  ShopOutlined,
  DeleteOutlined,
  FileImageOutlined,
  WarningOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import UsersPage from "./UsersPage";
import MobileUsersPage from "./MobileUsersPage";
import SettingsPage from "./SettingsPage";
import CitizenshipsPage from "./CitizenshipsPage";
import CounterpartiesPage from "./CounterpartiesPage";
import MobileCounterpartiesPage from "./MobileCounterpartiesPage";
import TrashPage from "./TrashPage";
import DocumentSamplesPage from "./DocumentSamplesPage";
import AuditLogsPage from "./AuditLogsPage";
import OcrConflictsAdminSection from "@/components/Admin/OcrConflictsAdminSection";
import OcrPromptsAdminSection from "@/components/Admin/OcrPromptsAdminSection";
import { useAuthStore } from "@/store/authStore";

const { Title } = Typography;
const { useBreakpoint } = Grid;

const AdministrationPage = () => {
  const { user } = useAuthStore();
  const isManager = user?.role === "manager";
  const renderTabLabel = (IconComponent, text) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <IconComponent />
      <span>{text}</span>
    </span>
  );

  const adminDesktopTabKeys = [
    "users",
    "counterparties",
    "citizenships",
    "audit-logs",
    "trash",
    "document-samples",
    "ocr-conflicts",
    "ocr-prompts",
    "settings",
  ];
  const managerDesktopTabKeys = adminDesktopTabKeys.filter(
    (key) =>
      key !== "document-samples" &&
      key !== "settings" &&
      key !== "users" &&
      key !== "ocr-prompts",
  );
  const validDesktopTabKeys = isManager
    ? managerDesktopTabKeys
    : adminDesktopTabKeys;

  const [activeTab, setActiveTab] = useState(() => {
    // Загружаем сохраненную вкладку из localStorage
    const savedTab = localStorage.getItem("administrationActiveTab");
    const defaultTab = isManager ? "counterparties" : "users";
    return validDesktopTabKeys.includes(savedTab) ? savedTab : defaultTab;
  });
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  // Сохраняем активную вкладку в localStorage при изменении
  useEffect(() => {
    localStorage.setItem("administrationActiveTab", activeTab);
  }, [activeTab]);

  // Десктопные вкладки (Tabs)
  const desktopItems = [
    {
      key: "users",
      label: renderTabLabel(TeamOutlined, "Пользователи"),
      children: <UsersPage />,
    },
    {
      key: "counterparties",
      label: renderTabLabel(ShopOutlined, "Контрагенты"),
      children: <CounterpartiesPage />,
    },
    {
      key: "citizenships",
      label: renderTabLabel(GlobalOutlined, "Гражданство"),
      children: <CitizenshipsPage />,
    },
    {
      key: "audit-logs",
      label: renderTabLabel(HistoryOutlined, "Журнал изменений"),
      children: <AuditLogsPage />,
    },
    {
      key: "trash",
      label: renderTabLabel(DeleteOutlined, "Корзина"),
      children: <TrashPage />,
    },
    {
      key: "ocr-conflicts",
      label: renderTabLabel(WarningOutlined, "OCR расхождения"),
      children: <OcrConflictsAdminSection />,
    },
    {
      key: "ocr-prompts",
      label: renderTabLabel(WarningOutlined, "OCR промпты"),
      children: <OcrPromptsAdminSection />,
    },
    ...(!isManager
      ? [
          {
            key: "document-samples",
            label: renderTabLabel(FileImageOutlined, "Образцы документов"),
            children: <DocumentSamplesPage />,
          },
          {
            key: "settings",
            label: renderTabLabel(SettingOutlined, "Настройки"),
            children: <SettingsPage />,
          },
        ]
      : []),
  ];

  // Мобильный рендер с полным контролем layout
  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Шапка */}
        <div
          style={{
            padding: "16px 16px 0 16px",
            flexShrink: 0,
            background: "#fff",
          }}
        >
          <Space>
            <SettingOutlined />
            <Title level={3} style={{ margin: 0 }}>
              Администрирование
            </Title>
          </Space>
        </div>

        {/* Переключатель вкладок */}
        <div
          style={{
            padding: "16px",
            flexShrink: 0,
            background: "#fff",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Segmented
            block
            size="large"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              ...(!isManager ? [{
                label: "Пользователи",
                value: "users",
                icon: <TeamOutlined />,
              }] : []),
              {
                label: "Контрагенты",
                value: "counterparties",
                icon: <ShopOutlined />,
              },
              {
                label: "Журнал",
                value: "audit-logs",
                icon: <HistoryOutlined />,
              },
            ]}
          />
        </div>

        {/* Контент (MobileUsersPage сам управляет прокруткой) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {activeTab === "users" && !isManager ? <MobileUsersPage /> : null}
          {activeTab === "counterparties" ? <MobileCounterpartiesPage /> : null}
          {activeTab === "audit-logs" ? <AuditLogsPage /> : null}
        </div>
      </div>
    );
  }

  // Десктопный рендер (Tabs)
  return (
    <div
      style={{
        padding: "0",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <style>{`
        .administration-tabs .ant-tabs-content-holder {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .administration-tabs .ant-tabs-content {
          height: 100%;
        }
        .administration-tabs .ant-tabs-tabpane {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .administration-tabs .ant-tabs-tabpane.ant-tabs-tabpane-active {
          overflow-y: auto;
          overflow-x: hidden;
        }
      `}</style>
      <Card
        title={
          <Space>
            <SettingOutlined />
            <Title level={3} style={{ margin: 0 }}>
              Администрирование
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
        <Tabs
          className="administration-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={desktopItems.filter((item) => !isManager || item.key !== "users")}
          size="large"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            margin: 0,
          }}
          tabBarStyle={{
            margin: 0,
            borderBottom: "1px solid #f0f0f0",
            flexShrink: 0,
            paddingLeft: "10px",
          }}
        />
      </Card>
    </div>
  );
};

export default AdministrationPage;
