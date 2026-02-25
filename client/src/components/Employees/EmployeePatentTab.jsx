import { Row, Col, Form, Input } from "antd";
import EmployeeDocumentUpload from "./EmployeeDocumentUpload";
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
  employee,
  ensureEmployeeId,
  getUploadMeta,
}) => {
  return (
    <>
      <Row gutter={16}>
        {!getFieldProps("kig").hidden && (
          <Col xs={24} sm={6} md={6} lg={6}>
            <Form.Item
              name="kig"
              label="КИГ"
              required={getFieldProps("kig").required}
              rules={[
                ...getFieldProps("kig").rules,
                {
                  pattern: /^\d{7}$/,
                  message: "КИГ должен содержать 7 цифр",
                },
              ]}
              normalize={(value) => formatKig(value)}
            >
              <Input placeholder="1234567" maxLength={7} {...noAutoFillProps} />
            </Form.Item>
          </Col>
        )}
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

      <Row gutter={16}>
        <Col xs={24} sm={8} md={8} lg={8}>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType="patent_front"
            label={getUploadMeta("patent_front").label}
            readonly={false}
            multiple={getUploadMeta("patent_front").multiple}
          />
        </Col>
        <Col xs={24} sm={8} md={8} lg={8}>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType="patent_back"
            label={getUploadMeta("patent_back").label}
            readonly={false}
            multiple={getUploadMeta("patent_back").multiple}
          />
        </Col>
        <Col xs={24} sm={8} md={8} lg={8}>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType="patent_payment_receipt"
            label={getUploadMeta("patent_payment_receipt").label}
            readonly={false}
            multiple={getUploadMeta("patent_payment_receipt").multiple}
          />
        </Col>
      </Row>
    </>
  );
};

export default EmployeePatentTab;
