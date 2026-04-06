import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Modal,
  Form,
  Typography,
  App,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { constructionSiteService } from "../services/constructionSiteService";

const { TextArea } = Input;
const { Title } = Typography;

const ConstructionSitesPage = () => {
  const { message, modal } = App.useApp();
  const [data, setData] = useState([]);
  const [uiState, setUiState] = useState({
    loading: false,
    modalVisible: false,
    editingId: null,
    search: "",
  });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
  });
  const [form] = Form.useForm();
  const { loading, modalVisible, editingId, search } = uiState;

  const { current: paginationCurrent, pageSize: paginationPageSize } =
    pagination;

  const fetchData = useCallback(async () => {
    setUiState((prev) => ({ ...prev, loading: true }));
    try {
      const { data: response } = await constructionSiteService.getAll({
        page: paginationCurrent,
        limit: paginationPageSize,
        search,
      });
      setData(response.data.constructionSites);
      const nextTotal = response.data.pagination.total;
      setPagination((prev) => {
        if (prev.total === nextTotal) {
          return prev;
        }
        return {
          ...prev,
          total: nextTotal,
        };
      });
    } catch (error) {
      message.error("Ошибка при загрузке данных");
    } finally {
      setUiState((prev) => ({ ...prev, loading: false }));
    }
  }, [message, paginationCurrent, paginationPageSize, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = () => {
    setUiState((prev) => ({
      ...prev,
      editingId: null,
      modalVisible: true,
    }));
    form.resetFields();
  };

  const handleEdit = (record) => {
    setUiState((prev) => ({
      ...prev,
      editingId: record.id,
      modalVisible: true,
    }));
    form.setFieldsValue(record);
  };

  const handleDelete = async (id) => {
    modal.confirm({
      title: "Удалить объект строительства?",
      onOk: async () => {
        try {
          await constructionSiteService.delete(id);
          message.success("Объект удален");
          fetchData();
        } catch (error) {
          message.error(error.response?.data?.message || "Ошибка при удалении");
        }
      },
    });
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await constructionSiteService.update(editingId, values);
        message.success("Объект обновлен");
      } else {
        await constructionSiteService.create(values);
        message.success("Объект создан");
      }
      setUiState((prev) => ({ ...prev, modalVisible: false }));
      fetchData();
    } catch (error) {
      message.error("Ошибка при сохранении");
    }
  };

  const columns = [
    { title: "Краткое название", dataIndex: "shortName", key: "shortName" },
    { title: "Полное название", dataIndex: "fullName", key: "fullName" },
    { title: "Адрес", dataIndex: "address", key: "address" },
    {
      title: "Действия",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
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
          <Title level={3} style={{ margin: 0, whiteSpace: "nowrap" }}>
            Объекты строительства
          </Title>
          <Input
            placeholder="Поиск по названию или адресу"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) =>
              setUiState((prev) => ({ ...prev, search: e.target.value }))
            }
            style={{ width: 300 }}
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{ marginLeft: "auto" }}
          >
            Добавить
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
            dataSource={data}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              ...pagination,
              onChange: (page) =>
                setPagination((prev) => ({ ...prev, current: page })),
              onShowSizeChange: (current, pageSize) =>
                setPagination((prev) => ({ ...prev, current: 1, pageSize })),
              showSizeChanger: true,
              pageSizeOptions: ["50", "100", "200"],
              showTotal: (total) => `Всего: ${total} записей`,
            }}
            style={{ fontSize: 12 }}
          />
        </div>
      </Card>

      <Modal
        title={editingId ? "Редактировать объект" : "Добавить объект"}
        open={modalVisible}
        onCancel={() =>
          setUiState((prev) => ({ ...prev, modalVisible: false }))
        }
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="shortName"
            label="Краткое название"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="fullName"
            label="Полное название (необязательно)"
          >
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Адрес (необязательно)">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ConstructionSitesPage;
