import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Pagination,
  Space,
  Table,
  Tabs,
} from "antd";
import { employeeService } from "@/services/employeeService";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/store/authStore";
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
      <Space wrap>
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
      <Space wrap>
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
  selectedCount,
  onSelectAllVisible,
  onClearSelection,
  onBulkDelete,
  bulkDeleteLoading,
  bulkDeleteTitle,
  bulkDeleteDescription,
  rowSelection,
  columns,
  dataSource,
  loading,
  pagination,
  onChangePage,
  onChangePageSize,
}) => (
  <div
    className="trash-list-tab"
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
    }}
  >
    <Space style={{ marginBottom: 12, flexShrink: 0 }}>
      <Input
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={onSearchChange}
        allowClear
      />
      <Button onClick={onRefresh}>Обновить</Button>
    </Space>
    <Space style={{ marginBottom: 12, flexWrap: "wrap", flexShrink: 0 }}>
      <Button
        onClick={onSelectAllVisible}
        disabled={loading || (dataSource?.length || 0) === 0}
      >
        Выделить все
      </Button>
      <Button onClick={onClearSelection} disabled={selectedCount === 0}>
        Снять выделение
      </Button>
      <Popconfirm
        title={bulkDeleteTitle}
        description={bulkDeleteDescription}
        okText="Удалить"
        okType="danger"
        cancelText="Отмена"
        onConfirm={onBulkDelete}
        disabled={selectedCount === 0}
      >
        <Button
          danger
          disabled={selectedCount === 0}
          loading={bulkDeleteLoading}
        >
          Удалить выбранные ({selectedCount})
        </Button>
      </Popconfirm>
    </Space>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Table
        className="trash-table"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        rowSelection={rowSelection}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: "max-content", y: "calc(100vh - 430px)" }}
      />
      <div className="trash-pagination-bar">
        <Pagination
          {...pagination}
          onChange={onChangePage}
          onShowSizeChange={onChangePageSize}
          showSizeChanger
          pageSizeOptions={["10", "20", "50", "100"]}
        />
      </div>
    </div>
  </div>
);

const TrashPage = () => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const isManager = user?.role === "manager";
  const [activeTab, setActiveTab] = useState("employees");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState({
    employees: false,
    users: false,
  });
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
      setSelectedEmployeeIds([]);
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
      setSelectedUserIds([]);
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
    if (!isManager) fetchUsers();
  }, [fetchUsers, isManager]);

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

  const permanentlyDeleteSelectedEmployees = async () => {
    if (selectedEmployeeIds.length === 0) {
      return;
    }

    setBulkDeleteLoading((prev) => ({ ...prev, employees: true }));
    try {
      const results = await Promise.allSettled(
        selectedEmployeeIds.map((id) => employeeService.permanentlyDelete(id)),
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failedCount = results.length - successCount;

      if (successCount > 0) {
        message.success(`Сотрудников удалено: ${successCount}`);
      }
      if (failedCount > 0) {
        message.warning(`Не удалось удалить сотрудников: ${failedCount}`);
      }

      await fetchEmployees();
    } finally {
      setBulkDeleteLoading((prev) => ({ ...prev, employees: false }));
    }
  };

  const permanentlyDeleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) {
      return;
    }

    setBulkDeleteLoading((prev) => ({ ...prev, users: true }));
    try {
      const results = await Promise.allSettled(
        selectedUserIds.map((id) => userService.permanentlyDelete(id)),
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failedCount = results.length - successCount;

      if (successCount > 0) {
        message.success(`Пользователей удалено: ${successCount}`);
      }
      if (failedCount > 0) {
        message.warning(`Не удалось удалить пользователей: ${failedCount}`);
      }

      await fetchUsers();
    } finally {
      setBulkDeleteLoading((prev) => ({ ...prev, users: false }));
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
          selectedCount={selectedEmployeeIds.length}
          onSelectAllVisible={() =>
            setSelectedEmployeeIds((employees || []).map((item) => item.id))
          }
          onClearSelection={() => setSelectedEmployeeIds([])}
          onBulkDelete={permanentlyDeleteSelectedEmployees}
          bulkDeleteLoading={bulkDeleteLoading.employees}
          bulkDeleteTitle="Удалить выбранных сотрудников навсегда?"
          bulkDeleteDescription="Записи будут удалены без возможности восстановления."
          rowSelection={{
            selectedRowKeys: selectedEmployeeIds,
            onChange: (selectedRowKeys) =>
              setSelectedEmployeeIds(selectedRowKeys),
          }}
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
          selectedCount={selectedUserIds.length}
          onSelectAllVisible={() =>
            setSelectedUserIds((users || []).map((item) => item.id))
          }
          onClearSelection={() => setSelectedUserIds([])}
          onBulkDelete={permanentlyDeleteSelectedUsers}
          bulkDeleteLoading={bulkDeleteLoading.users}
          bulkDeleteTitle="Удалить выбранных пользователей навсегда?"
          bulkDeleteDescription="Записи будут удалены без возможности восстановления."
          rowSelection={{
            selectedRowKeys: selectedUserIds,
            onChange: (selectedRowKeys) => setSelectedUserIds(selectedRowKeys),
          }}
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
          overflow: "hidden",
          padding: "16px 24px 24px 24px",
        }}
      >
        <Tabs
          className="trash-page-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabs.filter((t) => !isManager || t.key !== "users")}
        />
      </div>
      <style>
        {`
          .trash-page-tabs {
            min-height: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
          }

          .trash-page-tabs > .ant-tabs-nav {
            flex-shrink: 0;
          }

          .trash-page-tabs > .ant-tabs-content-holder {
            flex: 1;
            min-height: 0;
          }

          .trash-page-tabs > .ant-tabs-content-holder > .ant-tabs-content {
            height: 100%;
          }

          .trash-page-tabs > .ant-tabs-content-holder > .ant-tabs-content > .ant-tabs-tabpane {
            height: 100%;
            min-height: 0;
            overflow: hidden;
          }

          .trash-page-tabs > .ant-tabs-content-holder > .ant-tabs-content > .ant-tabs-tabpane.ant-tabs-tabpane-active {
            overflow: hidden;
          }

          .trash-list-tab .trash-table {
            flex: 1;
            min-height: 0;
          }

          .trash-list-tab .trash-table.ant-table-wrapper {
            flex: 1;
            min-height: 0;
          }

          .trash-list-tab .trash-table .ant-spin-nested-loading,
          .trash-list-tab .trash-table .ant-spin-container,
          .trash-list-tab .trash-table .ant-table,
          .trash-list-tab .trash-table .ant-table-container {
            display: flex;
            flex: 1;
            min-height: 0;
            flex-direction: column;
          }

          .trash-list-tab .trash-table .ant-table-body {
            flex: 1;
            min-height: 0;
            overflow: auto !important;
          }

          .trash-list-tab .trash-pagination-bar {
            position: sticky;
            bottom: 0;
            z-index: 5;
            background: #fff;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: flex-end;
            margin-top: 0;
            padding: 10px 12px;
            flex-shrink: 0;
          }
        `}
      </style>
    </Card>
  );
};

export default TrashPage;
