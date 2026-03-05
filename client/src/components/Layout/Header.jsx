import { useState } from "react";
import {
  Layout as AntLayout,
  Badge,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Grid,
  Button,
} from "antd";
import {
  BellOutlined,
  UserOutlined,
  DownOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/authStore";
import { usePageTitleStore } from "@/store/pageTitleStore";
import { useNavigate } from "react-router-dom";
import MobileDrawerMenu from "./MobileDrawerMenu";
import { useTranslation } from "react-i18next";

const { Header: AntHeader } = AntLayout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const Header = () => {
  const { user, logout } = useAuthStore();
  const { pageTitle } = usePageTitleStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [drawerVisible, setDrawerVisible] = useState(false);

  const userMenuItems = [
    // Пункты только для админов
    ...(user?.role === "admin"
      ? [
          {
            key: "employees",
            label: t("menu.employees"),
            icon: <TeamOutlined />,
            onClick: () => {
              navigate("/employees");
            },
          },
          {
            key: "admin",
            label: t("menu.administration"),
            icon: <SettingOutlined />,
            onClick: () => {
              navigate("/admin");
            },
          },
          {
            key: "skud",
            label: t("menu.skud"),
            icon: <KeyOutlined />,
            onClick: () => {
              navigate("/skud");
            },
          },
          {
            type: "divider",
          },
        ]
      : []),
    ...(user?.role === "manager"
      ? [
          {
            key: "skud",
            label: t("menu.skud"),
            icon: <KeyOutlined />,
            onClick: () => {
              navigate("/skud");
            },
          },
          {
            type: "divider",
          },
        ]
      : []),
    {
      key: "profile",
      label: t("common.profile"),
      icon: <UserOutlined />,
      onClick: () => {
        navigate("/profile");
      },
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      label: t("common.logout"),
      danger: true,
      onClick: () => {
        logout();
        navigate("/login");
      },
    },
  ];

  const getRoleLabel = (role) => {
    const roles = {
      admin: t("roles.admin"),
      ot_admin: t("roles.ot_admin"),
      ot_engineer: t("roles.ot_engineer"),
      manager: t("roles.manager"),
      user: t("roles.user"),
    };
    return roles[role] || role;
  };

  return (
    <>
      <AntHeader
        style={{
          padding: isMobile ? "0 16px" : "0 24px",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #f0f0f0",
          // Закрепление header для всех версий
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
      >
        {/* Левая часть - гамбургер-меню на мобильных или пусто на десктопе */}
        {isMobile ? (
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 20 }} />}
            onClick={() => setDrawerVisible(true)}
            style={{ padding: "8px 4px" }}
          />
        ) : (
          <div />
        )}

        {/* Центральная часть - название страницы на мобильных */}
        {isMobile && pageTitle && (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {pageTitle}
          </div>
        )}

        {/* Правая часть */}
        <Space size={isMobile ? "small" : "large"}>
          {/* Уведомления скрываем на мобильных */}
          {!isMobile && (
            <Badge count={0} showZero={false}>
              <BellOutlined
                style={{ fontSize: 20, cursor: "pointer", color: "#666" }}
              />
            </Badge>
          )}

          {/* Меню пользователя только на десктопе */}
          {!isMobile && (
            <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
              <Space style={{ cursor: "pointer" }} size="small">
                <Avatar
                  size="default"
                  style={{ backgroundColor: "#2563eb" }}
                  icon={<UserOutlined />}
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    lineHeight: "1.2",
                  }}
                >
                  <Text strong style={{ fontSize: 14, margin: 0 }}>
                    {user?.firstName} {user?.lastName}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, margin: 0 }}>
                    {getRoleLabel(user?.role)}
                  </Text>
                </div>
                <DownOutlined style={{ fontSize: 12, color: "#666" }} />
              </Space>
            </Dropdown>
          )}
        </Space>
      </AntHeader>

      {/* Мобильное выдвижное меню */}
      <MobileDrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />
    </>
  );
};

export default Header;
