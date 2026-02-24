import { Row, Col, Form, Input, Select } from "antd";
import {
  formatBankAccountNumber,
  formatInn,
  formatRussianPassportNumber,
  formatSnils,
  noAutoFillProps,
} from "./employeeFormUtils";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";

const { Option } = Select;

const EmployeeDocumentsTab = ({
  getFieldProps,
  handleInnBlur,
  passportType,
  setPassportType,
  dateFormat,
}) => (
  <>
    <Row gutter={16}>
      {!getFieldProps("inn").hidden && (
        <Col xs={24} sm={8} md={8} lg={8}>
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
      {!getFieldProps("snils").hidden && (
        <Col xs={24} sm={8} md={8} lg={8}>
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
        <Col xs={24} sm={8} md={8} lg={8}>
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
    </Row>

    <Row gutter={16}>
      {!getFieldProps("passportType").hidden && (
        <Col xs={24} sm={8} md={8} lg={8}>
          <Form.Item
            name="passportType"
            label="Тип паспорта"
            required={getFieldProps("passportType").required}
            rules={getFieldProps("passportType").rules}
          >
            <Select
              placeholder="Выберите тип паспорта"
              allowClear
              autoComplete="off"
              onChange={(value) => setPassportType(value)}
            >
              <Option value="russian">Российский</Option>
              <Option value="foreign">Иностранного гражданина</Option>
            </Select>
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("passportNumber").hidden && (
        <Col xs={24} sm={8} md={8} lg={8}>
          <Form.Item
            name="passportNumber"
            label="№ паспорта"
            required={getFieldProps("passportNumber").required}
            rules={getFieldProps("passportNumber").rules}
            getValueFromEvent={(e) => {
              if (passportType === "russian") {
                return formatRussianPassportNumber(e.target.value);
              }
              return e.target.value;
            }}
          >
            <Input
              {...noAutoFillProps}
              placeholder={
                passportType === "russian" ? "1234 №123456" : "Номер паспорта"
              }
              maxLength={passportType === "russian" ? 13 : undefined}
            />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("passportDate").hidden && (
        <Col xs={24} sm={8} md={8} lg={8}>
          <Form.Item
            name="passportDate"
            label="Дата выдачи паспорта"
            required={getFieldProps("passportDate").required}
            rules={getFieldProps("passportDate").rules}
          >
            <MaskedDatePicker format={dateFormat} />
          </Form.Item>
        </Col>
      )}
    </Row>

    <Row gutter={16}>
      {passportType === "foreign" &&
        !getFieldProps("passportExpiryDate").hidden && (
          <Col xs={24} sm={12} md={12} lg={12}>
            <Form.Item
              name="passportExpiryDate"
              label="Дата окончания паспорта"
              required={getFieldProps("passportExpiryDate").required}
              rules={getFieldProps("passportExpiryDate").rules}
            >
              <MaskedDatePicker format={dateFormat} />
            </Form.Item>
          </Col>
        )}
      {!getFieldProps("passportIssuer").hidden && (
        <Col
          xs={24}
          sm={passportType === "foreign" ? 12 : 24}
          md={passportType === "foreign" ? 12 : 24}
          lg={passportType === "foreign" ? 12 : 24}
        >
          <Form.Item
            name="passportIssuer"
            label="Кем выдан паспорт"
            required={getFieldProps("passportIssuer").required}
            rules={getFieldProps("passportIssuer").rules}
          >
            <Input
              placeholder="ГУ МВД России, г.Москва, ул. Тверская, д.20"
              {...noAutoFillProps}
            />
          </Form.Item>
        </Col>
      )}
    </Row>
  </>
);

export default EmployeeDocumentsTab;
