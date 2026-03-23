import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  Input,
  Space,
  Modal,
  Form,
  App,
  Popconfirm,
  Upload,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import positionService from "../services/positionService";
import { useAuthStore } from "../store/authStore";
import * as XLSX from "xlsx";
import { canManageAdministrativeData } from "@/shared/lib/accessControl";

const PAGE_SIZE = 50;

const createColumns = ({ currentPage, canEditAndDelete, onEdit, onDelete }) => [
  {
    title: "№",
    key: "index",
    width: "10%",
    render: (_, __, index) => (currentPage - 1) * PAGE_SIZE + index + 1,
  },
  {
    title: "Название должности",
    dataIndex: "name",
    key: "name",
    width: "70%",
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  {
    title: "Действия",
    key: "actions",
    width: "10%",
    render: (_, record) => (
      <Space size="small">
        {canEditAndDelete ? (
          <>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
              title="Редактировать"
            />
            <Popconfirm
              title="Удалить должность?"
              description="Вы уверены, что хотите удалить эту должность?"
              onConfirm={() => onDelete(record.id)}
              okText="Да"
              cancelText="Нет"
            >
              <Button
                type="link"
                danger
                size="small"
                icon={<DeleteOutlined />}
                title="Удалить"
              />
            </Popconfirm>
          </>
        ) : (
          <span style={{ color: "#999", fontSize: 12 }}>Нет прав</span>
        )}
      </Space>
    ),
  },
];

const PositionsHeader = ({
  canEditAndDelete,
  onSearch,
  onImport,
  onAdd,
}) => (
  <div
    style={{
      marginBottom: 8,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
    }}
  >
    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Должности</h1>
    <Space size="small">
      <Input
        placeholder="Поиск"
        allowClear
        style={{ width: 200 }}
        onChange={(e) => onSearch(e.target.value)}
        size="small"
      />
      {canEditAndDelete && (
        <>
          <Upload accept=".xlsx, .xls" beforeUpload={onImport} showUploadList={false}>
            <Button icon={<UploadOutlined />} size="small">
              Импорт
            </Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd} size="small">
            Добавить
          </Button>
        </>
      )}
    </Space>
  </div>
);

const PositionFormModal = ({
  form,
  loading,
  visible,
  editingPosition,
  onOk,
  onCancel,
}) => (
  <Modal
    title={editingPosition ? "Редактировать должность" : "Добавить должность"}
    open={visible}
    onOk={onOk}
    onCancel={onCancel}
    okText="Сохранить"
    cancelText="Отмена"
    confirmLoading={loading}
  >
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label="Название должности"
        rules={[
          { required: true, message: "Введите название должности" },
          { max: 255, message: "Максимум 255 символов" },
        ]}
      >
        <Input placeholder="Введите название должности" />
      </Form.Item>
    </Form>
  </Modal>
);

