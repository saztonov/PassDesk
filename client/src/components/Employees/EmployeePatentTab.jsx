import { Row, Col, Form, Input } from "antd";
import {
  formatBlankNumber,
  formatKig,
  formatPatentNumber,
  noAutoFillProps,
} from "./employeeFormUtils";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";

const EmployeePatentTab = ({
  getFieldProps,
  dateFormat,
}) => {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={6} md={6} lg={6}>
          <Form.Item
            name="kig"
            label="КИГ"
            required={getFieldProps("kig").required}
            rules={[
              ...getFieldProps("kig").rules,
              {
                pattern: /^[A-Z]{2}\d{7}$/,
                message:
                  "КИГ должен быть в формате AF1234567 (2 латинские буквы и 7 цифр)",
              },
            ]}
            normalize={(value) => formatKig(value)}
          >
            <Input placeholder="AF1234567" maxLength={9} {...noAutoFillProps} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={6} md={6} lg={6}>
          <Form.Item
            name="kigEndDate"
            label="Срок окончания КИГ"
            required={getFieldProps("kigEndDate").required}
            rules={getFieldProps("kigEndDate").rules}
          >
            <MaskedDatePicker format={dateFormat} />
          </Form.Item>
        </Col>
        {!getFieldProps("patentNumber").hidden && (
          <Col xs={24} sm={6} md={6} lg={6}>
            <Form.Item
              name="patentNumber"
              label="Номер патента"
              required={getFieldProps("patentNumber").required}
              rules={[
                ...getFieldProps("patentNumber").rules,
                {
                  pattern: /^\d{2}\s№\d{10}$/,
                  message:
                    "Номер патента должен быть в формате XX №1234567890 (где XX - код от 01 до 99)",
                },
              ]}
              normalize={(value) => formatPatentNumber(value)}
            >
              <Input
                placeholder="01 №1234567890 (код 01-99)"
                maxLength={15}
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}
        {!getFieldProps("patentIssueDate").hidden && (
          <Col xs={24} sm={6} md={6} lg={6}>
            <Form.Item
              name="patentIssueDate"
              label="Дата выдачи патента"
              required={getFieldProps("patentIssueDate").required}
              rules={getFieldProps("patentIssueDate").rules}
            >
              <MaskedDatePicker format={dateFormat} />
            </Form.Item>
          </Col>
        )}
        {!getFieldProps("blankNumber").hidden && (
          <Col xs={24} sm={6} md={6} lg={6}>
            <Form.Item
              name="blankNumber"
              label="Номер бланка"
              required={getFieldProps("blankNumber").required}
              rules={[
                ...getFieldProps("blankNumber").rules,
                {
                  pattern: /^[А-ЯЁ]{2}\d{7}$/,
                  message:
                    "Номер бланка должен быть в формате ПР1234567 (кириллица)",
                },
              ]}
              normalize={(value) => formatBlankNumber(value)}
            >
              <Input
                placeholder="ПР1234567 (буквы - кириллица)"
                maxLength={9}
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );
};

export default EmployeePatentTab;
