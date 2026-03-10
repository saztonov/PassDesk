import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { passService } from "@/services/passService";
import { employeeService } from "@/services/employeeService";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const DATE_FORMAT = "DD.MM.YYYY";
const STORAGE_KEY = "passesPageState";

const PASS_TYPE_LABELS = {
  temporary: "Временный",
  permanent: "Постоянный",
  visitor: "Посетитель",
  contractor: "Подрядчик",
};

const STATUS_COLORS = {
  active: "success",
  expired: "default",
  revoked: "error",
  pending: "warning",
};

const STATUS_LABELS = {
  active: "Активен",
  expired: "Истек",
  revoked: "Отозван",
  pending: "Ожидание",
};

const ACCESS_ZONE_OPTIONS = [
  { label: "Здание А", value: "building_a" },
  { label: "Здание Б", value: "building_b" },
  { label: "Этаж 1", value: "floor_1" },
  { label: "Этаж 2", value: "floor_2" },
  { label: "Этаж 3", value: "floor_3" },
  { label: "Серверная", value: "server_room" },
  { label: "Парковка", value: "parking" },
];

const loadPassesPageState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        searchText: "",
        tableFilters: {},
        pagination: { current: 1, pageSize: 10 },
      };
    }

    const parsed = JSON.parse(saved);
    return {
      searchText: parsed.searchText || "",
      tableFilters: parsed.tableFilters || {},
      pagination: parsed.pagination || { current: 1, pageSize: 10 },
    };
  } catch (error) {
    console.warn("Ошибка загрузки состояния страницы пропусков:", error);
    return {
      searchText: "",
      tableFilters: {},
      pagination: { current: 1, pageSize: 10 },
    };
  }
};

const buildEmployeeName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

const normalizePassRecord = (pass) => ({
  ...pass,
  employeeName:
    buildEmployeeName(pass?.employee) ||
    pass?.employeeName ||
    pass?.employee?.fullName ||
    "Без имени",
});

const PassesToolbar = ({
  searchText,
  onSearchChange,
  onAdd,
  onRefresh,
  loading,
}) => (
  <>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <Title level={2} style={{ margin: 0 }}>
        Пропуска
      </Title>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
          Обновить
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          Создать пропуск
        </Button>
      </Space>
    </div>

    <Space style={{ marginBottom: 16, width: "100%" }} direction="vertical">
      <Input
        placeholder="Поиск по номеру пропуска или сотруднику..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={onSearchChange}
        size="large"
        style={{ maxWidth: 500 }}
      />
    </Space>
  </>
);