const showImportResult = ({ processed, errors, total }) => {
  Modal.success({
    title: "Импорт завершён",
    content: (
      <div>
        <p>
          <strong>Всего записей в файле:</strong> {total}
        </p>
        <p>
          <strong>Успешно обработано:</strong> {processed}
        </p>
        {errors.length > 0 && (
          <>
            <p style={{ color: "red" }}>
              <strong>Ошибок:</strong> {errors.length}
            </p>
            <div style={{ maxHeight: 200, overflow: "auto", marginTop: 8 }}>
              <ul>
                {errors.map((item) => (
                  <li
                    key={`${item.name || "item"}-${item.error || "error"}`}
                    style={{ color: "red" }}
                  >
                    {item.name} - {item.error}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    ),
    width: 600,
  });
};

const PositionsPage = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const [state, setState] = useState({
    positions: [],
    loading: false,
    totalCount: 0,
    currentPage: 1,
    searchText: "",
    modal: {
      visible: false,
      editingPosition: null,
    },
  });

  const {
    positions,
    loading,
    totalCount,
    currentPage,
    searchText,
    modal,
  } = state;

  const canEditAndDelete =
    canManageAdministrativeData(user?.role);

  const fetchPositions = useCallback(
    async (page = 1, search = "") => {
      try {
        setState((prev) => ({ ...prev, loading: true }));
        const response = await positionService.getAll({
          page,
          limit: PAGE_SIZE,
          search,
        });

        setState((prev) => ({
          ...prev,
          positions: response.data.data.positions,
          totalCount: response.data.data.totalCount,
          currentPage: page,
        }));
      } catch (error) {
        console.error("Error fetching positions:", error);
        message.error(error.userMessage || "Ошибка загрузки должностей");
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [message],
  );

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleSearch = (value) => {
    setState((prev) => ({ ...prev, searchText: value }));
    fetchPositions(1, value);
  };

  const handleAdd = () => {
    setState((prev) => ({
      ...prev,
      modal: { visible: true, editingPosition: null },
    }));
    form.resetFields();
  };

  const handleEdit = useCallback((position) => {
    setState((prev) => ({
      ...prev,
      modal: { visible: true, editingPosition: position },
    }));
    form.setFieldsValue({ name: position.name });
  }, [form]);

  const handleCloseModal = () => {
    setState((prev) => ({
      ...prev,
      modal: { visible: false, editingPosition: null },
    }));
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setState((prev) => ({ ...prev, loading: true }));

      if (modal.editingPosition) {
        await positionService.update(modal.editingPosition.id, values);
        message.success("Должность обновлена");
      } else {
        await positionService.create(values);
        message.success("Должность создана");
      }

      handleCloseModal();
      fetchPositions(currentPage, searchText);
    } catch (error) {
      console.error("Error saving position:", error);
      if (error.errorFields) return;
      message.error(error.response?.data?.message || "Ошибка сохранения должности");
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleDelete = useCallback(async (id) => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      await positionService.delete(id);
      message.success("Должность удалена");
      fetchPositions(currentPage, searchText);
    } catch (error) {
      console.error("Error deleting position:", error);
      message.error(error.response?.data?.message || "Ошибка удаления должности");
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [currentPage, fetchPositions, message, searchText]);

  const handleImportExcel = (file) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const positionNames = jsonData
          .map((row) => row[0])
          .filter((name) => name && typeof name === "string" && name.trim() !== "");

        if (positionNames.length === 0) {
          message.warning("В файле Excel не найдено должностей в столбце A");
          return;
        }

        setState((prev) => ({ ...prev, loading: true }));
        const response = await positionService.import(positionNames);
        const { processed, errors, total } = response.data.data;

        showImportResult({ processed, errors, total });
        fetchPositions(currentPage, searchText);
      } catch (error) {
        console.error("Error importing Excel:", error);
        message.error("Ошибка импорта файла Excel");
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    reader.readAsArrayBuffer(file);
    return false;
  };

  const columns = useMemo(
    () =>
      createColumns({
        currentPage,
        canEditAndDelete,
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    [canEditAndDelete, currentPage, handleDelete, handleEdit],
  );

  return (
    <div style={{ padding: "12px 16px" }}>
      <PositionsHeader
        canEditAndDelete={canEditAndDelete}
        onSearch={handleSearch}
        onImport={handleImportExcel}
        onAdd={handleAdd}
      />

      <Table
        columns={columns}
        dataSource={positions}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ y: "calc(100vh - 320px)" }}
        pagination={{
          current: currentPage,
          pageSize: PAGE_SIZE,
          total: totalCount,
          onChange: (page) => fetchPositions(page, searchText),
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total) => `Всего: ${total}`,
          size: "small",
        }}
      />

      <PositionFormModal
        form={form}
        loading={loading}
        visible={modal.visible}
        editingPosition={modal.editingPosition}
        onOk={handleSave}
        onCancel={handleCloseModal}
      />
    </div>
  );
};

export default PositionsPage;
