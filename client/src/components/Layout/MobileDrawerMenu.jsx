import { useEffect, useState } from "react";
import { Drawer, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/authStore";
import { canAccessOt } from "@/shared/lib/accessControl";
import { useTranslation } from "react-i18next";
import settingsService from "@/services/settingsService";

/**
 * Мобильное выдвижное меню (Drawer)
 * Открывается по клику на гамбургер-меню
 */
const MobileDrawerMenu = ({ visible, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { t } = useTranslation();
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const isOtEngineer = user?.role === "ot_engineer";
  const isOtAdmin = user?.role === "ot_admin";

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

  // Верхняя часть меню (для админов и пользователей)
  const topMenuItems = [];

  if (user?.role === "laborer") {
    topMenuItems.push({
      key: "/cabinet",
      icon: <QrcodeOutlined />,
      label: t("menu.cabinet"),
    });
  }

  // Сотрудники доступны админам и пользователям
  if (user?.role === "admin" || user?.role === "manager" || user?.role === "user") {
    topMenuItems.push({
      key: "/employees",
      icon: <TeamOutlined />,
      label: t("menu.employees"),
    });
  }

  const showOtMenu = canAccessOt({
    role: user?.role,
    isDefaultCounterpartyUser:
      Boolean(defaultCounterpartyId) &&
      String(user?.counterpartyId) === String(defaultCounterpartyId),
    isOtEngineer,
    isOtAdmin,
  });

  if (showOtMenu) {
    topMenuItems.push({
      key: "/ot",
      icon: <SafetyCertificateOutlined />,
      label: t("menu.ot"),
    });
  }

  // Администирование только для админов
  if (user?.role === "admin" || user?.role === "manager") {
    topMenuItems.push({
      key: "/admin",
      icon: <SettingOutlined />,
      label: t("menu.administration"),
    });
  }

  if (user?.role === "admin") {
    topMenuItems.push({
      key: "/skud",
      icon: <KeyOutlined />,
      label: t("menu.skud"),
    });
  }

  // Нижняя часть меню (профиль и выход)
  const bottomMenuItems =
    user?.role === "laborer"
      ? [
          {
            key: "logout",
            icon: <LogoutOutlined />,
            label: t("common.logout"),
            danger: true,
          },
        ]
      : [
          {
            key: "/profile",
            icon: <UserOutlined />,
            label: t("common.profile"),
          },
          {
            key: "logout",
            icon: <LogoutOutlined />,
            label: t("common.logout"),
            danger: true,
          },
        ];

  const handleMenuClick = ({ key }) => {
    if (key === "logout") {
      logout();
      navigate("/login");
    } else {
      navigate(key);
    }
    onClose(); // Закрываем меню после клика
  };

  return (
    <Drawer
      title="PassDesk"
      placement="left"
      onClose={onClose}
      open={visible}
      width={280}
      styles={{
        body: {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
        header: {
          borderBottom: "1px solid #f0f0f0",
          fontSize: 20,
          fontWeight: 700,
          color: "#2563eb",
        },
      }}
    >
      {/* Верхняя часть меню */}
      {topMenuItems.length > 0 && (
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={topMenuItems}
          onClick={handleMenuClick}
          style={{ border: "none", flex: 0 }}
        />
      )}

      {/* Отступ для заполнения пространства */}
      <div style={{ flex: 1 }} />

      {/* Нижняя часть меню */}
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={bottomMenuItems}
        onClick={handleMenuClick}
        style={{ border: "none", borderTop: "1px solid #f0f0f0", flex: 0 }}
      />
    </Drawer>
  );
};

export default MobileDrawerMenu;
