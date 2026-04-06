import { useState, useEffect } from "react";
import {
  Table,
  Button,
  Space,
  Typography,
  Tooltip,
  Modal,
  message,
  Input,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  SearchOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { applicationService } from "../services/applicationService";
import ApplicationFormModal from "../components/Applications/ApplicationFormModal";
import ApplicationViewModal from "../components/Applications/ApplicationViewModal";
import dayjs from "dayjs";

const { Title } = Typography;
const STORAGE_KEY = "applicationsPageState";

const loadApplicationsPageState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        searchText: "",
        pagination: { current: 1, pageSize: 100 },
      };
    }
    const parsed = JSON.parse(saved);
    return {
      searchText: parsed.searchText || "",
      pagination: parsed.pagination || { current: 1, pageSize: 100 },
    };
  } catch (error) {
    console.warn("Ошибка загрузки состояния страницы заявок:", error);
    return {
      searchText: "",
      pagination: { current: 1, pageSize: 100 },
    };
  }
};

const ApplicationsPage = () => {
  const [initialState] = useState(loadApplicationsPageState);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchText, setSearchText] = useState(initialState.searchText);
  const [pagination, setPagination] = useState(initialState.pagination);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewingId, setViewingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchText,
        pagination: {
          current: pagination.current || 1,
          pageSize: pagination.pageSize || 100,
        },
      }),
    );
  }, [searchText, pagination.current, pagination.pageSize]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: response } = await applicationService.getAll();
      setData(response.data.applications);
    } catch (error) {
      message.error("Ошибка при загрузке заявок");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setModalVisible(true);
  };

  const handleView = (record) => {
    setViewingId(record.id);
    setViewModalVisible(true);
  };

  const handleCopy = async (id) => {
    try {
      await applicationService.copy(id);
      message.success("Заявка скопирована");
      fetchData();
    } catch (error) {
      message.error("Ошибка при копировании");
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: "Удалить заявку?",
      content: "Это действие нельзя отменить",
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await applicationService.delete(id);
          message.success("Заявка удалена");
          fetchData();
        } catch (error) {
          message.error("Ошибка при удалении");
        }
      },
    });
  };

  const columns = [
    {
      title: "№ заявки",
      dataIndex: "applicationNumber",
      key: "applicationNumber",
      ellipsis: true,
    },
    {
      title: "Объект",
      dataIndex: ["constructionSite", "shortName"],
      key: "constructionSite",
      ellipsis: true,
    },
    {
      title: "Число сотрудников",
      dataIndex: "employees",
      key: "employees",
      render: (employees) => (employees && employees.length) || 0,
      width: 100,
    },
    {
      title: "Автор",
      key: "author",
      ellipsis: true,
      render: (_, record) =>
        record.creator
          ? `${record.creator.firstName} ${record.creator.lastName}`
          : "-",
    },
    {
      title: "Дата создания",
      dataIndex: "createdAt",
      key: "createdAt",
      ellipsis: true,
      render: (date) => dayjs(date).format("DD.MM.YYYY HH:mm"),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    },
    {
      title: "Действия",
      key: "actions",
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Просмотр">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
            />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Копировать">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record.id)}
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filteredData = data.filter((item) => {
    const searchLower = searchText.toLowerCase();
    return (
      item.applicationNumber.toLowerCase().includes(searchLower) ||
      item.counterparty?.name?.toLowerCase()?.includes(searchLower) ||
      item.constructionSite?.shortName?.toLowerCase()?.includes(searchLower)
    );
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          Заявки
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Создать заявку
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Поиск по номеру, контрагенту, объекту..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 400 }}
          allowClear
        />
      </Space>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        size="small"
        onChange={(nextPagination) => {
          setPagination((prev) => ({
            ...prev,
            current: nextPagination.current || prev.current,
            pageSize: nextPagination.pageSize || prev.pageSize,
          }));
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          pageSizeOptions: ["50", "100", "200"],
          showTotal: (total) => `Всего: ${total}`,
        }}
      />

      <ApplicationFormModal
        visible={modalVisible}
        editingId={editingId}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchData();
        }}
      />

      <ApplicationViewModal
        visible={viewModalVisible}
        applicationId={viewingId}
        onCancel={() => setViewModalVisible(false)}
      />
    </div>
  );
};

export default ApplicationsPage;
