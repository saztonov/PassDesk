import { Col, Row } from "antd";
import EmployeeActionButtons from "./EmployeeActionButtons.jsx";
import { canManageEmployeeStatuses } from "@/shared/lib/accessControl";

const EmployeeBasicInfoHeader = ({
  employee,
  messageApi,
  onCancel,
  user,
  defaultCounterpartyId,
  onTransfer,
}) => {
  if (!employee?.id) {
    return null;
  }

  const isDefaultCounterpartyUser =
    user?.counterpartyId === defaultCounterpartyId;
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const canManageStatuses = canManageEmployeeStatuses(user?.role);
  const canTransfer =
    isDefaultCounterpartyUser && (isAdmin || isManager || employee.isContractor);

  if (!canManageStatuses && !canTransfer) {
    return null;
  }

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={24}>
        <EmployeeActionButtons
          employee={employee}
          messageApi={messageApi}
          onCancel={onCancel}
          isDefaultCounterpartyUser={isDefaultCounterpartyUser}
          userRole={user?.role}
          isAdmin={isAdmin}
          onTransfer={onTransfer}
        />
      </Col>
    </Row>
  );
};

export default EmployeeBasicInfoHeader;
