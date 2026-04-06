import { memo } from "react";
import ApplicationRequestModal from "@/modules/employees/ui/ApplicationRequestModal";
import EmployeeFilesModal from "@/modules/employees/ui/EmployeeFilesModal";
import EmployeeImportModal from "@/modules/employees/ui/EmployeeImportModal";
import EmployeeSitesModal from "@/modules/employees/ui/EmployeeSitesModal";
import EmployeeViewDrawer from "@/modules/employees/ui/EmployeeViewDrawer";
import EmployeeViewModal from "@/modules/employees/ui/EmployeeViewModal";
import ExcelExportModal from "@/modules/employees/ui/ExcelExportModal";
import SecurityModal from "@/modules/employees/ui/SecurityModal";

const EmployeesModals = memo(({ isMobile, model, actions }) => (
  <>
    {!isMobile ? (
      <EmployeeViewModal
        visible={model.isViewModalOpen}
        employee={model.viewingEmployee}
        onCancel={() => actions.setIsViewModalOpen(false)}
        onEdit={() => {
          actions.setIsViewModalOpen(false);
          actions.setViewingEmployee(null);
          actions.onEditEmployee?.(model.viewingEmployee);
        }}
      />
    ) : null}

    {isMobile ? (
      <EmployeeViewDrawer
        visible={model.isViewModalOpen}
        employee={model.viewingEmployee}
        onClose={() => {
          actions.setIsViewModalOpen(false);
          actions.setViewingEmployee(null);
        }}
        onEdit={actions.onMobileViewEdit}
      />
    ) : null}

    <EmployeeFilesModal
      visible={model.isFilesModalOpen}
      employeeId={model.filesEmployee?.id}
      employeeName={
        model.filesEmployee
          ? `${model.filesEmployee.lastName} ${model.filesEmployee.firstName} ${model.filesEmployee.middleName || ""}`
          : ""
      }
      onClose={actions.onCloseFilesModal}
      onFilesUpdated={actions.onFilesUpdated}
    />

    <EmployeeSitesModal
      visible={model.isSitesModalOpen}
      employee={model.sitesEmployee}
      onCancel={actions.onCloseSitesModal}
      onSuccess={actions.onSitesUpdated}
    />

    <ApplicationRequestModal
      visible={model.isRequestModalOpen}
      onCancel={() => {
        actions.setIsRequestModalOpen(false);
        actions.refetchEmployees();
      }}
      userRole={model.userRole}
      userCounterpartyId={model.userCounterpartyId}
      defaultCounterpartyId={model.defaultCounterpartyId}
      userId={model.userId}
    />

    <ExcelExportModal
      visible={model.isExportModalOpen}
      queryParams={model.exportQueryParams || {}}
      onCancel={() => {
        actions.setIsExportModalOpen(false);
        actions.refetchEmployees();
      }}
      onSuccess={() => actions.refetchEmployees()}
    />

    <EmployeeImportModal
      visible={model.isImportModalOpen}
      onCancel={() => actions.setIsImportModalOpen(false)}
      onSuccess={() => actions.refetchEmployees()}
    />

    <SecurityModal
      visible={model.isSecurityModalOpen}
      onCancel={() => actions.setIsSecurityModalOpen(false)}
      onSuccess={() => actions.refetchEmployees()}
    />
  </>
));

EmployeesModals.displayName = "EmployeesModals";

export default EmployeesModals;
