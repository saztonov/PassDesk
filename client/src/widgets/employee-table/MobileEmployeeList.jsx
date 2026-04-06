import {
  Card,
  Avatar,
  Typography,
  Tag,
  Dropdown,
  Spin,
  Empty,
  Modal,
  Pagination,
} from "antd";
import {
  UserOutlined,
  PhoneOutlined,
  EllipsisOutlined,
  EditOutlined,
  DeleteOutlined,
  FileOutlined,
} from "@ant-design/icons";
import { formatPhone } from "@/utils/formatters";

const { Text } = Typography;

/**
 * Мобильный список сотрудников (карточки)
 * Используется на устройствах с маленьким экраном
 */
const MobileEmployeeList = ({
  employees,
  total = 0,
  loading,
  currentPage,
  pageSize,
  onPageChange,
  onView,
  onEdit,
  onDelete,
  onViewFiles,
  canDeleteEmployee,
  canMarkForDeletion,
  onMarkForDeletion,
}) => {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!employees || employees.length === 0) {
    return <Empty description="Нет сотрудников" />;
  }

  // Действия для каждой карточки
  const getMenuItems = (employee) => {
    const items = [
      {
        key: "edit",
        label: "Редактировать",
        icon: <EditOutlined />,
        onClick: () => onEdit(employee),
      },
      {
        key: "files",
        label: "Файлы",
        icon: <FileOutlined />,
        onClick: () => onViewFiles(employee),
      },
    ];

    // Добавляем удаление, если пользователь имеет право удалять этого сотрудника
    if (canDeleteEmployee && canDeleteEmployee(employee)) {
      items.push({
        type: "divider",
      });
      items.push({
        key: "delete",
        label: "Удалить",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => showDeleteConfirm(employee),
      });
    }

    if (
      canMarkForDeletion &&
      canMarkForDeletion(employee) &&
      !employee.markedForDeletion
    ) {
      items.push({
        type: "divider",
      });
      items.push({
        key: "markForDeletion",
        label: "На удаление",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => onMarkForDeletion(employee),
      });
    }

    return items;
  };

  // Показываем модальное окно подтверждения удаления
  const showDeleteConfirm = (employee) => {
    Modal.confirm({
      title: "Удалить сотрудника?",
      content: `${employee.lastName} ${employee.firstName} будет удален. Это действие нельзя отменить.`,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk() {
        return onDelete(employee.id);
      },
    });
  };

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
      {employees.map((employee) => (
        <Card
          key={employee.id}
          size="small"
          style={{
            borderRadius: 4,
          }}
          styles={{
            body: { padding: "6px 8px" },
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* Левая часть - основная информация (кликабельна) */}
            <div
              onClick={() => onView(employee)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onView(employee);
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                flex: 1,
                display: "flex",
                gap: 6,
                minWidth: 0,
                cursor: "pointer",
              }}
            >
              {/* Аватар */}
              <Avatar
                size={32}
                icon={<UserOutlined />}
                style={{ backgroundColor: "#2563eb", flexShrink: 0 }}
              />

              {/* Информация */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* ФИО */}
                <Text strong style={{ fontSize: 13 }}>
                  {employee.lastName} {employee.firstName}
                  {employee.markedForDeletion && (
                    <Tag
                      color="red"
                      style={{ fontSize: 10, marginLeft: 6, marginRight: 0 }}
                    >
                      🗑️
                    </Tag>
                  )}
                </Text>

                {/* Телефон */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: 4,
                    gap: 8,
                  }}
                >
                  {employee.phone && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "#666",
                      }}
                    >
                      <PhoneOutlined style={{ fontSize: 10, flexShrink: 0 }} />
                      <span>{formatPhone(employee.phone)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Правая часть - меню действий (НЕ кликабельна) */}
            <Dropdown
              menu={{ items: getMenuItems(employee) }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <EllipsisOutlined
                style={{
                  fontSize: 16,
                  padding: 2,
                  cursor: "pointer",
                  color: "#666",
                  flexShrink: 0,
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        </Card>
      ))}
      {onPageChange ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={["50", "100", "200"]}
            onChange={(page, nextPageSize) => onPageChange(page, nextPageSize)}
          />
        </div>
      ) : null}
    </div>
  );
};

export default MobileEmployeeList;
