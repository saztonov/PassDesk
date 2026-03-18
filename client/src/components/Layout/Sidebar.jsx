import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
  ShopOutlined,
  BankOutlined,
  ControlOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/authStore";
import settingsService from "@/services/settingsService";
import { useTranslation } from "react-i18next";

const { Sider } = Layout;

// Стили для кнопки сворачивания
const sidebarStyles = `
  .ant-layout-sider-trigger {
    background-color: #ffffff !important;
    color: #000000 !important;
  }
`;

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const isOtEngineer = user?.role === "ot_engineer";
  const isOtAdmin = user?.role === "ot_admin";

  // Загрузить defaultCounterpartyId при монтировании
  useEffect(() => {
    const loadDefaultCounterpartyId = async () => {
      try {
        const response = await settingsService.getPublicSettings();
        if (response.success && response.data.defaultCounterpartyId) {
          setDefaultCounterpartyId(response.data.defaultCounterpartyId);
        }
      } catch (error) {
        console.error("Error loading default counterparty ID:", error);
      }
    };

    loadDefaultCounterpartyId();
  }, []);

  // Проверка: показывать ли меню Контрагенты для user
  const showCounterpartiesMenu =
    user?.role === "admin" ||
    (user?.role === "user" &&
      user?.counterpartyId &&
      user?.counterpartyId !== defaultCounterpartyId);

  const isDefaultCounterpartyUser =
    user?.role === "user" &&
    user?.counterpartyId &&
    defaultCounterpartyId &&
    String(user.counterpartyId) === String(defaultCounterpartyId);

  const showOtMenu =
    isOtEngineer ||
    isOtAdmin ||
    user?.role === "admin" ||
    (user?.role === "user" && !isDefaultCounterpartyUser);

  // Меню для обычных пользователей (role: user)
  const userMenuItems = [
    {
      key: "/employees",
      icon: <TeamOutlined />,
      label: t("menu.employees"),
    },
  ];

  if (showOtMenu) {
    userMenuItems.push({
      key: "/ot",
      icon: <SafetyCertificateOutlined />,
      label: t("menu.ot"),
    });
  }

  // Добавляем Справочники для user (не default)
  if (showCounterpartiesMenu) {
    userMenuItems.push({
      key: "/counterparties",
      icon: <ShopOutlined />,
      label: t("menu.counterparties"),
    });
  }

  // Меню для администраторов
  const adminMenuItems = [
    {
      key: "/employees",
      icon: <UserOutlined />,
      label: t("menu.employees"),
    },
    {
      key: "/ot",
      icon: <SafetyCertificateOutlined />,
      label: t("menu.ot"),
    },
    {
      key: "/directories",
      icon: <BankOutlined />,
      label: "Справочники",
    },
    {
      key: "/administration",
      icon: <ControlOutlined />,
      label: t("menu.administration"),
    },
    {
      key: "/skud",
      icon: <KeyOutlined />,
      label: t("menu.skud"),
    },
  ];
  const managerMenuItems = adminMenuItems.filter((item) => item.key !== "/skud");

  const engineerMenuItems = [
    {
      key: "/ot",
      icon: <SafetyCertificateOutlined />,
      label: t("menu.ot"),
    },
  ];

  const otAdminMenuItems = [...engineerMenuItems];
  const laborerMenuItems = [
    {
      key: "/cabinet",
      icon: <QrcodeOutlined />,
      label: t("menu.cabinet"),
    },
  ];
  // Выбираем меню на основе роли пользователя
  let menuItems = [];
  if (user?.role === "user") {
    menuItems = [...userMenuItems];
  } else if (user?.role === "admin") {
    menuItems = [...adminMenuItems];
  } else if (user?.role === "manager") {
    menuItems = [...managerMenuItems];
  } else if (user?.role === "laborer") {
    menuItems = [...laborerMenuItems];
  } else if (user?.role === "ot_engineer") {
    menuItems = [...engineerMenuItems];
  } else if (user?.role === "ot_admin") {
    menuItems = [...otAdminMenuItems];
  }

  const handleMenuClick = ({ key }) => {
    if (key === "logout") {
      logout();
      navigate("/login");
    } else {
      navigate(key);
    }
  };

  return (
    <>
      <style>{sidebarStyles}</style>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={250}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: collapsed ? 18 : 24,
            fontWeight: 700,
            color: "#2563eb",
            padding: "0 16px",
          }}
        >
          {collapsed ? "PD" : "PassDesk"}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ border: "none" }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 16,
            width: "100%",
            padding: "0 16px",
          }}
        >
          <Menu
            mode="inline"
            items={[
              {
                key: "logout",
                icon: <LogoutOutlined />,
                label: "Выйти",
                danger: true,
              },
            ]}
            onClick={handleMenuClick}
            style={{ border: "none" }}
          />
        </div>
      </Sider>
    </>
  );
};

export default Sidebar;