const PassModalFormFields = ({ employeeOptions }) => (
  <>
    <Form.Item
      name="employeeId"
      label="Сотрудник"
      rules={[{ required: true, message: "Выберите сотрудника" }]}
    >
      <Select
        showSearch
        placeholder="Выберите сотрудника"
        options={employeeOptions}
        optionFilterProp="label"
      />
    </Form.Item>

    <Form.Item
      name="passType"
      label="Тип пропуска"
      rules={[{ required: true, message: "Выберите тип пропуска" }]}
    >
      <Select
        placeholder="Выберите тип"
        options={Object.entries(PASS_TYPE_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
    </Form.Item>

    <Form.Item
      name="status"
      label="Статус"
      rules={[{ required: true, message: "Выберите статус" }]}
    >
      <Select
        placeholder="Выберите статус"
        options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
    </Form.Item>

    <Form.Item
      name="dateRange"
      label="Период действия"
      rules={[{ required: true, message: "Выберите период действия" }]}
    >
      <RangePicker
        style={{ width: "100%" }}
        format={DATE_FORMAT}
        placeholder={["ДД.ММ.ГГГГ", "ДД.ММ.ГГГГ"]}
      />
    </Form.Item>

    <Form.Item name="accessZones" label="Зоны доступа">
      <Select
        mode="multiple"
        placeholder="Выберите зоны доступа"
        options={ACCESS_ZONE_OPTIONS}
      />
    </Form.Item>

    <Form.Item name="notes" label="Комментарий">
      <Input.TextArea rows={3} placeholder="Комментарий к пропуску" />
    </Form.Item>
  </>
);

const QrIssueModal = ({
  open,
  loading,
  qrState,
  passType,
  onGenerate,
  onClose,
  onCopyToken,
}) => (
  <Modal
    open={open}
    onCancel={onClose}
    footer={null}
    title="QR для прохода"
    destroyOnClose
  >
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Тип QR определяется сервером по типу пропуска:{" "}
        {passType === "temporary" ? "одноразовый" : "с периодом действия"}.
      </Paragraph>

      <Button
        type="primary"
        icon={<QrcodeOutlined />}
        onClick={onGenerate}
        loading={loading}
      >
        Выпустить QR
      </Button>

      {qrState?.qrImageDataUrl ? (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div
            style={{
              border: "1px solid #f0f0f0",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              justifyContent: "center",
              background: "#fff",
            }}
          >
            <img
              src={qrState.qrImageDataUrl}
              alt="QR код доступа"
              style={{ width: 240, height: 240, display: "block" }}
            />
          </div>
          <Text type="secondary">
            Действует до:{" "}
            {qrState.expiresAt
              ? dayjs(qrState.expiresAt).format("DD.MM.YYYY HH:mm")
              : "-"}
          </Text>
          <Input.TextArea value={qrState.token || ""} rows={4} readOnly />
          <Button onClick={onCopyToken}>Скопировать токен</Button>
        </Space>
      ) : (
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Выпустите QR, чтобы показать его сотруднику или передать дальше.
        </Paragraph>
      )}
    </Space>
  </Modal>
);

const createPassColumns = ({
  tableFilters,
  onEdit,
  onRevoke,
  onDelete,
  onIssueQr,
}) => [
  {
    title: "№ Пропуска",
    dataIndex: "passNumber",
    key: "passNumber",
    width: 220,
  },
  {
    title: "Сотрудник",
    dataIndex: "employeeName",
    key: "employeeName",
    sorter: (a, b) => a.employeeName.localeCompare(b.employeeName),
  },
  {
    title: "Тип",
    dataIndex: "passType",
    key: "passType",
    render: (type) => PASS_TYPE_LABELS[type] || type || "-",
    filters: Object.entries(PASS_TYPE_LABELS).map(([value, label]) => ({
      text: label,
      value,
    })),
    filteredValue: tableFilters.passType || null,
    onFilter: (value, record) => record.passType === value,
  },
  {
    title: "Период",
    key: "validUntil",
    render: (_, record) =>
      `${record.validFrom ? dayjs(record.validFrom).format(DATE_FORMAT) : "-"} - ${
        record.validUntil ? dayjs(record.validUntil).format(DATE_FORMAT) : "-"
      }`,
    sorter: (a, b) => new Date(a.validUntil) - new Date(b.validUntil),
  },
  {
    title: "Зоны доступа",
    dataIndex: "accessZones",
    key: "accessZones",
    render: (zones = []) => (
      <Space size={4} wrap>
        {zones.slice(0, 2).map((zone) => (
          <Tag key={zone} color="blue">
            {zone}
          </Tag>
        ))}
        {zones.length > 2 && <Tag>+{zones.length - 2}</Tag>}
      </Space>
    ),
  },
  {
    title: "Статус",
    dataIndex: "status",
    key: "status",
    render: (status) => (
      <Tag color={STATUS_COLORS[status] || "default"}>
        {STATUS_LABELS[status] || status || "-"}
      </Tag>
    ),
    filters: Object.entries(STATUS_LABELS).map(([value, label]) => ({
      text: label,
      value,
    })),
    filteredValue: tableFilters.status || null,
    onFilter: (value, record) => record.status === value,
  },
  {
    title: "Действия",
    key: "actions",
    width: 190,
    render: (_, record) => (
      <Space>
        <Tooltip title="Выпустить QR">
          <Button
            type="text"
            icon={<QrcodeOutlined />}
            onClick={() => onIssueQr(record)}
          />
        </Tooltip>
        <Tooltip title="Редактировать">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
        </Tooltip>
        {record.status === "active" && (
          <Tooltip title="Отозвать">
            <Button
              type="text"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => onRevoke(record)}
            />
          </Tooltip>
        )}
        <Tooltip title="Удалить">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record)}
          />
        </Tooltip>
      </Space>
    ),
  },
];

