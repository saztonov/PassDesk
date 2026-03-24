import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import api from "../services/api";

const createCitizenshipColumns = ({
  onOpenEdit,
  onOpenSynonyms,
  onDeleteCitizenship,
}) => [
  {
    title: "Гражданство",
    dataIndex: "name",
    key: "name",
    width: 220,
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  {
    title: "Код",
    dataIndex: "code",
    key: "code",
    width: 100,
  },
  {
    title: "Требуется патент",
    dataIndex: "requiresPatent",
    key: "requiresPatent",
    width: 150,
    align: "center",
    render: (requiresPatent) => (
      <Tag color={requiresPatent ? "orange" : "green"}>
        {requiresPatent ? "Да" : "Нет"}
      </Tag>
    ),
    filters: [
      { text: "Требуется", value: true },
      { text: "Не требуется", value: false },
    ],
    onFilter: (value, record) => record.requiresPatent === value,
  },
  {
    title: "ЕАЭС",
    dataIndex: "isEaeu",
    key: "isEaeu",
    width: 110,
    align: "center",
    render: (isEaeu) => (
      <Tag color={isEaeu ? "geekblue" : "default"}>
        {isEaeu ? "Да" : "Нет"}
      </Tag>
    ),
    filters: [
      { text: "ЕАЭС", value: true },
      { text: "Не ЕАЭС", value: false },
    ],
    onFilter: (value, record) => record.isEaeu === value,
  },
  {
    title: "Синонимы",
    key: "synonyms",
    flex: 1,
    minWidth: 300,
    render: (_, record) => (
      <Space size={4} wrap>
        {record.synonyms && record.synonyms.length > 0 ? (
          record.synonyms.map((synonym) => (
            <Tag key={synonym.id} color="blue">
              {synonym.synonym}
            </Tag>
          ))
        ) : (
          <span style={{ color: "#999" }}>Нет синонимов</span>
        )}
      </Space>
    ),
  },
  {
    title: "Действия",
    key: "actions",
    width: 150,
    align: "center",
    render: (_, record) => (
      <Space size={4}>
        <Tooltip title="Редактировать">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onOpenEdit(record)}
          />
        </Tooltip>
        <Tooltip title="Управление синонимами">
          <Button
            type="link"
            size="small"
            icon={<GlobalOutlined />}
            onClick={() => onOpenSynonyms(record)}
          />
        </Tooltip>
        <Tooltip title="Удалить">
          <Popconfirm
            title="Удалить гражданство?"
            description="Это действие нельзя отменить. Все связанные синонимы также будут удалены."
            onConfirm={() => onDeleteCitizenship(record.id)}
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Tooltip>
      </Space>
    ),
  },
];

const CitizenshipEditorFields = () => (
  <>
    <Form.Item
      name="name"
      label="Название"
      rules={[{ required: true, message: "Введите название гражданства" }]}
    >
      <Input placeholder="Например: Российская Федерация" />
    </Form.Item>

    <Form.Item
      name="code"
      label="Код страны"
      rules={[{ len: 3, message: "Код должен состоять из 3 символов" }]}
    >
      <Input placeholder="Например: RUS" maxLength={3} />
    </Form.Item>

    <Form.Item
      name="requiresPatent"
      label="Требуется патент"
      valuePropName="checked"
    >
      <Switch checkedChildren="Да" unCheckedChildren="Нет" />
    </Form.Item>

    <Form.Item name="isEaeu" label="Страна ЕАЭС" valuePropName="checked">
      <Switch checkedChildren="Да" unCheckedChildren="Нет" />
    </Form.Item>
  </>
);

const SynonymEditorContent = ({
  synonymForm,
  selectedCitizenship,
  onAddSynonym,
  onDeleteSynonym,
}) => (
  <Space direction="vertical" style={{ width: "100%" }} size="large">
    <Form form={synonymForm} layout="inline" onFinish={onAddSynonym}>
      <Form.Item
        name="synonym"
        rules={[{ required: true, message: "Введите синоним" }]}
        style={{ flex: 1 }}
      >
        <Input placeholder="Введите синоним" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
          Добавить
        </Button>
      </Form.Item>
    </Form>

    <div>
      <strong>Существующие синонимы:</strong>
      <div style={{ marginTop: 8 }}>
        {selectedCitizenship?.synonyms &&
        selectedCitizenship.synonyms.length > 0 ? (
          <Space size={8} wrap>
            {selectedCitizenship.synonyms.map((synonym) => (
              <Tag
                key={synonym.id}
                closable
                onClose={() => onDeleteSynonym(synonym.id)}
                color="blue"
              >
                {synonym.synonym}
              </Tag>
            ))}
          </Space>
        ) : (
          <div style={{ color: "#999", fontStyle: "italic" }}>
            Синонимы не добавлены
          </div>
        )}
      </div>
    </div>
  </Space>
);

