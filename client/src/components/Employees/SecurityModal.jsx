import { useMemo } from "react";
import { App, Button, Input, Modal, Select, Space, Table } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useSecurityModal } from "@/modules/employees/model/useSecurityModal";
import { buildSecurityModalColumns } from "@/modules/employees/ui/SecurityModalColumns";

const { Option } = Select;

const SecurityModal = ({ visible, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const {
    loading,
    employees,
    counterparties,
    searchText,
    setSearchText,
    selectedCounterparty,
    setSelectedCounterparty,
    statusFilter,
    setStatusFilter,
    handleBlock,
    handleUnblock,
    tablePagination,
  } = useSecurityModal({
    visible,
    onSuccess,
    messageApi: message,
  });

  const columns = useMemo(
    () =>
      buildSecurityModalColumns({
        onBlock: handleBlock,
        onUnblock: handleUnblock,
      }),
    [handleBlock, handleUnblock],
  );

  return (
    <Modal
      title="Блокировка"
      open={visible}
      onCancel={onCancel}
      width={1200}
      maskClosable={false}
      centered={false}
      modalStyle={{ top: "30px" }}
      footer={[
        <Button key="close" onClick={onCancel}>
          Закрыть
        </Button>,
      ]}
    >
      <Space style={{ marginBottom: 16 }} size="middle">
        <Select
          placeholder="Выберите контрагента"
          allowClear
          style={{ width: 300 }}
          value={selectedCounterparty}
          onChange={setSelectedCounterparty}
        >
          {counterparties.map((counterparty) => (
            <Option key={counterparty.id} value={counterparty.id}>
              {counterparty.name}
            </Option>
          ))}
        </Select>

        <Input
          placeholder="Поиск по ФИО"
          prefix={<SearchOutlined />}
          allowClear
          style={{ width: 300 }}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />

        <Select
          placeholder="Фильтр по статусу"
          allowClear
          style={{ width: 200 }}
          value={statusFilter}
          onChange={setStatusFilter}
        >
          <Option value="blocked">Заблокирован</Option>
          <Option value="not_blocked">Не заблокирован</Option>
          <Option value="tb_passed">Прошел ТБ</Option>
          <Option value="tb_not_passed">Не прошел ТБ</Option>
        </Select>
      </Space>

      <Table
        columns={columns}
        dataSource={employees}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ y: 500 }}
        pagination={tablePagination}
        rowClassName={(_, index) =>
          index % 2 === 0 ? "table-row-light" : "table-row-dark"
        }
      />
    </Modal>
  );
};

export default SecurityModal;
