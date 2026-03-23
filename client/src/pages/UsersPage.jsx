import { useState, useEffect } from "react";
import {
  Table,
  Button,
  Input,
  Space,
  Typography,
  Tag,
  Tooltip,
  Modal,
  Form,
  Select,
  App,
  Popconfirm,
  Switch,
  Popover,
  Checkbox,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { userService } from "@/services/userService";
import { counterpartyService } from "@/services/counterpartyService";
import { useAuthStore } from "@/store/authStore";
import { canManageUsers } from "@/shared/lib/accessControl";

const { Title } = Typography;

const normalizeSortValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const compareNullableText = (left, right) =>
  normalizeSortValue(left).localeCompare(normalizeSortValue(right), "ru", {
    sensitivity: "base",
  });

const getUserFullName = (user) =>
  [user?.lastName, user?.firstName].filter(Boolean).join(" ").trim() || "-";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MIN_MESSAGE = `Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов`;

const applyServerValidationErrors = (targetForm, error) => {
  const responseErrors = error?.response?.data?.errors;

  if (!Array.isArray(responseErrors) || responseErrors.length === 0) {
    return false;
  }

  targetForm.setFields(
    responseErrors
      .filter((item) => item?.field)
      .map((item) => ({
        name: item.field,
        errors: item?.message ? [item.message] : [],
      })),
  );

  return true;
};

const canManageTargetUser = (currentRole, currentUserId, targetUserId) =>
  canManageUsers(currentRole) && targetUserId !== currentUserId;

const UsersPage = () => {
  const { message } = App.useApp();
  const [users, setUsers] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [editingUser, setEditingUser] = useState(null);
  const { user: currentUser } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  useEffect(() => {
    fetchUsers();
    fetchCounterparties();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.getAll({ limit: 10000 });
      setUsers(response?.data?.users || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const upsertUser = (userPayload) => {
    if (!userPayload?.id) return;
    setUsers((prev) => {
      const index = prev.findIndex((item) => item.id === userPayload.id);
      if (index === -1) {
        return [userPayload, ...prev];
      }
      const next = [...prev];
      next[index] = { ...next[index], ...userPayload };
      return next;
    });
  };

  const removeUser = (id) => {
    setUsers((prev) => prev.filter((item) => item.id !== id));
  };

  const fetchCounterparties = async () => {
    try {
      // Загружаем все контрагенты без ограничения для поиска в Select
      const response = await counterpartyService.getAll({
        limit: 10000,
        page: 1,
      });
      const counterpartiesData = response?.data?.data?.counterparties || [];
      setCounterparties(counterpartiesData);
    } catch (error) {
      console.error("Error loading counterparties:", error);
    }
  };

  // Восстановить пагинацию при смене поиска или фильтра
  useEffect(() => {
    setPagination({ current: 1, pageSize: 20 });
  }, [searchText, statusFilter]);

  const roleLabels = {
    admin: { text: "Администратор", color: "red" },
    laborer: { text: "Рабочий", color: "cyan" },
    ot_admin: { text: "Администратор ОТ", color: "magenta" },
    ot_engineer: { text: "Инженер ОТ", color: "blue" },
    manager: { text: "Менеджер", color: "gold" },
    user: { text: "Пользователь", color: "default" },
  };

  // Роли для селекта при создании/редактировании
  const selectableRoles = {
    admin: { text: "Администратор", color: "red" },
    laborer: { text: "Рабочий", color: "cyan" },
    ot_admin: { text: "Администратор ОТ", color: "magenta" },
    ot_engineer: { text: "Инженер ОТ", color: "blue" },
    manager: { text: "Менеджер", color: "gold" },
    user: { text: "Пользователь", color: "default" },
  };

  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      sorter: (a, b) => compareNullableText(a.email, b.email),
      render: (email) => (
        <Space>
          <UserOutlined style={{ color: "#2563eb" }} />
          <span>{email}</span>
        </Space>
      ),
    },
    {
      title: "ФИО",
      key: "fullName",
      render: (_, record) => <span>{getUserFullName(record)}</span>,
      sorter: (a, b) =>
        compareNullableText(getUserFullName(a), getUserFullName(b)),
    },
    {
      title: "Роль",
      dataIndex: "role",
      key: "role",
      render: (role) => (
        <Tag color={roleLabels[role]?.color}>{roleLabels[role]?.text}</Tag>
      ),
      filters: Object.entries(roleLabels).map(([key, value]) => ({
        text: value.text,
        value: key,
      })),
      onFilter: (value, record) => record.role === value,
    },
    {
      title: "Контрагент",
      dataIndex: "counterpartyId",
      key: "counterpartyId",
      render: (counterpartyId) => {
        const counterparty = counterparties.find(
          (c) => c.id === counterpartyId,
        );
        return counterparty ? counterparty.name : "-";
      },
    },
    {
      title: "Статус",
      dataIndex: "isActive",
      key: "isActive",
      render: (isActive, record) => {
        // Для администраторов - Switch, для остальных - Tag
        if (canManageTargetUser(currentUser?.role, currentUser?.id, record.id)) {
          return (
            <Switch
              checked={isActive}
              onChange={() => handleToggleStatus(record.id)}
              checkedChildren="Активен"
              unCheckedChildren="Неактивен"
            />
          );
        }
        return (
          <Tag
            icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={isActive ? "success" : "default"}
          >
            {isActive ? "Активен" : "Неактивен"}
          </Tag>
        );
      },
      filters: [
        { text: "Активен", value: true },
        { text: "Неактивен", value: false },
      ],
      onFilter: (value, record) => record.isActive === value,
    },
    {
      title: "Дата создания",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date) => new Date(date).toLocaleDateString("ru-RU"),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    },
    {
      title: "УИН",
      dataIndex: "identificationNumber",
      key: "identificationNumber",
      render: (value) => {
        if (!value) return "-";
        // Форматируем в маску XXX-XXX
        const digits = value.toString().replace(/\D/g, "");
        return digits.length >= 6
          ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}`
          : value;
      },
    },
    {
      title: "Действия",
      key: "actions",
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Изменить пароль">
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => handleChangePassword(record)}
              disabled={
                !canManageUsers(currentUser?.role) && record.id !== currentUser?.id
              }
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Popconfirm
              title="Удалить пользователя?"
              description="Это действие нельзя отменить."
              onConfirm={() => handleDelete(record.id)}
              okText="Удалить"
              okType="danger"
              cancelText="Отмена"
              disabled={
                !canManageTargetUser(currentUser?.role, currentUser?.id, record.id)
              }
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={
                  !canManageTargetUser(currentUser?.role, currentUser?.id, record.id)
                }
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    form.setFieldsValue(user);
    setIsModalOpen(true);
  };

  const handleChangePassword = (user) => {
    setEditingUser(user);
    passwordForm.resetFields();
    setIsPasswordModalOpen(true);
  };

  const handleToggleStatus = async (id) => {
    try {
      const response = await userService.toggleStatus(id);
      upsertUser(response?.data?.user);
      message.success("Статус пользователя изменен");
      await fetchUsers();
    } catch (error) {
      message.error(
        error.response?.data?.message || "Ошибка изменения статуса",
      );
    }
  };

  const handleDelete = async (id) => {
    try {
      await userService.delete(id);
      removeUser(id);
      message.success("Пользователь удален");
      await fetchUsers();
    } catch (error) {
      message.error(
        error.response?.data?.message || "Ошибка удаления пользователя",
      );
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingUser) {
        const response = await userService.update(editingUser.id, values);
        upsertUser(response?.data?.user);
        message.success("Пользователь обновлен");
      } else {
        const response = await userService.create(values);
        upsertUser(response?.data?.user);
        message.success("Пользователь создан");
      }

      setIsModalOpen(false);
      await fetchUsers();
    } catch (error) {
      if (error.errorFields) {
        // Validation error
        return;
      }
      if (applyServerValidationErrors(form, error)) {
        message.error(error?.response?.data?.errors?.[0]?.message || "Проверьте введенные данные");
        return;
      }
      message.error(
        error.response?.data?.message || "Ошибка сохранения пользователя",
      );
    }
  };

  const handlePasswordModalOk = async () => {
    try {
      const values = await passwordForm.validateFields();

      await userService.updatePassword(editingUser.id, values);
      message.success("Пароль обновлен");

      setIsPasswordModalOpen(false);
      passwordForm.resetFields();
    } catch (error) {
      if (error.errorFields) {
        return;
      }
      if (applyServerValidationErrors(passwordForm, error)) {
        message.error(error?.response?.data?.errors?.[0]?.message || "Проверьте введенные данные");
        return;
      }
      message.error(
        error.response?.data?.message || "Ошибка обновления пароля",
      );
    }
  };

  const handleModalCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handlePasswordModalCancel = () => {
    setIsPasswordModalOpen(false);
    passwordForm.resetFields();
  };

  const filteredUsers = users.filter((user) => {
    const searchLower = searchText.toLowerCase();
    const searchMatch =
      user.email?.toLowerCase().includes(searchLower) ||
      false ||
      user.firstName?.toLowerCase().includes(searchLower) ||
      false ||
      user.lastName?.toLowerCase().includes(searchLower) ||
      false ||
      user.identificationNumber?.toLowerCase().includes(searchLower) ||
      false;

    // Фильтрация по статусу
    let statusMatch = true;
    if (statusFilter.length > 0) {
      const isActive = user.isActive;
      statusMatch =
        (statusFilter.includes("active") && isActive) ||
        (statusFilter.includes("inactive") && !isActive);
    }

    return searchMatch && statusMatch;
  });

  const totalUsers = filteredUsers.length;
  const hasMultiplePages = totalUsers > pagination.pageSize;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Заголовок, поиск, фильтр и кнопка на одной строке */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "24px 24px 0 24px",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <Title level={2} style={{ margin: 0, flexShrink: 0 }}>
          Пользователи
        </Title>

        <div
          style={{ display: "flex", gap: 12, alignItems: "center", flex: 1 }}
        >
          <Input
            placeholder="Поиск по email или ФИО..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="large"
            style={{ maxWidth: 500 }}
          />
          <Popover
            content={
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minWidth: 200,
                }}
              >
                <div
                  style={{ fontSize: 12, fontWeight: "bold", color: "#666" }}
                >
                  Статус
                </div>
                <Checkbox.Group value={statusFilter} onChange={setStatusFilter}>
                  <Checkbox value="active">Активен</Checkbox>
                  <Checkbox value="inactive">Неактивен</Checkbox>
                </Checkbox.Group>
              </div>
            }
            trigger="click"
            placement="bottomLeft"
          >
            <Button
              type={statusFilter.length > 0 ? "primary" : "default"}
              icon={<FilterOutlined />}
            >
              Фильтр
            </Button>
          </Popover>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
          style={{ flexShrink: 0 }}
        >
          Добавить
        </Button>
      </div>

      {/* Отступ под заголовок */}
      <div style={{ marginBottom: 16, flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 24,
        }}
      >
        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: totalUsers,
            hideOnSinglePage: true,
            showSizeChanger: hasMultiplePages,
            showTotal: (total) => `Всего: ${total}`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
            onShowSizeChange: (current, pageSize) => {
              setPagination({ current: 1, pageSize });
            },
          }}
          scroll={{ x: "max-content", y: 510 }}
          style={{ width: "100%" }}
        />
      </div>

      {/* Modal для создания/редактирования пользователя */}
      <Modal
        title={
          editingUser ? "Редактировать пользователя" : "Добавить пользователя"
        }
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
        okText={editingUser ? "Сохранить" : "Добавить"}
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Введите email" },
              { type: "email", message: "Введите корректный email" },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="user@example.com" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="Пароль"
              rules={[
                { required: true, message: "Введите пароль" },
                {
                  min: PASSWORD_MIN_LENGTH,
                  message: PASSWORD_MIN_MESSAGE,
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="••••••••"
              />
            </Form.Item>
          )}

          <Form.Item
            name="firstName"
            label="ФИО"
            rules={[{ required: true, message: "Введите ФИО" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="role"
            label="Роль"
            rules={[{ required: true, message: "Выберите роль" }]}
            initialValue={editingUser?.role || "user"}
          >
            <Select>
              {Object.entries(selectableRoles).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.text}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="counterpartyId"
            label="Контрагент"
            tooltip="Контрагент, к которому привязан пользователь"
          >
            <Select
              placeholder="Не выбрано"
              allowClear
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => {
                // Безопасное преобразование: проверяем тип данных перед вызовом toLowerCase
                const label = option?.label;
                const searchText =
                  typeof label === "string" ? label : String(label || "");
                return searchText.toLowerCase().includes(input.toLowerCase());
              }}
              popupMatchSelectWidth={false}
              maxTagCount="responsive"
              virtual={true}
            >
              {counterparties.map((c) => (
                <Select.Option
                  key={c.id}
                  value={c.id}
                  label={`${c.name} (${c.inn})`}
                >
                  {c.name} ({c.inn})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal для изменения пароля */}
      <Modal
        title="Изменить пароль"
        open={isPasswordModalOpen}
        onOk={handlePasswordModalOk}
        onCancel={handlePasswordModalCancel}
        okText="Изменить"
        cancelText="Отмена"
      >
        <Form form={passwordForm} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="newPassword"
            label="Новый пароль"
            rules={[
              { required: true, message: "Введите новый пароль" },
              { min: PASSWORD_MIN_LENGTH, message: PASSWORD_MIN_MESSAGE },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Подтвердите пароль"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Подтвердите пароль" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Пароли не совпадают"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
