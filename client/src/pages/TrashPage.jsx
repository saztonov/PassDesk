import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tabs,
} from "antd";
import { employeeService } from "@/services/employeeService";
import { userService } from "@/services/userService";
import dayjs from "dayjs";

const formatFullName = (record) =>
  [record?.lastName, record?.firstName, record?.middleName]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();

const createEmployeeColumns = (onRestore, onPermanentDelete) => [
  {
    title: "ФИО",
    key: "fullName",
    render: (_, record) => formatFullName(record) || "-",
  },
  {
    title: "Контрагент",
    key: "counterparty",
    render: (_, record) => {
      const mappings = record.employeeCounterpartyMappings || [];
      const names = [
        ...new Set(mappings.map((m) => m.counterparty?.name).filter(Boolean)),
      ];
      return names.join(", ") || "-";
    },
  },
  {
    title: "Удален",
    dataIndex: "deletedAt",
    render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "-"),
  },
  {
    title: "Действия",
    key: "actions",
    render: (_, record) => (
      <Space>
        <Button onClick={() => onRestore(record)}>Восстановить</Button>
        <Popconfirm
          title="Удалить сотрудника навсегда?"
          description="Запись будет удалена без возможности восстановления."
          okText="Удалить навсегда"
          okType="danger"
          cancelText="Отмена"
          onConfirm={() => onPermanentDelete(record)}
        >
          <Button danger>Удалить навсегда</Button>
        </Popconfirm>
      </Space>
    ),
  },
];

const createUserColumns = (onRestore, onPermanentDelete) => [
  { title: "Email", dataIndex: "email" },
  { title: "Имя", dataIndex: "firstName" },
  { title: "Роль", dataIndex: "role" },
  {
    title: "Удален",
    dataIndex: "deletedAt",
    render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "-"),
  },
  {
    title: "Действия",
    key: "actions",
    render: (_, record) => (
      <Space>
        <Button onClick={() => onRestore(record)}>Восстановить</Button>
        <Popconfirm
          title="Удалить пользователя навсегда?"
          description="Запись будет удалена без возможности восстановления."
          okText="Удалить навсегда"
          okType="danger"
          cancelText="Отмена"
          onConfirm={() => onPermanentDelete(record)}
        >
          <Button danger>Удалить навсегда</Button>
        </Popconfirm>
      </Space>
    ),
  },
];

const TrashListTab = ({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onRefresh,
  columns,
  dataSource,
  loading,
  pagination,
  onChangePage,
  onChangePageSize,
}) => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
  >
    <Space style={{ marginBottom: 12 }}>
      <Input
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={onSearchChange}
        allowClear
      />
      <Button onClick={onRefresh}>Обновить</Button>
    </Space>
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: "max-content" }}
      pagination={{
        ...pagination,
        onChange: onChangePage,
        onShowSizeChange: onChangePageSize,
        showSizeChanger: true,
        pageSizeOptions: ["10", "20", "50", "100"],
      }}
      size="small"
    />
  </div>
);

