import { useState } from "react";
import {
  Card,
  Avatar,
  Typography,
  Tag,
  Drawer,
  Spin,
  Empty,
  Switch,
  Button,
} from "antd";
import {
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { canManageUsers } from "@/shared/lib/accessControl";

const { Text } = Typography;

const getUserFullName = (user) =>
  [user?.lastName, user?.firstName].filter(Boolean).join(" ").trim() || "-";

const canManageTargetUser = (currentRole, currentUserId, targetUserId) =>
  canManageUsers(currentRole) && targetUserId !== currentUserId;

/**
 * Мобильный список пользователей (карточки)
 * Используется на устройствах с маленьким экраном
 */
const MobileUsersList = ({
  users,
  counterparties,
  loading,
  currentUser,
  onStatusToggle,
  onEdit,
}) => {
  const [selectedUser, setSelectedUser] = useState(null);

  // Роли
  const roleLabels = {
    admin: { text: "Администратор", color: "red" },
    laborer: { text: "Рабочий", color: "cyan" },
    ot_admin: { text: "Администратор ОТ", color: "magenta" },
    ot_engineer: { text: "Инженер ОТ", color: "blue" },
    manager: { text: "Менеджер", color: "gold" },
    user: { text: "Пользователь", color: "default" },
  };

  // Получить имя контрагента
  const getCounterpartyName = (counterpartyId) => {
    if (!counterpartyId) return "-";
    const counterparty = counterparties.find((c) => c.id === counterpartyId);
    return counterparty ? counterparty.name : "-";
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!users || users.length === 0) {
    return <Empty description="Нет пользователей" />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
        overflowX: "hidden",
        flex: 1,
        minHeight: 0,
        height: "100%",
        width: "100%",
        padding: "0 16px 16px 16px",
      }}
    >
      {users.map((user) => (
        <Card
          key={user.id}
          size="small"
          onClick={() => setSelectedUser(user)}
          style={{
            cursor: "pointer",
            borderRadius: 4,
          }}
          styles={{
            body: { padding: "8px 12px" },
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            {/* Левая часть - основная информация */}
            <div style={{ flex: 1, display: "flex", gap: 8, minWidth: 0 }}>
              {/* Аватар */}
              <Avatar
                size={36}
                icon={<UserOutlined />}
                style={{ backgroundColor: "#2563eb", flexShrink: 0 }}
              />

              {/* Информация */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* ФИО */}
                <Text
                  strong
                  style={{ fontSize: 13, display: "block", marginBottom: 2 }}
                >
                  {getUserFullName(user)}
                </Text>

                {/* Контрагент */}
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: "block", marginBottom: 4 }}
                >
                  {getCounterpartyName(user.counterpartyId)}
                </Text>

                {/* Email и УИН */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      color: "#999",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.email}
                  </Text>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, color: "#999", flexShrink: 0 }}
                  >
                    {(() => {
                      if (!user.identificationNumber) return "-";
                      const digits = user.identificationNumber
                        .toString()
                        .replace(/\D/g, "");
                      return digits.length >= 6
                        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}`
                        : user.identificationNumber;
                    })()}
                  </Text>
                </div>
              </div>
            </div>

            {/* Правая часть - переключатель статуса */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              {/* Переключатель Активен/Неактивен */}
              {canManageTargetUser(currentUser?.role, currentUser?.id, user.id) && (
                <Switch
                  checked={user.isActive}
                  onChange={() => onStatusToggle(user.id)}
                  onClick={(event) => event.stopPropagation()}
                  size="small"
                  style={{ margin: 0 }}
                />
              )}
              {/* Для остальных - только просмотр статуса */}
              {!canManageTargetUser(currentUser?.role, currentUser?.id, user.id) && (
                <Tag
                  icon={
                    user.isActive ? (
                      <CheckCircleOutlined />
                    ) : (
                      <CloseCircleOutlined />
                    )
                  }
                  color={user.isActive ? "success" : "default"}
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {user.isActive ? "Активен" : "Неактивен"}
                </Tag>
              )}
            </div>
          </div>
        </Card>
      ))}

      {/* Боковое окно просмотра пользователя */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          counterparties={counterparties}
          roleLabels={roleLabels}
          currentUser={currentUser}
          onEdit={onEdit}
        />
      )}
    </div>
  );
};

/**
 * Боковое окно для просмотра параметров пользователя
 */
const UserDrawer = ({
  user,
  open,
  onClose,
  counterparties,
  roleLabels,
  currentUser,
  onEdit,
}) => {
  // Получить имя контрагента
  const getCounterpartyName = (counterpartyId) => {
    if (!counterpartyId) return "-";
    const counterparty = counterparties.find((c) => c.id === counterpartyId);
    return counterparty ? counterparty.name : "-";
  };

  // Форматировать дату
  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ru-RU");
  };

  // Форматировать время
  const formatDateTime = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("ru-RU");
  };

  // Форматировать УИН в маску XXX-XXX
  const formatUIN = (value) => {
    if (!value) return "-";
    const digits = value.toString().replace(/\D/g, "");
    return digits.length >= 6
      ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}`
      : value;
  };

  const handleEdit = () => {
    onClose();
    onEdit(user);
  };

  return (
    <Drawer
      title="Параметры пользователя"
      placement="right"
      onClose={onClose}
      open={open}
      width={300}
      bodyStyle={{ paddingBottom: 80 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Аватар и ФИО */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Avatar
            size={80}
            icon={<UserOutlined />}
            style={{ backgroundColor: "#2563eb", marginBottom: 12 }}
          />
          <Text strong style={{ display: "block", fontSize: 16 }}>
            {getUserFullName(user)}
          </Text>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            {user.email}
          </Text>
        </div>

        {/* Данные */}
        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            Роль
          </Text>
          <Tag color={roleLabels[user.role]?.color}>
            {roleLabels[user.role]?.text}
          </Tag>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            Контрагент
          </Text>
          <Text>{getCounterpartyName(user.counterpartyId)}</Text>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            Статус
          </Text>
          <Tag
            icon={
              user.isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />
            }
            color={user.isActive ? "success" : "default"}
          >
            {user.isActive ? "Активен" : "Неактивен"}
          </Tag>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            Дата создания
          </Text>
          <Text>{formatDate(user.createdAt)}</Text>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            УИН
          </Text>
          <Text>{formatUIN(user.identificationNumber)}</Text>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            Последний вход
          </Text>
          <Text>{formatDateTime(user.lastLogin)}</Text>
        </div>

        {/* Кнопка редактирования */}
        {canManageUsers(currentUser?.role) && (
          <div
            style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}
          >
            <Button
              type="primary"
              block
              icon={<EditOutlined />}
              onClick={handleEdit}
            >
              Редактировать
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default MobileUsersList;
