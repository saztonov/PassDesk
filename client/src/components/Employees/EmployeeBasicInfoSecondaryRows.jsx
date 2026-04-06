import { Col, Form, Input, Row } from "antd";
import { noAutoFillProps } from "./employeeFormUtils";

const { TextArea } = Input;

const EmployeeBasicInfoSecondaryRows = ({ getFieldProps, userRole }) => {
  const canEditNotes = userRole === "admin" || userRole === "manager";
  const showNotes = canEditNotes && !getFieldProps("notes").hidden;

  if (!showNotes) {
    return null;
  }

  return (
    <>
      <Row gutter={16}>
        {showNotes && (
          <Col xs={24} sm={24} md={24} lg={24}>
            <Form.Item
              name="notes"
              label="Примечания"
              required={getFieldProps("notes").required}
              rules={getFieldProps("notes").rules}
            >
              <TextArea rows={2} {...noAutoFillProps} />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );
};

export default EmployeeBasicInfoSecondaryRows;
