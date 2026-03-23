import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Modal,
  Form,
  Select,
  Tag,
  Tooltip,
  Typography,
  Row,
  Col,
  App,
  Alert,
  Result,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { counterpartyService } from "../services/counterpartyService";
import settingsService from "../services/settingsService";
import { CounterpartyObjectsModal } from "./CounterpartiesPage/CounterpartyObjectsModal";
import { useAuthStore } from "../store/authStore";
import { Link } from "react-router-dom";
import {
  canManageAdministrativeData,
  canManageCounterparties,
} from "@/shared/lib/accessControl";

const { Title } = Typography;

const typeMap = {
  customer: { label: "Заказчик", color: "blue" },
  contractor: { label: "Подрядчик", color: "green" },
  general_contractor: { label: "Генподрядчик", color: "gold" },
  subcontractor: { label: "Субподрядчик", color: "purple" },
};

const CounterpartiesPage = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [objectsModalVisible, setObjectsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [filters, setFilters] = useState({});
  const [form] = Form.useForm();
  const debounceTimerRef = useRef(null);
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);

  // Debounced фильтры для отправки на сервер
  const [debouncedFilters, setDebouncedFilters] = useState({});

  // Загрузить defaultCounterpartyId при монтировании
  useEffect(() => {
    const loadDefaultCounterpartyId = async () => {
      try {
        const response = await settingsService.getPublicSettings();
        if (response.success && response.data.defaultCounterpartyId) {
          setDefaultCounterpartyId(response.data.defaultCounterpartyId);
        }
      } catch (error) {
        console.error("Error loading default counterparty ID:", error);
      }
    };

    loadDefaultCounterpartyId();
  }, []);

  // Проверка: может ли user редактировать контрагентов
  const canEditCounterparties =
    canManageCounterparties({
      role: user?.role,
      counterpartyId: user?.counterpartyId,
      defaultCounterpartyId,
    });

  // Debounce для фильтров (500мс)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters]);

  const { current: paginationCurrent, pageSize: paginationPageSize } =
    pagination;

  // Загрузка данных при изменении debounced фильтров или пагинации
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await counterpartyService.getAll({
        page: paginationCurrent,
        limit: paginationPageSize,
        include: "construction_sites", // Включаем construction sites в один запрос
        ...debouncedFilters,
      });
      setData(response.data.counterparties);
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
      setLoading(false);
    }
  }, [debouncedFilters, message, paginationCurrent, paginationPageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);

    // Для admin устанавливаем все поля включая type
    // Для user (не default) устанавливаем все кроме type
    const formValues = { ...record };
    if (
      canManageAdministrativeData(user?.role) &&
      record.typeMapping?.types &&
      record.typeMapping.types.length > 0
    ) {
      // Берем первый тип (для admin)
      formValues.type = record.typeMapping.types[0];
    }

    form.setFieldsValue(formValues);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    modal.confirm({
      title: "Удалить контрагента?",
      content: "Это действие нельзя отменить",
      onOk: async () => {
        try {
          await counterpartyService.delete(id);
          message.success("Контрагент удален");
          fetchData();
        } catch (error) {
          message.error(error.response?.data?.message || "Ошибка при удалении");
        }
      },
    });
  };

  const handleCopyRegistrationLink = async (record) => {
    try {
      let registrationCode = record.registrationCode;

      // Если кода нет - генерируем
      if (!registrationCode) {
        const response = await counterpartyService.generateRegistrationCode(
          record.id,
        );
        registrationCode = response.data.data.registrationCode;

        // Обновляем данные в таблице
        setData((prevData) =>
          prevData.map((item) =>
            item.id === record.id ? { ...item, registrationCode } : item,
          ),
        );
      }

      // Создаем ссылку для регистрации
      const baseUrl = window.location.origin;
      const registrationUrl = `${baseUrl}/login?registrationCode=${registrationCode}`;

      // Копируем в буфер обмена (fallback для небезопасного контекста)
      const canUseClipboardApi =
        window.isSecureContext && navigator?.clipboard?.writeText;
      if (canUseClipboardApi) {
        await navigator.clipboard.writeText(registrationUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = registrationUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) {
          throw new Error("Clipboard copy failed");
        }
      }

      message.success({
        content: "Ссылка для регистрации скопирована в буфер обмена",
        duration: 3,
      });
    } catch (error) {
      console.error("Error copying registration link:", error);
      message.error("Ошибка при копировании ссылки");
    }
  };

  const handleOpenObjectsModal = (counterpartyId) => {
    // admin и user (не default) могут назначать объекты
    if (
      !canManageCounterparties({
        role: user?.role,
        counterpartyId: user?.counterpartyId,
        defaultCounterpartyId,
      })
    ) {
      message.error("У вас нет прав для редактирования объектов");
      return;
    }

    // Для user (не default) проверяем, что это субподрядчик
    if (
      user?.role === "user" &&
      user?.counterpartyId !== defaultCounterpartyId
    ) {
      // Найдем контрагента в данных
      const counterparty = data.find((c) => c.id === counterpartyId);
      const isSubcontractor =
        counterparty?.parentCounterparty?.id === user?.counterpartyId;

      if (!isSubcontractor) {
        message.error("Можно назначать объекты только своим субподрядчикам");
        return;
      }
    }

    setSelectedCounterpartyId(counterpartyId);
    setObjectsModalVisible(true);
  };

  // Если user (default) - показываем 403
  if (
    defaultCounterpartyId !== null &&
    user?.role === "user" &&
    user?.counterpartyId === defaultCounterpartyId
  ) {
    return (
      <Result
        status="403"
        title="403 - Доступ запрещен"
        subTitle="У вас нет доступа к справочнику контрагентов. Для работы доступны сотрудники вашей организации."
        extra={
          <Link to="/employees">
            <Button type="primary">Перейти к сотрудникам</Button>
          </Link>
        }
      />
    );
  }

  const handleSaveObjects = async (selectedIds) => {
    try {
      await counterpartyService.saveConstructionSites(
        selectedCounterpartyId,
        selectedIds,
      );
      await fetchData();
      message.success("Объекты сохранены");
    } catch (error) {
      message.error("Ошибка при сохранении объектов");
      throw error;
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await counterpartyService.update(editingId, values);
        message.success("Контрагент обновлен");
      } else {
        await counterpartyService.create(values);
        message.success("Контрагент создан");
      }
      setModalVisible(false);
      fetchData();
    } catch (error) {
      console.error("Error saving counterparty:", error);

      // Детальный вывод ошибок валидации
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMsg = errors
          .map((e) => `${e.field}: ${e.message}`)
          .join("; ");
        message.error(errorMsg);
      } else {
        message.error(error.response?.data?.message || "Ошибка при сохранении");
      }
    }
  };

  const columns = [
    { title: "Название", dataIndex: "name", key: "name" },
    { title: "ИНН", dataIndex: "inn", key: "inn" },
    { title: "КПП", dataIndex: "kpp", key: "kpp" },
    {
      title: "Тип",
      dataIndex: "typeMapping",
      key: "type",
      render: (typeMapping) => {
        const types = typeMapping?.types || [];
        if (types.length === 0) return <span style={{ color: "#999" }}>-</span>;

        return (
          <Space size={4} wrap>
            {types.map((type) => (
              <Tag key={type} color={typeMap[type]?.color}>
                {typeMap[type]?.label || type}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    { title: "Телефон", dataIndex: "phone", key: "phone" },
    { title: "Email", dataIndex: "email", key: "email" },
    {
      title: "Объекты",
      key: "objects",
      render: (_, record) => {
        const objects = record.constructionSites || [];
        // Проверяем права на редактирование объектов
        const canEditObjects =
          canManageAdministrativeData(user?.role) ||
          (user?.role === "user" &&
            user?.counterpartyId !== defaultCounterpartyId &&
            record.parentCounterparty?.id === user?.counterpartyId);

        return (
          <div
            onClick={
              canEditObjects
                ? () => handleOpenObjectsModal(record.id)
                : undefined
            }
            onKeyDown={(event) => {
              if (
                canEditObjects &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                handleOpenObjectsModal(record.id);
              }
            }}
            role="button"
            tabIndex={canEditObjects ? 0 : -1}
            style={{
              cursor: canEditObjects ? "pointer" : "default",
              padding: "4px",
              borderRadius: "4px",
              minHeight: "32px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {objects.length === 0 ? (
              <span style={{ color: "#999", fontSize: "12px" }}>-</span>
            ) : (
              <Space direction="vertical" size={0}>
                {objects.map((obj) => (
                  <span key={obj.id} style={{ fontSize: "12px" }}>
                    {obj.shortName}
                  </span>
                ))}
              </Space>
            )}
          </div>
        );
      },
    },
    {
      title: "Связанные",
      key: "parent",
      render: (_, record) => {
        const parentName = record.parentCounterparty?.name;
        if (!parentName) return <span style={{ color: "#999" }}>-</span>;

        return (
          <Tooltip title="Родительский контрагент">
            <Tag color="cyan">{parentName}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Действия",
      key: "actions",
      render: (_, record) => {
        // Проверяем, является ли контрагент субподрядчиком текущего user
        const isSubcontractor =
          record.parentCounterparty?.id === user?.counterpartyId;

        return (
          <Space>
            <Tooltip title="Копировать ссылку для регистрации">
              <Button
                icon={<LinkOutlined />}
                onClick={() => handleCopyRegistrationLink(record)}
                size="small"
              />
            </Tooltip>
            {canManageAdministrativeData(user?.role) && (
              <>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(record)}
                  size="small"
                />
                <Button
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => handleDelete(record.id)}
                  size="small"
                />
              </>
            )}
            {user?.role === "user" && isSubcontractor && (
              <Button
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
                size="small"
              />
            )}
          </Space>
        );
      },
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
            Контрагенты
          </Title>
          <Input
            placeholder="Поиск по названию или ИНН"
            prefix={<SearchOutlined />}
            value={filters.search || ""}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            style={{ width: 300 }}
            allowClear
          />
          <Select
            placeholder="Тип"
            style={{ width: 150 }}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, type: value }))
            }
            allowClear
          >
            <Select.Option value="customer">Заказчик</Select.Option>
            <Select.Option value="contractor">Подрядчик</Select.Option>
            <Select.Option value="general_contractor">
              Генподрядчик
            </Select.Option>
          </Select>
          {canEditCounterparties && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
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
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total) => `Всего: ${total} записей`,
            }}
          />
        </div>
      </Card>

      {canEditCounterparties && (
        <Modal
          title={
            editingId ? "Редактировать контрагента" : "Добавить контрагента"
          }
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={() => form.submit()}
          width={800}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            {/* Информация для user о создании субподрядчика */}
            {user?.role === "user" && !editingId && (
              <Alert
                message="Создание субподрядчика"
                description="Создаваемый контрагент будет автоматически назначен субподрядчиком вашей организации"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item
                  name="name"
                  label="Название"
                  rules={[{ required: true, message: "Введите название" }]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="inn"
                  label="ИНН"
                  rules={[
                    { required: true, message: "Введите ИНН" },
                    {
                      pattern: /^\d{10}$|^\d{12}$/,
                      message: "ИНН должен содержать 10 или 12 цифр",
                    },
                  ]}
                >
                  <Input maxLength={12} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="kpp"
                  label="КПП"
                  rules={[
                    { required: true, message: "Введите КПП" },
                    {
                      pattern: /^\d{9}$/,
                      message: "КПП должен содержать 9 цифр",
                    },
                  ]}
                >
                  <Input maxLength={9} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="ogrn"
                  label="ОГРН"
                  rules={[
                    {
                      pattern: /^\d{13}$|^\d{15}$/,
                      message: "ОГРН должен содержать 13 или 15 цифр",
                    },
                  ]}
                >
                  <Input maxLength={15} />
                </Form.Item>
              </Col>
              {canManageAdministrativeData(user?.role) && (
                <Col span={12}>
                  <Form.Item
                    name="type"
                    label="Тип"
                    rules={[{ required: true, message: "Выберите тип" }]}
                  >
                    <Select>
                      <Select.Option value="customer">Заказчик</Select.Option>
                      <Select.Option value="contractor">
                        Подрядчик
                      </Select.Option>
                      <Select.Option value="general_contractor">
                        Генподрядчик
                      </Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              )}
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="phone" label="Телефон">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="email" label="Email">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="legalAddress" label="Юридический адрес">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      )}

      <CounterpartyObjectsModal
        visible={objectsModalVisible}
        counterpartyId={selectedCounterpartyId}
        onCancel={() => setObjectsModalVisible(false)}
        onSave={handleSaveObjects}
      />
    </div>
  );
};

export default CounterpartiesPage;