const TrashPage = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState("employees");
  const [employeeState, setEmployeeState] = useState({
    items: [],
    loading: false,
    search: "",
    pagination: {
      current: 1,
      pageSize: 10,
      total: 0,
    },
  });
  const [userState, setUserState] = useState({
    items: [],
    loading: false,
    search: "",
    pagination: {
      current: 1,
      pageSize: 10,
      total: 0,
    },
  });
  const {
    items: employees,
    loading: employeesLoading,
    search: employeeSearch,
    pagination: employeePagination,
  } = employeeState;
  const {
    items: users,
    loading: usersLoading,
    search: userSearch,
    pagination: userPagination,
  } = userState;

  const fetchEmployees = useCallback(async () => {
    setEmployeeState((prev) => ({ ...prev, loading: true }));
    try {
      const { data } = await employeeService.getDeleted({
        page: employeePagination.current,
        limit: employeePagination.pageSize,
        search: employeeSearch,
      });
      setEmployeeState((prev) => ({
        ...prev,
        items: data.employees || [],
        pagination: {
          ...prev.pagination,
          total: data.pagination?.total || 0,
        },
      }));
    } catch (error) {
      message.error("Ошибка при загрузке удаленных сотрудников");
    } finally {
      setEmployeeState((prev) => ({ ...prev, loading: false }));
    }
  }, [
    employeePagination.current,
    employeePagination.pageSize,
    employeeSearch,
    message,
  ]);

  const fetchUsers = useCallback(async () => {
    setUserState((prev) => ({ ...prev, loading: true }));
    try {
      const { data } = await userService.getDeleted({
        page: userPagination.current,
        limit: userPagination.pageSize,
        search: userSearch,
      });
      setUserState((prev) => ({
        ...prev,
        items: data.users || [],
        pagination: {
          ...prev.pagination,
          total: data.pagination?.total || 0,
        },
      }));
    } catch (error) {
      message.error("Ошибка при загрузке удаленных пользователей");
    } finally {
      setUserState((prev) => ({ ...prev, loading: false }));
    }
  }, [userPagination.current, userPagination.pageSize, userSearch, message]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const restoreEmployee = async (employee) => {
    try {
      await employeeService.restore(employee.id);
      message.success("Сотрудник восстановлен");
      fetchEmployees();
    } catch (error) {
      message.error("Ошибка при восстановлении сотрудника");
    }
  };

  const restoreUser = async (user) => {
    try {
      await userService.restore(user.id);
      message.success("Пользователь восстановлен");
      fetchUsers();
    } catch (error) {
      message.error("Ошибка при восстановлении пользователя");
    }
  };

  const permanentlyDeleteEmployee = async (employee) => {
    try {
      await employeeService.permanentlyDelete(employee.id);
      message.success("Сотрудник удален навсегда");
      fetchEmployees();
    } catch (error) {
      message.error("Ошибка при полном удалении сотрудника");
    }
  };

  const permanentlyDeleteUser = async (user) => {
    try {
      await userService.permanentlyDelete(user.id);
      message.success("Пользователь удален навсегда");
      fetchUsers();
    } catch (error) {
      message.error("Ошибка при полном удалении пользователя");
    }
  };

  const employeeColumns = createEmployeeColumns(
    restoreEmployee,
    permanentlyDeleteEmployee,
  );
  const userColumns = createUserColumns(restoreUser, permanentlyDeleteUser);

  const tabs = [
    {
      key: "employees",
      label: "Сотрудники",
      children: (
        <TrashListTab
          searchPlaceholder="Поиск по ФИО или ИНН"
          searchValue={employeeSearch}
          onSearchChange={(e) =>
            setEmployeeState((prev) => ({
              ...prev,
              search: e.target.value,
            }))
          }
          onRefresh={fetchEmployees}
          columns={employeeColumns}
          dataSource={employees}
          loading={employeesLoading}
          pagination={employeePagination}
          onChangePage={(page) =>
            setEmployeeState((prev) => ({
              ...prev,
              pagination: { ...prev.pagination, current: page },
            }))
          }
          onChangePageSize={(_current, pageSize) =>
            setEmployeeState((prev) => ({
              ...prev,
              pagination: {
                ...prev.pagination,
                current: 1,
                pageSize,
              },
            }))
          }
        />
      ),
    },
    {
      key: "users",
      label: "Пользователи",
      children: (
        <TrashListTab
          searchPlaceholder="Поиск по имени или email"
          searchValue={userSearch}
          onSearchChange={(e) =>
            setUserState((prev) => ({
              ...prev,
              search: e.target.value,
            }))
          }
          onRefresh={fetchUsers}
          columns={userColumns}
          dataSource={users}
          loading={usersLoading}
          pagination={userPagination}
          onChangePage={(page) =>
            setUserState((prev) => ({
              ...prev,
              pagination: { ...prev.pagination, current: page },
            }))
          }
          onChangePageSize={(_current, pageSize) =>
            setUserState((prev) => ({
              ...prev,
              pagination: {
                ...prev.pagination,
                current: 1,
                pageSize,
              },
            }))
          }
        />
      ),
    },
  ];

  return (
    <Card
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        margin: 0,
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "16px 24px 24px 24px",
        }}
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      </div>
    </Card>
  );
};

export default TrashPage;
