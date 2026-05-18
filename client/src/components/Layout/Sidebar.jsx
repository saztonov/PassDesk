import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button, Dropdown, Layout, Menu } from "antd";
import {
  IdcardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
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
import { canAccessOt } from "@/shared/lib/accessControl";
import { useTranslation } from "react-i18next";

const { Sider } = Layout;
const SHOW_SKUD_SIDE_MENU_ITEM = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "passdesk.sidebar.collapsed";
const SIDEBAR_CLASS_NAME = "passdesk-layout-sidebar";

const sidebarStyles = `
  .${SIDEBAR_CLASS_NAME} .ant-layout-sider-children {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    position: relative;
  }
`;

const getInitialCollapsedState = () => {
  if (typeof window === "undefined") {
    return true;
  }

  const storedValue = window.localStorage.getItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
  );

  if (storedValue === "true") return true;
  if (storedValue === "false") return false;

  return true;
};

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(getInitialCollapsedState);
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const isLaborer = user?.role === "laborer";
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

  const isSubcontractorUser =
    user?.role === "user" &&
    user?.counterpartyId &&
    defaultCounterpartyId &&
    String(user.counterpartyId) !== String(defaultCounterpartyId);

  const showOtMenu = canAccessOt({
    role: user?.role,
    isDefaultCounterpartyUser,
    isOtEngineer,
    isOtAdmin,
  });

  // Меню для обычных пользователей (role: user)
  let userMenuItems;
  if (isSubcontractorUser) {
    // Субподрядчику доступен только раздел «Охрана труда»
    userMenuItems = [
      {
        key: "/ot",
        icon: <SafetyCertificateOutlined />,
        label: t("menu.ot"),
      },
    ];
  } else {
    userMenuItems = [
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
    ...(SHOW_SKUD_SIDE_MENU_ITEM
      ? [
          {
            key: "/skud",
            icon: <KeyOutlined />,
            label: t("menu.skud"),
          },
        ]
      : []),
  ];
  const managerMenuItems = adminMenuItems.filter(
    (item) => item.key !== "/skud" && item.key !== "/ot",
  );

  const engineerMenuItems = [
    {
      key: "/ot",
      icon: <SafetyCertificateOutlined />,
      label: t("menu.ot"),
    },
  ];

  const otAdminMenuItems = [
    ...engineerMenuItems,
    {
      key: "/directories",
      icon: <BankOutlined />,
      label: "Справочники",
    },
  ];
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

  const profilePath = isLaborer ? "/cabinet" : "/profile";
  const profileLabel = isLaborer ? t("menu.cabinet") : t("common.profile");
  const profileMenuItems = [
    {
      key: "profile",
      icon: <IdcardOutlined />,
      label: profileLabel,
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: t("common.logout"),
      danger: true,
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleProfileMenuClick = ({ key }) => {
    if (key === "logout") {
      logout();
      return;
    }
    if (key === "profile") {
      navigate(profilePath);
    }
  };

  const handleCollapse = (nextCollapsed) => {
    setCollapsed(nextCollapsed);
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(nextCollapsed),
    );
  };

  return (
    <>
      <style>{sidebarStyles}</style>
      <Sider
      className={SIDEBAR_CLASS_NAME}
      trigger={null}
      collapsed={collapsed}
      width={250}
      style={{
        height: "100vh",
        position: "sticky",
        left: 0,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
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

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          paddingBottom: collapsed ? 60 : 108,
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ border: "none" }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: collapsed ? 8 : 0,
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          flexDirection: "column",
          flexWrap: "nowrap",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "stretch",
          gap: collapsed ? 6 : 0,
        }}
      >
        <div
          style={{
            flex: collapsed ? "none" : 1,
            width: collapsed ? 32 : "100%",
            display: "flex",
            justifyContent: collapsed ? "center" : "stretch",
          }}
        >
          <Dropdown
            trigger={["click"]}
            placement={collapsed ? "rightTop" : "topLeft"}
            menu={{
              items: profileMenuItems,
              onClick: handleProfileMenuClick,
            }}
          >
            <Button
              type="text"
              icon={<IdcardOutlined />}
              style={{
                width: collapsed ? 32 : "100%",
                height: collapsed ? 36 : 48,
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: collapsed ? 6 : 0,
                paddingInline: collapsed ? 0 : 18,
                gap: collapsed ? 0 : 8,
              }}
            >
              {!collapsed ? profileLabel : null}
            </Button>
          </Dropdown>
        </div>
        <div
          style={{
            width: "100%",
            borderTop: collapsed ? "none" : "1px solid #f0f0f0",
            height: collapsed ? "auto" : 52,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-end",
            padding: collapsed ? 0 : "0 12px",
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => handleCollapse(!collapsed)}
            style={{
              height: collapsed ? 36 : 40,
              width: collapsed ? 32 : 40,
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
        </div>
      </div>
    </Sider>
    </>
  );
};

export default Sidebar;
