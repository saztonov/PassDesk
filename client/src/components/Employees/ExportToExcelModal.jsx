import { useMemo } from "react";
import { App, Button, Checkbox, Modal, Select, Space, Table } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { useExportToExcelModal } from "@/modules/employees/model/useExportToExcelModal";
import { buildExportToExcelModalColumns } from "@/modules/employees/ui/ExportToExcelModalColumns";

const { Option } = Select;

const ExportToExcelModal = ({ visible, onCancel }) => {
  const { message } = App.useApp();
  const {
    loading,
    constructionSites,
    counterparties,
    employees,
    totalCount,
    currentPage,
    pageSize,
    selectedEmployees,
    checkRequiredFields,
    setCheckRequiredFields,
    constructionSiteId,
    setConstructionSiteId,
    counterpartyId,
    setCounterpartyId,
    setCurrentPage,
    setPageSize,
    rowSelection,
    handleExport,
  } = useExportToExcelModal({
    visible,
    onCancel,
    messageApi: message,
  });

  const columns = useMemo(
    () =>
      buildExportToExcelModalColumns({
        constructionSiteId,
        counterpartyId,
      }),
    [constructionSiteId, counterpartyId],
  );

  return (
    <Modal
      title="Экспорт сотрудников в Excel"
      open={visible}
      onCancel={onCancel}
      width={1400}
      footer={
        <Space>
          <Button onClick={onCancel}>Отмена</Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExport}
            loading={loading}
            disabled={selectedEmployees.length === 0}
          >
            Экспортировать ({selectedEmployees.length})
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space size="middle" wrap>
          <div style={{ minWidth: 250 }}>
            <div style={{ display: "block", marginBottom: 4 }}>Объект</div>
            <Select
              placeholder="Выберите объект"
              allowClear
              showSearch
              optionFilterProp="children"
              style={{ width: "100%" }}
              value={constructionSiteId}
              onChange={setConstructionSiteId}
            >
              {constructionSites.map((site) => (
                <Option key={site.id} value={site.id}>
                  {site.shortName || site.name}
                </Option>
              ))}
            </Select>
          </div>

          <div style={{ minWidth: 250 }}>
            <div style={{ display: "block", marginBottom: 4 }}>Контрагент</div>
            <Select
              placeholder="Выберите контрагента"
              allowClear
              showSearch
              optionFilterProp="children"
              style={{ width: "100%" }}
              value={counterpartyId}
              onChange={setCounterpartyId}
            >
              {counterparties.map((counterparty) => (
                <Option key={counterparty.id} value={counterparty.id}>
                  {counterparty.name}
                </Option>
              ))}
            </Select>
          </div>

          <div style={{ minWidth: 280 }}>
            <div style={{ display: "block", marginBottom: 4 }}>Проверка</div>
            <Checkbox
              checked={checkRequiredFields}
              onChange={(event) =>
                setCheckRequiredFields(event.target.checked)
              }
            >
              Проверять обязательные поля
            </Checkbox>
          </div>
        </Space>

        {employees.length > 0 && (
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={employees}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              current: currentPage,
              pageSize,
              total: totalCount,
              showSizeChanger: true,
              pageSizeOptions: ["50", "100", "200"],
              onChange: (page, nextPageSize) => {
                if (nextPageSize !== pageSize) {
                  setPageSize(nextPageSize);
                  setCurrentPage(1);
                  return;
                }

                setCurrentPage(page);
              },
            }}
            scroll={{ x: 1600 }}
          />
        )}

        {employees.length === 0 &&
          constructionSiteId &&
          counterpartyId &&
          !loading && (
            <div
              style={{ textAlign: "center", padding: "20px", color: "#999" }}
            >
              Нет сотрудников, соответствующих выбранным условиям
            </div>
          )}
      </Space>
    </Modal>
  );
};

export default ExportToExcelModal;
