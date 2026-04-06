import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Input, Space, Table, Typography, Modal } from "antd";
import { employeeService } from "@/services/employeeService";
import dayjs from "dayjs";

const { Title } = Typography;

const MarkedEmployeesPage = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await employeeService.getMarkedForDeletion({
        page: pagination.current,
        limit: pagination.pageSize,
        search,
      });
      setEmployees(data.employees || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
      }));
    } catch (error) {
      message.error("Ошибка при загрузке сотрудников");
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, search, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = (employee) => {
    Modal.confirm({
      title: "Удалить сотрудника?",
      content: `${employee.lastName} ${employee.firstName} будет удален.`,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        await employeeService.delete(employee.id);
        fetchData();
      },
    });
  };

  const handleUnmark = async (employee) => {
    await employeeService.unmarkForDeletion(employee.id);
    fetchData();
  };

  const columns = [
    {
      title: "ФИО",
      key: "fullName",
      render: (_, record) =>
        `${record.lastName} ${record.firstName} ${record.middleName || ""}`.trim(),
    },
    {
      title: "Контрагент",
      key: "counterparty",
      render: (_, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        const names = [
          ...new Set(
            mappings.map((m) => m.counterparty?.name).filter(Boolean),
          ),
        ];
        return names.join(", ") || "-";
      },
    },
    {
      title: "Объект",
      key: "constructionSite",
      render: (_, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        const sites = [
          ...new Set(
            mappings
              .map((m) => m.constructionSite?.shortName || m.constructionSite?.fullName)
              .filter(Boolean),
          ),
        ];
        return sites.join(", ") || "-";
      },
    },
    {
      title: "Дата пометки",
      dataIndex: "updatedAt",
      render: (value) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "-"),
    },
    {
      title: "Действия",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button onClick={() => handleUnmark(record)}>Отменить</Button>
          <Button danger onClick={() => handleDelete(record)}>
            Удалить
          </Button>
        </Space>
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
          flexShrink: 0,
          padding: "16px 24px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          Сотрудники на удаление
        </Title>
        <Input
          placeholder="Поиск по ФИО или ИНН"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
          allowClear
        />
        <Button onClick={fetchData} style={{ marginLeft: "auto" }}>
          Обновить
        </Button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "0 24px 24px 24px",
        }}
      >
        <Table
          columns={columns}
          dataSource={employees}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            onChange: (page) =>
              setPagination((prev) => ({ ...prev, current: page })),
            onShowSizeChange: (current, pageSize) =>
              setPagination((prev) => ({ ...prev, current: 1, pageSize })),
            showSizeChanger: true,
            pageSizeOptions: ["50", "100", "200"],
            showTotal: (total) => `Всего: ${total}`,
          }}
          size="small"
        />
      </div>
    </Card>
  );
};

export default MarkedEmployeesPage;