const PassesPage = ({ embedded = false }) => {
  const { message } = App.useApp();
  const initialState = useMemo(loadPassesPageState, []);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [passes, setPasses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [uiState, setUiState] = useState(() => ({
    searchText: initialState.searchText,
    tableFilters: initialState.tableFilters,
    pagination: initialState.pagination,
    isModalOpen: false,
    editingPass: null,
    qrModalOpen: false,
    qrPass: null,
    qrState: null,
  }));

  const {
    searchText,
    tableFilters,
    pagination,
    isModalOpen,
    editingPass,
    qrModalOpen,
    qrPass,
    qrState,
  } = uiState;

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchText,
        tableFilters,
        pagination: {
          current: pagination.current || 1,
          pageSize: pagination.pageSize || 10,
        },
      }),
    );
  }, [pagination, searchText, tableFilters]);

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label:
          buildEmployeeName(employee) ||
          employee.fullName ||
          employee.email ||
          String(employee.id),
      })),
    [employees],
  );

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const [passesResponse, employeesResponse] = await Promise.all([
        passService.getAll({ page: 1, limit: 1000 }),
        employeeService.getAll({ page: 1, limit: 10000, activeOnly: "true" }),
      ]);

      const nextPasses = Array.isArray(passesResponse?.passes)
        ? passesResponse.passes.map(normalizePassRecord)
        : [];
      const nextEmployees = Array.isArray(employeesResponse?.data?.employees)
        ? employeesResponse.data.employees
        : [];

      setPasses(nextPasses);
      setEmployees(nextEmployees);
    } catch (error) {
      console.error("Failed to load passes page:", error);
      message.error("Не удалось загрузить пропуска");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({
      passType: "temporary",
      status: "active",
      accessZones: [],
    });
    setUiState((prev) => ({ ...prev, editingPass: null, isModalOpen: true }));
  };

  const handleEdit = (pass) => {
    form.setFieldsValue({
      employeeId: pass.employeeId,
      passType: pass.passType,
      status: pass.status,
      accessZones: pass.accessZones || [],
      notes: pass.notes || "",
      dateRange:
        pass.validFrom && pass.validUntil
          ? [dayjs(pass.validFrom), dayjs(pass.validUntil)]
          : undefined,
    });
    setUiState((prev) => ({ ...prev, editingPass: pass, isModalOpen: true }));
  };

  const handleRevoke = (pass) => {
    Modal.confirm({
      title: "Отозвать пропуск",
      content: `Вы уверены, что хотите отозвать пропуск ${pass.passNumber}?`,
      okText: "Отозвать",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await passService.revoke(pass.id);
          message.success("Пропуск отозван");
          await loadPageData();
        } catch (error) {
          console.error("Failed to revoke pass:", error);
          message.error("Не удалось отозвать пропуск");
        }
      },
    });
  };

  const handleDelete = (pass) => {
    Modal.confirm({
      title: "Удаление пропуска",
      content: `Вы уверены, что хотите удалить пропуск ${pass.passNumber}?`,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await passService.delete(pass.id);
          message.success("Пропуск удален");
          await loadPageData();
        } catch (error) {
          console.error("Failed to delete pass:", error);
          message.error("Не удалось удалить пропуск");
        }
      },
    });
  };

  const handleIssueQrOpen = (pass) => {
    setUiState((prev) => ({
      ...prev,
      qrModalOpen: true,
      qrPass: pass,
      qrState: null,
    }));
  };

  const handleGenerateQr = async () => {
    if (!qrPass?.employeeId) {
      message.warning("Не удалось определить сотрудника для QR");
      return;
    }

    setQrLoading(true);
    try {
      const result = await passService.issueQr(qrPass.id, {
        channel: "web",
      });
      setUiState((prev) => ({ ...prev, qrState: result || null }));
      message.success("QR выпущен");
    } catch (error) {
      console.error("Failed to issue QR:", error);
      message.error("Не удалось выпустить QR");
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyQrToken = async () => {
    if (!qrState?.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(qrState.token);
      message.success("Токен скопирован");
    } catch (error) {
      console.error("Failed to copy QR token:", error);
      message.error("Не удалось скопировать токен");
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        employeeId: values.employeeId,
        passType: values.passType,
        status: values.status,
        validFrom: values.dateRange?.[0]?.startOf("day")?.toISOString(),
        validUntil: values.dateRange?.[1]?.endOf("day")?.toISOString(),
        accessZones: values.accessZones || [],
        notes: values.notes || "",
      };

      if (editingPass?.id) {
        await passService.update(editingPass.id, payload);
        message.success("Пропуск обновлен");
      } else {
        await passService.create(payload);
        message.success("Пропуск создан");
      }

      setUiState((prev) => ({
        ...prev,
        isModalOpen: false,
        editingPass: null,
      }));
      form.resetFields();
      await loadPageData();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      console.error("Failed to save pass:", error);
      message.error("Не удалось сохранить пропуск");
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalCancel = () => {
    form.resetFields();
    setUiState((prev) => ({ ...prev, isModalOpen: false, editingPass: null }));
  };

  const filteredPasses = useMemo(() => {
    const searchLower = searchText.trim().toLowerCase();
    if (!searchLower) {
      return passes;
    }

    return passes.filter((pass) => {
      const passNumber = String(pass.passNumber || "").toLowerCase();
      const employeeName = String(pass.employeeName || "").toLowerCase();
      return (
        passNumber.includes(searchLower) || employeeName.includes(searchLower)
      );
    });
  }, [passes, searchText]);

  const columns = createPassColumns({
    tableFilters,
    onEdit: handleEdit,
    onRevoke: handleRevoke,
    onDelete: handleDelete,
    onIssueQr: handleIssueQrOpen,
  });

  return (
    <div>
      {embedded ? null : (
        <PassesToolbar
          searchText={searchText}
          onSearchChange={(e) =>
            setUiState((prev) => ({
              ...prev,
              searchText: e.target.value,
              pagination: { ...prev.pagination, current: 1 },
            }))
          }
          onAdd={handleAdd}
          onRefresh={loadPageData}
          loading={loading}
        />
      )}

      {embedded ? (
        <Space
          style={{ marginBottom: 16, width: "100%" }}
          direction="vertical"
        >
          <Space
            style={{ width: "100%", justifyContent: "space-between" }}
            wrap
          >
            <Input
              placeholder="Поиск по номеру пропуска или сотруднику..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) =>
                setUiState((prev) => ({
                  ...prev,
                  searchText: e.target.value,
                  pagination: { ...prev.pagination, current: 1 },
                }))
              }
              size="large"
              style={{ maxWidth: 500 }}
            />
            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadPageData}
                loading={loading}
              >
                Обновить
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                Создать пропуск
              </Button>
            </Space>
          </Space>
        </Space>
      ) : null}

      <Table
        columns={columns}
        dataSource={filteredPasses}
        rowKey="id"
        loading={loading}
        onChange={(nextPagination, nextFilters) => {
          setUiState((prev) => ({
            ...prev,
            tableFilters: nextFilters || {},
            pagination: {
              ...prev.pagination,
              current: nextPagination.current || prev.pagination.current,
              pageSize: nextPagination.pageSize || prev.pagination.pageSize,
            },
          }));
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total}`,
        }}
      />

      <Modal
        title={editingPass ? "Редактировать пропуск" : "Создать пропуск"}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={640}
        okText={editingPass ? "Сохранить" : "Создать"}
        cancelText="Отмена"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <PassModalFormFields employeeOptions={employeeOptions} />
        </Form>
      </Modal>

      <QrIssueModal
        open={qrModalOpen}
        loading={qrLoading}
        qrState={qrState}
        passType={qrPass?.passType || null}
        onGenerate={handleGenerateQr}
        onClose={() =>
          setUiState((prev) => ({
            ...prev,
            qrModalOpen: false,
            qrPass: null,
            qrState: null,
          }))
        }
        onCopyToken={handleCopyQrToken}
      />
    </div>
  );
};

export default PassesPage;
