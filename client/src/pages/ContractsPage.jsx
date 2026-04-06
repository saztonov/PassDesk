import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  Tag,
  Typography,
  App,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { contractService } from "../services/contractService";
import { counterpartyService } from "../services/counterpartyService";
import { constructionSiteService } from "../services/constructionSiteService";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const DATE_FORMAT = "DD.MM.YYYY";
const { Title } = Typography;

const createContractColumns = ({ onEdit, onDelete }) => [
  { title: "Номер", dataIndex: "contractNumber", key: "contractNumber" },
  {
    title: "Дата",
    dataIndex: "contractDate",
    key: "contractDate",
    render: (date) => (date ? dayjs(date).format(DATE_FORMAT) : "-"),
  },
  {
    title: "Тип",
    dataIndex: "type",
    render: (type) => (
      <Tag color={type === "general_contract" ? "blue" : "green"}>
        {type === "general_contract" ? "Генподряд" : "Подряд"}
      </Tag>
    ),
  },
  {
    title: "Объект",
    dataIndex: ["constructionSite", "shortName"],
    key: "site",
  },
  {
    title: "Действия",
    render: (_, record) => (
      <Space>
        <Button icon={<EditOutlined />} onClick={() => onEdit(record)} />
        <Button
          icon={<DeleteOutlined />}
          danger
          onClick={() => onDelete(record)}
        />
      </Space>
    ),
  },
];

const ContractEditorFields = ({ sites, counterparties }) => (
  <>
    <Form.Item
      name="contractNumber"
      label="Номер договора"
      rules={[{ required: true }]}
    >
      <Input />
    </Form.Item>
    <Form.Item
      name="contractDate"
      label="Дата договора"
      rules={[{ required: true, message: "Введите дату договора" }]}
    >
      <DatePicker
        style={{ width: "100%" }}
        format={DATE_FORMAT}
        placeholder="ДД.ММ.ГГГГ"
      />
    </Form.Item>
    <Form.Item name="type" label="Тип" rules={[{ required: true }]}>
      <Select>
        <Select.Option value="general_contract">
          Договор генподряда
        </Select.Option>
        <Select.Option value="subcontract">Договор подряда</Select.Option>
      </Select>
    </Form.Item>
    <Form.Item
      name="constructionSiteId"
      label="Объект строительства"
      rules={[{ required: true }]}
    >
      <Select showSearch optionFilterProp="children">
        {sites.map((site) => (
          <Select.Option key={site.id} value={site.id}>
            {site.shortName}
          </Select.Option>
        ))}
      </Select>
    </Form.Item>
    <Form.Item
      name="counterparty1Id"
      label="Контрагент 1"
      rules={[{ required: true }]}
    >
      <Select showSearch optionFilterProp="children">
        {counterparties.map((cp) => (
          <Select.Option key={cp.id} value={cp.id}>
            {cp.name}
          </Select.Option>
        ))}
      </Select>
    </Form.Item>
    <Form.Item
      name="counterparty2Id"
      label="Контрагент 2"
      rules={[{ required: true }]}
    >
      <Select showSearch optionFilterProp="children">
        {counterparties.map((cp) => (
          <Select.Option key={cp.id} value={cp.id}>
            {cp.name}
          </Select.Option>
        ))}
      </Select>
    </Form.Item>
  </>
);

const ContractsPage = () => {
  const { message, modal } = App.useApp();
  const [data, setData] = useState([]);
  const [referenceData, setReferenceData] = useState({
    counterparties: [],
    sites: [],
  });
  const [uiState, setUiState] = useState({
    loading: false,
    modalVisible: false,
    editingId: null,
  });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
  });
  const [form] = Form.useForm();
  const { counterparties, sites } = referenceData;
  const { loading, modalVisible, editingId } = uiState;

  const fetchData = useCallback(async () => {
    setUiState((prev) => ({ ...prev, loading: true }));
    try {
      const { data: response } = await contractService.getAll();
      setData(response.data.contracts);
    } catch (error) {
      message.error("Ошибка при загрузке данных");
    } finally {
      setUiState((prev) => ({ ...prev, loading: false }));
    }
  }, [message]);

  const fetchCounterparties = useCallback(async () => {
    try {
      // Загружаем все контрагенты без ограничения для поиска
      const { data } = await counterpartyService.getAll({
        limit: 10000,
        page: 1,
      });
      setReferenceData((prev) => ({
        ...prev,
        counterparties: data.data.counterparties,
      }));
    } catch (error) {
      console.error("Error loading counterparties:", error);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const { data } = await constructionSiteService.getAll({ limit: 100 });
      setReferenceData((prev) => ({
        ...prev,
        sites: data.data.constructionSites,
      }));
    } catch (error) {
      console.error("Error loading sites:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchCounterparties();
    fetchSites();
  }, [fetchData, fetchCounterparties, fetchSites]);

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        contractDate: values.contractDate.format("YYYY-MM-DD"),
      };
      if (editingId) {
        await contractService.update(editingId, data);
        message.success("Договор обновлен");
      } else {
        await contractService.create(data);
        message.success("Договор создан");
      }
      setUiState((prev) => ({ ...prev, modalVisible: false }));
      fetchData();
    } catch (error) {
      message.error("Ошибка при сохранении");
    }
  };

  const handleEdit = useCallback(
    (record) => {
      setUiState((prev) => ({
        ...prev,
        editingId: record.id,
        modalVisible: true,
      }));
      form.setFieldsValue({
        ...record,
        contractDate: dayjs(record.contractDate),
      });
    },
    [form],
  );

  const handleDelete = useCallback(
    (record) => {
      modal.confirm({
        title: "Удалить договор?",
        onOk: async () => {
          await contractService.delete(record.id);
          message.success("Договор удален");
          fetchData();
        },
      });
    },
    [fetchData, message, modal],
  );

  const columns = useMemo(
    () =>
      createContractColumns({
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    [handleDelete, handleEdit],
  );

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
            Договора
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setUiState((prev) => ({
                ...prev,
                editingId: null,
                modalVisible: true,
              }));
              form.resetFields();
            }}
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
            style={{ fontSize: 12 }}
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
          />
        </div>
      </Card>

      <Modal
        title={editingId ? "Редактировать договор" : "Добавить договор"}
        open={modalVisible}
        onCancel={() =>
          setUiState((prev) => ({ ...prev, modalVisible: false }))
        }
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <ContractEditorFields sites={sites} counterparties={counterparties} />
        </Form>
      </Modal>
    </div>
  );
};

export default ContractsPage;
