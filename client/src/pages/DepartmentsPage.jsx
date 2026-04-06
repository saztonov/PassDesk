import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  App,
  Popconfirm,
  Select,
  Typography,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { departmentService } from "../services/departmentService";
import { constructionSiteService } from "../services/constructionSiteService";
import settingsService from "../services/settingsService";
import { useAuthStore } from "../store/authStore";
import { canManageAdministrativeData } from "@/shared/lib/accessControl";

const { Title } = Typography;

const DepartmentsPage = () => {
  const { message } = App.useApp();
  const [departments, setDepartments] = useState([]);
  const [constructionSites, setConstructionSites] = useState([]);
  const [uiState, setUiState] = useState({
    loading: false,
    searchText: "",
    debouncedSearch: "",
  });
  const debounceTimerRef = useRef(null);
  const [modalState, setModalState] = useState({
    visible: false,
    editingDepartment: null,
  });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
  });
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const { loading, searchText, debouncedSearch } = uiState;
  const canEditAndDelete = canManageAdministrativeData(user?.role);

  const fetchDepartments = useCallback(async () => {
    if (!user?.counterpartyId) {
      setDepartments([]);
      return;
    }

    try {
      setUiState((prev) => ({ ...prev, loading: true }));
      const response = await departmentService.getAll({
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      setDepartments(response.data.data.departments || []);
    } catch (error) {
      console.error("Error fetching departments:", error);
      message.error("Ошибка при загрузке подразделений");
    } finally {
      setUiState((prev) => ({ ...prev, loading: false }));
    }
  }, [debouncedSearch, message, user?.counterpartyId]);

  // Загрузка объектов (для default контрагента - все, для остальных - только привязанные)
  const fetchConstructionSites = useCallback(async () => {
    if (!user?.counterpartyId) {
      setConstructionSites([]);
      return;
    }

    try {
      let sites = [];

      // Получаем публичные настройки (доступно всем пользователям)
      const settingsResponse = await settingsService.getPublicSettings();
      const defaultCounterpartyId =
        settingsResponse?.data?.defaultCounterpartyId;

      // Если это default контрагент - загружаем все объекты
      if (user.counterpartyId === defaultCounterpartyId) {
        const response = await constructionSiteService.getAll();
        sites =
          response.data.data?.constructionSites || response.data.data || [];
      } else {
        // Для остальных контрагентов - только назначенные объекты
        const response = await constructionSiteService.getCounterpartyObjects(
          user.counterpartyId,
        );
        sites = response.data.data || [];
      }
      setConstructionSites(sites);
    } catch (error) {
      console.error("Error fetching construction sites:", error);
      // Не показываем ошибку, если просто нет объектов
      setConstructionSites([]);
    }
  }, [user?.counterpartyId]);

  useEffect(() => {
    fetchDepartments();
    fetchConstructionSites();
  }, [fetchDepartments, fetchConstructionSites]);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setUiState((prev) => ({
        ...prev,
        debouncedSearch: searchText.trim(),
      }));
      setPagination((prev) => ({ ...prev, current: 1 }));
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchText]);

  const handleOpenModal = (department = null) => {
    if (!canEditAndDelete) {
      return;
    }
    setModalState({
      visible: true,
      editingDepartment: department,
    });
    if (department) {
      form.setFieldsValue({
        name: department.name,
        constructionSiteId: department.constructionSiteId || null,
      });
    } else {
      form.resetFields();
    }
  };

  const handleCloseModal = () => {
    setModalState({
      visible: false,
      editingDepartment: null,
    });
    form.resetFields();
  };

  const handleSave = async () => {
    if (!canEditAndDelete) {
      return;
    }
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        counterpartyId: user?.counterpartyId,
      };

      if (modalState.editingDepartment) {
        await departmentService.update(
          modalState.editingDepartment.id,
          payload,
        );
        message.success("Подразделение обновлено");
      } else {
        await departmentService.create(payload);
        message.success("Подразделение создано");
      }

      handleCloseModal();
      fetchDepartments();
    } catch (error) {
      console.error("Error saving department:", error);
      const errorMessage =
        error.response?.data?.message || "Ошибка при сохранении";
      message.error(errorMessage);
    }
  };

  const handleDelete = async (id) => {
    if (!canEditAndDelete) {
      return;
    }
    try {
      await departmentService.delete(id);
      message.success("Подразделение удалено");
      fetchDepartments();
    } catch (error) {
      console.error("Error deleting department:", error);
      message.error("Ошибка при удалении подразделения");
    }
  };

  const columns = [
    {
      title: "№",
      key: "index",
      width: 70,
      align: "center",
      render: (_, __, index) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: "Название",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Объект",
      dataIndex: ["constructionSite", "shortName"],
      key: "constructionSite",
      render: (text) => text || "—",
    },
    {
      title: "Действия",
      key: "actions",
      width: 140,
      align: "center",
      render: (_, record) => (
        <Space size={4}>
          {canEditAndDelete ? (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenModal(record)}
              />
              <Popconfirm
                title="Удалить подразделение?"
                description="Это действие нельзя отменить"
                onConfirm={() => handleDelete(record.id)}
                okText="Да"
                cancelText="Нет"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          ) : (
            <span style={{ color: "#999", fontSize: 12 }}>Нет прав</span>
          )}
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
            Подразделения
          </Title>
          <Input
            placeholder="Поиск по названию подразделения"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(event) =>
              setUiState((prev) => ({
                ...prev,
                searchText: event.target.value,
              }))
            }
            style={{ width: 320 }}
            allowClear
          />
          {canEditAndDelete && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal()}
              style={{ marginLeft: "auto" }}
            >
              Добавить
            </Button>
          )}
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
            dataSource={departments}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: departments.length,
              onChange: (current, pageSize) => {
                setPagination((prev) => ({
                  ...prev,
                  current,
                  pageSize: pageSize || prev.pageSize,
                }));
              },
              showSizeChanger: true,
              pageSizeOptions: ["50", "100", "200"],
              showTotal: (total) => `Всего: ${total} записей`,
            }}
          />
        </div>
      </Card>

      <Modal
        title={
          modalState.editingDepartment
            ? "Редактировать подразделение"
            : "Добавить подразделение"
        }
        open={modalState.visible}
        onOk={handleSave}
        onCancel={handleCloseModal}
        okText="Сохранить"
        cancelText="Отмена"
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Название подразделения"
            rules={[
              { required: true, message: "Введите название подразделения" },
            ]}
          >
            <Input placeholder="Например: Отдел продаж" />
          </Form.Item>
          <Form.Item name="constructionSiteId" label="Связанный объект">
            {constructionSites.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  background: "#f0f5ff",
                  border: "1px solid #adc6ff",
                  borderRadius: "6px",
                  color: "#1890ff",
                }}
              >
                Обратитесь к администратору для назначения доступных объектов
              </div>
            ) : (
              <Select
                placeholder="Выберите объект (необязательно)"
                allowClear
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) => {
                  const label = option?.label;
                  const text = typeof label === "string" ? label : String(label || "");
                  return text.toLowerCase().includes(input.toLowerCase());
                }}
              >
                {constructionSites.map((site) => (
                  <Select.Option
                    key={site.id}
                    value={site.id}
                    label={site.shortName || site.fullName || String(site.id)}
                  >
                    {site.shortName}
                  </Select.Option>
                ))}
              </Select>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DepartmentsPage;
