import { Checkbox, Empty, Spin, Table } from "antd";

const ApplicationRequestModalEmployeeTable = ({
  availableEmployees,
  allSelected,
  selectedEmployees,
  onSelectAll,
  rowSelection,
  columns,
  loading,
  pagination,
  onPaginationChange,
}) => (
  <>
    {loading && availableEmployees.length === 0 && (
      <div
        style={{
          minHeight: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <Spin size="large" tip="Загружаем сотрудников..." />
      </div>
    )}

    {availableEmployees.length > 0 && (
      <Checkbox
        checked={allSelected}
        onChange={onSelectAll}
        indeterminate={
          selectedEmployees.length > 0 &&
          selectedEmployees.length < availableEmployees.length
        }
      >
        Выделить страницу ({availableEmployees.length})
      </Checkbox>
    )}

    {availableEmployees.length > 0 && (
      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={availableEmployees}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: ["50", "100", "200"],
          onChange: (page, pageSize) => {
            onPaginationChange(page, pageSize);
          },
        }}
        scroll={{ x: 1200, y: 400 }}
      />
    )}

    {availableEmployees.length === 0 && !loading && (
      <div
        style={{
          minHeight: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <Empty description="Нет доступных сотрудников по выбранным фильтрам" />
      </div>
    )}
  </>
);

export default ApplicationRequestModalEmployeeTable;