const CitizenshipsPage = () => {
  const [citizenships, setCitizenships] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState({
    editorVisible: false,
    synonymVisible: false,
    editingCitizenship: null,
    selectedCitizenship: null,
  });
  const [form] = Form.useForm();
  const [synonymForm] = Form.useForm();
  const {
    editorVisible,
    synonymVisible,
    editingCitizenship,
    selectedCitizenship,
  } = modalState;

  // Загрузка списка гражданств
  const fetchCitizenships = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/citizenships");
      setCitizenships(response.data.data.citizenships);
    } catch (error) {
      console.error("Error fetching citizenships:", error);
      message.error("Ошибка при загрузке гражданств");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCitizenships();
  }, [fetchCitizenships]);

  // Открыть модальное окно для создания/редактирования
  const handleOpenModal = useCallback((citizenship = null) => {
    setModalState((prev) => ({
      ...prev,
      editingCitizenship: citizenship,
      editorVisible: true,
    }));
    if (citizenship) {
      form.setFieldsValue({
        name: citizenship.name,
        code: citizenship.code,
        requiresPatent: citizenship.requiresPatent,
        isEaeu: citizenship.isEaeu,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ requiresPatent: true, isEaeu: false });
    }
  }, [form]);

  // Закрыть модальное окно
  const handleCloseModal = () => {
    setModalState((prev) => ({
      ...prev,
      editorVisible: false,
      editingCitizenship: null,
    }));
    form.resetFields();
  };

  // Сохранить гражданство
  const handleSaveCitizenship = async () => {
    try {
      const values = await form.validateFields();

      if (editingCitizenship) {
        await api.put(`/citizenships/${editingCitizenship.id}`, values);
        message.success("Гражданство обновлено");
      } else {
        await api.post("/citizenships", values);
        message.success("Гражданство создано");
      }

      handleCloseModal();
      fetchCitizenships();
    } catch (error) {
      console.error("Error saving citizenship:", error);
      const errorMessage =
        error.response?.data?.message || "Ошибка при сохранении";
      message.error(errorMessage);
    }
  };

  // Открыть модальное окно для управления синонимами
  const handleOpenSynonymModal = useCallback((citizenship) => {
    setModalState((prev) => ({
      ...prev,
      selectedCitizenship: citizenship,
      synonymVisible: true,
    }));
  }, []);

  // Закрыть модальное окно синонимов
  const handleCloseSynonymModal = () => {
    setModalState((prev) => ({
      ...prev,
      synonymVisible: false,
      selectedCitizenship: null,
    }));
    synonymForm.resetFields();
  };

  // Добавить синоним
  const handleAddSynonym = async () => {
    try {
      const values = await synonymForm.validateFields();
      await api.post(
        `/citizenships/${selectedCitizenship.id}/synonyms`,
        values,
      );
      message.success("Синоним добавлен");
      synonymForm.resetFields();
      fetchCitizenships();
    } catch (error) {
      console.error("Error adding synonym:", error);
      const errorMessage =
        error.response?.data?.message || "Ошибка при добавлении синонима";
      message.error(errorMessage);
    }
  };

  // Удалить синоним
  const handleDeleteSynonym = async (synonymId) => {
    try {
      await api.delete(`/citizenships/synonyms/${synonymId}`);
      message.success("Синоним удален");
      fetchCitizenships();
    } catch (error) {
      console.error("Error deleting synonym:", error);
      message.error("Ошибка при удалении синонима");
    }
  };

  // Удалить гражданство
  const handleDeleteCitizenship = useCallback(async (citizenshipId) => {
    try {
      await api.delete(`/citizenships/${citizenshipId}`);
      message.success("Гражданство удалено");
      fetchCitizenships();
    } catch (error) {
      console.error("Error deleting citizenship:", error);
      const errorMessage =
        error.response?.data?.message || "Ошибка при удалении гражданства";
      message.error(errorMessage);
    }
  }, [fetchCitizenships]);

  const columns = useMemo(
    () =>
      createCitizenshipColumns({
        onOpenEdit: handleOpenModal,
        onOpenSynonyms: handleOpenSynonymModal,
        onDeleteCitizenship: handleDeleteCitizenship,
      }),
    [handleDeleteCitizenship, handleOpenModal, handleOpenSynonymModal],
  );

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
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "flex-end",
          padding: 24,
          paddingBottom: 0,
          flexShrink: 0,
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          Добавить гражданство
        </Button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "16px 24px 24px 24px",
        }}
      >
        <Table
          columns={columns}
          dataSource={citizenships}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
        />
      </div>

      {/* Модальное окно для создания/редактирования гражданства */}
      <Modal
        title={
          editingCitizenship
            ? "Редактировать гражданство"
            : "Добавить гражданство"
        }
        open={editorVisible}
        onOk={handleSaveCitizenship}
        onCancel={handleCloseModal}
        okText="Сохранить"
        cancelText="Отмена"
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ requiresPatent: true, isEaeu: false }}
        >
          <CitizenshipEditorFields />
        </Form>
      </Modal>

      {/* Модальное окно для управления синонимами */}
      <Modal
        title={`Синонимы для: ${selectedCitizenship?.name}`}
        open={synonymVisible}
        onCancel={handleCloseSynonymModal}
        footer={null}
        width={600}
      >
        <SynonymEditorContent
          synonymForm={synonymForm}
          selectedCitizenship={selectedCitizenship}
          onAddSynonym={handleAddSynonym}
          onDeleteSynonym={handleDeleteSynonym}
        />
      </Modal>
    </div>
  );
};

export default CitizenshipsPage;
