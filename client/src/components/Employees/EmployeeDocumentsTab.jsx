import { Divider, Row, Col, Form, Input } from "antd";
import EmployeePatentTab from "./EmployeePatentTab";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";
import {
  formatBankAccountNumber,
  formatInn,
  formatSnils,
  noAutoFillProps,
} from "./employeeFormUtils";

const EmployeeDocumentsTab = ({
  getFieldProps,
  handleInnBlur,
  requiresPatent,
  checkingCitizenship,
  dateFormat,
}) => {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6} lg={6}>
          <Form.Item
            name="inn"
            label="ИНН"
            required={getFieldProps("inn").required}
            rules={[
              ...getFieldProps("inn").rules,
              {
                pattern: /^\d{4}-\d{5}-\d{1}$|^\d{4}-\d{6}-\d{2}$/,
                message:
                  "ИНН должен быть в формате XXXX-XXXXX-X или XXXX-XXXXXX-XX",
              },
            ]}
            normalize={(value) => formatInn(value)}
          >
            <Input
              maxLength={14}
              placeholder="XXXX-XXXXX-X"
              onBlur={handleInnBlur}
              {...noAutoFillProps}
            />
          </Form.Item>
        </Col>

        {!getFieldProps("snils").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="snils"
              label="СНИЛС"
              required={getFieldProps("snils").required}
              rules={[
                ...getFieldProps("snils").rules,
                {
                  pattern: /^\d{3}-\d{3}-\d{3}\s\d{2}$/,
                  message: "СНИЛС должен быть в формате XXX-XXX-XXX XX",
                },
              ]}
              normalize={(value) => formatSnils(value)}
            >
              <Input
                maxLength={14}
                placeholder="123-456-789 00"
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}

        {!getFieldProps("bankAccountNumber").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="bankAccountNumber"
              label="Номер банковского счета"
              required={getFieldProps("bankAccountNumber").required}
              rules={[
                ...getFieldProps("bankAccountNumber").rules,
                {
                  pattern: /^\d{20}$/,
                  message: "Номер банковского счета должен содержать 20 цифр",
                },
              ]}
              normalize={(value) => formatBankAccountNumber(value)}
            >
              <Input
                maxLength={20}
                placeholder="40702810900000000000"
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}

        {!getFieldProps("insurancePolicyNumber").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="insurancePolicyNumber"
              label="Номер страхового полиса"
              required={getFieldProps("insurancePolicyNumber").required}
              rules={getFieldProps("insurancePolicyNumber").rules}
            >
              <Input
                maxLength={64}
                placeholder="25285324 065197"
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}

        {!getFieldProps("insurancePolicyDate").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="insurancePolicyDate"
              label="Дата выдачи полиса"
              required={getFieldProps("insurancePolicyDate").required}
              rules={getFieldProps("insurancePolicyDate").rules}
            >
              <MaskedDatePicker format={dateFormat} />
            </Form.Item>
          </Col>
        )}
      </Row>

      {(requiresPatent || checkingCitizenship) && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          {checkingCitizenship ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "#999",
              }}
            >
              Проверка необходимости патента...
            </div>
          ) : (
            <EmployeePatentTab
              getFieldProps={getFieldProps}
              dateFormat={dateFormat}
            />
          )}
        </>
      )}
    </>
  );
};

export default EmployeeDocumentsTab;
