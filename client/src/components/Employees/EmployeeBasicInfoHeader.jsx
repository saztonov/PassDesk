import { Col, Row, Space } from "antd";
import EmployeeActionButtons from "./EmployeeActionButtons.jsx";

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

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={24}>
        <Space size="middle" wrap>
          <EmployeeActionButtons
            employee={employee}
            messageApi={messageApi}
            onCancel={onCancel}
            isDefaultCounterpartyUser={
              user?.counterpartyId === defaultCounterpartyId
            }
            userRole={user?.role}
            isAdmin={user?.role === "admin"}
            onTransfer={onTransfer}
          />
        </Space>
      </Col>
    </Row>
  );
};

export default EmployeeBasicInfoHeader;
