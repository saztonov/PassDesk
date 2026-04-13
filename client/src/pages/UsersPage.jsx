import { useState, useEffect, useRef, useCallback } from "react";
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

const roleLabels = {
  admin: { text: "Администратор", color: "red" },
  laborer: { text: "Рабочий", color: "cyan" },
  ot_admin: { text: "Администратор ОТ", color: "magenta" },
  ot_engineer: { text: "Инженер ОТ", color: "blue" },
  manager: { text: "Менеджер", color: "gold" },
  user: { text: "Пользователь", color: "default" },
};

const UsersPage = () => {
  const { message } = App.useApp();
  const [users, setUsers] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(null);
  const [isActiveFilter, setIsActiveFilter] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [editingUser, setEditingUser] = useState(null);
  const { user: currentUser } = useAuthStore();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 100, total: 0 });
  const currentPage = pagination.current;
  const pageSize = pagination.pageSize;
  const debounceTimerRef = useRef(null);

  // Debounce поиска (350мс, как на странице сотрудников)
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      setPagination((prev) => ({ ...prev, current: 1 }));
    }, 350);
    return () => clearTimeout(debounceTimerRef.current);
  }, [searchText]);

  // Сброс страницы при изменении фильтров
  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [roleFilter, isActiveFilter]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.role = roleFilter;
      if (isActiveFilter !== null && isActiveFilter !== undefined) params.isActive = isActiveFilter;

      const response = await userService.getAll(params);
      setUsers(response?.data?.users || []);
      const total = response?.data?.pagination?.total ?? response?.data?.users?.length ?? 0;
      setPagination((prev) =>
        prev.total === total ? prev : { ...prev, total },
      );
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, roleFilter, isActiveFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    counterpartyService
      .getAll({ limit: 10000, page: 1 })
      .then((response) => {
        setCounterparties(response?.data?.data?.counterparties || []);
      })
      .catch(() => {});
  }, []);

  const upsertUser = (userPayload) => {
    if (!userPayload?.id) return;
    setUsers((prev) => {
      const index = prev.findIndex((item) => item.id === userPayload.id);
      if (index === -1) return [userPayload, ...prev];
      const next = [...prev];
      next[index] = { ...next[index], ...userPayload };
      return next;
    });
  };

  const removeUser = (id) => {
    setUsers((prev) => prev.filter((item) => item.id !== id));
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
    },
    {
      title: "Контрагент",
      dataIndex: "counterpartyId",
      key: "counterpartyId",
      render: (counterpartyId) => {
        const counterparty = counterparties.find((c) => c.id === counterpartyId);
        return counterparty ? counterparty.name : "-";
      },
    },
    {
      title: "Статус",
      dataIndex: "isActive",
      key: "isActive",
      render: (isActive, record) => {
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
      message.error(error.response?.data?.message || "Ошибка изменения статуса");
    }
  };

  const handleDelete = async (id) => {
    try {
      await userService.delete(id);
      removeUser(id);
      message.success("Пользователь удален");
      await fetchUsers();
    } catch (error) {
      message.error(error.response?.data?.message || "Ошибка удаления пользователя");
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
      if (error.errorFields) return;
      if (applyServerValidationErrors(form, error)) {
        message.error(error?.response?.data?.errors?.[0]?.message || "Проверьте введенные данные");
        return;
      }
      message.error(error.response?.data?.message || "Ошибка сохранения пользователя");
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
      if (error.errorFields) return;
      if (applyServerValidationErrors(passwordForm, error)) {
        message.error(error?.response?.data?.errors?.[0]?.message || "Проверьте введенные данные");
        return;
      }
      message.error(error.response?.data?.message || "Ошибка обновления пароля");
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
      <style>{`
        .users-table-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding-left: 24px;
          padding-right: 24px;
          padding-bottom: 24px;
        }
        .users-table-container .ant-table-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .users-table-container .ant-spin-nested-loading {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .users-table-container .ant-spin-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .users-table-container .ant-table {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .users-table-container .ant-table-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .users-table-container .ant-table-body {
          flex: 1;
          min-height: 0;
          overflow: auto !important;
        }
        .users-table-container .ant-table-pagination {
          position: sticky;
          bottom: 0;
          z-index: 5;
          background: #fff;
          border-top: 1px solid #f0f0f0;
          flex-shrink: 0;
          margin: 0 !important;
          padding: 10px 12px !important;
        }
      `}</style>
      {/* Тулбар */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          gap: 12,
          flexShrink: 0,
          borderBottom: "1px solid #f0f0f0",
          flexWrap: "wrap",
        }}
      >
        <Title level={3} style={{ margin: 0, whiteSpace: "nowrap" }}>
          Пользователи
        </Title>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
          <Input
            placeholder="Поиск по email или ФИО..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ maxWidth: 320 }}
          />
          <Select
            placeholder="Роль"
            style={{ width: 180 }}
            value={roleFilter}
            onChange={setRoleFilter}
            allowClear
          >
            {Object.entries(roleLabels).map(([key, value]) => (
              <Select.Option key={key} value={key}>
                {value.text}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="Статус"
            style={{ width: 140 }}
            value={isActiveFilter}
            onChange={setIsActiveFilter}
            allowClear
          >
            <Select.Option value="true">Активен</Select.Option>
            <Select.Option value="false">Неактивен</Select.Option>
          </Select>
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

      {/* Таблица */}
      <div className="users-table-container">
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ["50", "100", "200"],
            showTotal: (total) => `Всего: ${total}`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
            },
          }}
          scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
          style={{ width: "100%" }}
        />
      </div>

      {/* Modal создания/редактирования */}
      <Modal
        title={editingUser ? "Редактировать пользователя" : "Добавить пользователя"}
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
                { min: PASSWORD_MIN_LENGTH, message: PASSWORD_MIN_MESSAGE },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="••••••••" />
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
              {Object.entries(roleLabels).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.text}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="counterpartyId"
            label="Контрагент"
            tooltip="Компания, к которой привязан пользователь"
            rules={[
              {
                required: !editingUser,
                message: "Выберите компанию",
              },
            ]}
          >
            <Select
              placeholder="Выберите компанию"
              allowClear={Boolean(editingUser)}
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => {
                const label = option?.label;
                const text = typeof label === "string" ? label : String(label || "");
                return text.toLowerCase().includes(input.toLowerCase());
              }}
              popupMatchSelectWidth={false}
              virtual={true}
            >
              {counterparties.map((c) => (
                <Select.Option key={c.id} value={c.id} label={`${c.name} (${c.inn})`}>
                  {c.name} ({c.inn})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal изменения пароля */}
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
