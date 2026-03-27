import { Modal, Space, App } from "antd";
import ExcelColumnsModal from "./ExcelColumnsModal";
import ApplicationRequestModalEmployeeTable from "@/modules/employees/ui/ApplicationRequestModalEmployeeTable";
import ApplicationRequestModalFilters from "@/modules/employees/ui/ApplicationRequestModalFilters";
import ApplicationRequestModalFooter from "@/modules/employees/ui/ApplicationRequestModalFooter";
import { useApplicationRequestModal } from "@/modules/employees/model/useApplicationRequestModal";

const ApplicationRequestModal = ({
  visible,
  onCancel,
  userRole,
  userCounterpartyId,
  defaultCounterpartyId,
  userId,
}) => {
  const { message } = App.useApp();
  const {
    loading,
    tableLoading,
    sitesLoading,
    counterpartiesLoading,
    downloadingConsents,
    selectedEmployees,
    allSelected,
    selectedSite,
    setSelectedSite,
    selectedCounterparty,
    setSelectedCounterparty,
    includeFired,
    setIncludeFired,
    availableSites,
    availableCounterparties,
    isColumnsModalOpen,
    setIsColumnsModalOpen,
    pagination,
    setPagination,
    availableEmployees,
    handleSelectAll,
    rowSelection,
    columns,
    selectedColumns,
    updateColumns,
    toggleColumn,
    moveColumnUp,
    moveColumnDown,
    selectAll,
    deselectAll,
    handleCreateRequest,
    handleDownloadConsents,
  } = useApplicationRequestModal({
    visible,
    userRole,
    userCounterpartyId,
    defaultCounterpartyId,
    userId,
    onCancel,
    messageApi: message,
  });

  return (
    <Modal
      title="Создать заявку"
      open={visible}
      onCancel={onCancel}
      width={1200}
      wrapClassName="full-height-modal"
      style={{
        top: "5vh",
        height: "90vh",
        display: "flex",
        flexDirection: "column",
      }}
      styles={{
        body: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        },
        content: { display: "flex", flexDirection: "column", height: "100%" },
      }}
      footer={
        <ApplicationRequestModalFooter
          downloadingConsents={downloadingConsents}
          onDownloadConsents={handleDownloadConsents}
          selectedCount={selectedEmployees.length}
          onCancel={onCancel}
          onCreate={handleCreateRequest}
          loading={loading}
        />
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <ApplicationRequestModalFilters
          userRole={userRole}
          selectedCounterparty={selectedCounterparty}
          onCounterpartyChange={setSelectedCounterparty}
          counterpartiesLoading={counterpartiesLoading}
          availableCounterparties={availableCounterparties}
          selectedSite={selectedSite}
          onSiteChange={setSelectedSite}
          sitesLoading={sitesLoading}
          availableSites={availableSites}
          includeFired={includeFired}
          onIncludeFiredChange={setIncludeFired}
          onOpenColumns={() => setIsColumnsModalOpen(true)}
        />

        <ApplicationRequestModalEmployeeTable
          availableEmployees={availableEmployees}
          allSelected={allSelected}
          selectedEmployees={selectedEmployees}
          onSelectAll={handleSelectAll}
          rowSelection={rowSelection}
          columns={columns}
          loading={tableLoading}
          pagination={pagination}
          onPaginationChange={(current, pageSize) =>
            setPagination({ current, pageSize })
          }
        />
      </Space>

      {/* Модальное окно для выбора столбцов */}
      <ExcelColumnsModal
        visible={isColumnsModalOpen}
        onCancel={() => setIsColumnsModalOpen(false)}
        columns={selectedColumns}
        onUpdate={updateColumns}
        toggleColumn={toggleColumn}
        moveColumnUp={moveColumnUp}
        moveColumnDown={moveColumnDown}
        selectAll={selectAll}
        deselectAll={deselectAll}
      />
    </Modal>
  );
};

export default ApplicationRequestModal;
