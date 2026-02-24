import { Col, Form, Input, Row, Select } from "antd";
import {
  formatInn,
  formatPhoneNumber,
  noAutoFillProps,
} from "./employeeFormUtils";

const { TextArea } = Input;
const { Option } = Select;

const EmployeeBasicInfoSecondaryRows = ({
  getFieldProps,
  citizenships,
  antiAutofillIds,
  handleInnBlur,
}) => (
  <>
    <Row gutter={16}>
      {!getFieldProps("birthCountryId").hidden && (
        <Col xs={24} sm={12} md={8} lg={8}>
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
        <Col xs={24} sm={12} md={16} lg={16}>
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
    </Row>

    <Row gutter={16}>
      {!getFieldProps("phone").hidden && (
        <Col xs={24} sm={12} md={12} lg={12}>
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
      {!getFieldProps("inn").hidden && (
        <Col xs={24} sm={12} md={12} lg={12}>
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
      )}
    </Row>

    {!getFieldProps("notes").hidden && (
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

export default EmployeeBasicInfoSecondaryRows;
