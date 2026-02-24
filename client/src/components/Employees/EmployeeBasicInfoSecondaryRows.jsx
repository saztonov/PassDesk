import { Col, Form, Input, Row, Select } from "antd";
import {
  formatPhoneNumber,
  noAutoFillProps,
} from "./employeeFormUtils";

const { TextArea } = Input;
const { Option } = Select;

const EmployeeBasicInfoSecondaryRows = ({
  getFieldProps,
  citizenships,
  antiAutofillIds,
  userRole,
}) => {
  const canEditNotes = userRole === "admin" || userRole === "manager";

  return (
    <>
      <Row gutter={16}>
        {!getFieldProps("birthCountryId").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="birthCountryId"
              label="Страна рождения"
              required={getFieldProps("birthCountryId").required}
              rules={getFieldProps("birthCountryId").rules}
              trigger="onChange"
            >
              <Select
                placeholder="Выберите страну рождения"
                allowClear
                showSearch
                optionFilterProp="children"
                virtual={false}
                autoComplete="off"
              >
                {citizenships.map((citizenship) => (
                  <Option key={citizenship.id} value={citizenship.id}>
                    {citizenship.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        )}

        {!getFieldProps("registrationAddress").hidden && (
          <Col xs={24} sm={24} md={12} lg={12}>
            <Form.Item
              name="registrationAddress"
              label="Адрес регистрации"
              required={getFieldProps("registrationAddress").required}
              rules={getFieldProps("registrationAddress").rules}
            >
              <Input
                id={antiAutofillIds.registrationAddress}
                name={antiAutofillIds.registrationAddress}
                placeholder="г. Москва, ул. Тверская, д.21, кв.11"
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}

        {!getFieldProps("phone").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
            <Form.Item
              name="phone"
              label="Телефон"
              required={getFieldProps("phone").required}
              rules={[
                ...getFieldProps("phone").rules,
                {
                  pattern: /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/,
                  message: "Телефон должен быть в формате +7 (999) 123-45-67",
                },
              ]}
              normalize={(value) => formatPhoneNumber(value)}
            >
              <Input
                id={antiAutofillIds.phone}
                name={antiAutofillIds.phone}
                placeholder="+7 (999) 123-45-67"
                maxLength={18}
                {...noAutoFillProps}
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      {canEditNotes && !getFieldProps("notes").hidden && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="notes"
              label="Примечания"
              required={getFieldProps("notes").required}
              rules={getFieldProps("notes").rules}
            >
              <TextArea rows={2} {...noAutoFillProps} />
            </Form.Item>
          </Col>
        </Row>
      )}
    </>
  );
};

export default EmployeeBasicInfoSecondaryRows;
