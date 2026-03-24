import dayjs from "dayjs";
import { Col, Form, Input, Row, Select } from "antd";
import {
  formatPhoneNumber,
  formatRussianPassportNumber,
  noAutoFillProps,
} from "./employeeFormUtils";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";
import BirthPlaceModal from "./BirthPlaceModal";

const { Option } = Select;

const shouldShowBirthPlaceField = (getFieldProps) =>
  ["birthCountryId", "birthRegion", "birthCity"].some(
    (fieldName) => !getFieldProps(fieldName).hidden,
  );

const EmployeeBasicInfoPrimaryRows = ({
  form,
  getFieldProps,
  positions,
  citizenships,
  handleCitizenshipChange,
  antiAutofillIds,
  latinInputError,
  handleFullNameChange,
  dateFormat,
  passportType,
  setPassportType,
}) => (
  <>
    <Row gutter={16}>
      {!getFieldProps("lastName").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="lastName"
            label="Фамилия"
            required={getFieldProps("lastName").required}
            rules={getFieldProps("lastName").rules}
            validateStatus={latinInputError === "lastName" ? "error" : ""}
            help={
              latinInputError === "lastName" ? "Ввод только на кириллице" : ""
            }
          >
            <Input
              id={antiAutofillIds.lastName}
              name={antiAutofillIds.lastName}
              {...noAutoFillProps}
              onChange={(event) =>
                handleFullNameChange("lastName", event.target.value)
              }
            />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("firstName").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="firstName"
            label="Имя"
            required={getFieldProps("firstName").required}
            rules={getFieldProps("firstName").rules}
            validateStatus={latinInputError === "firstName" ? "error" : ""}
            help={
              latinInputError === "firstName" ? "Ввод только на кириллице" : ""
            }
          >
            <Input
              id={antiAutofillIds.firstName}
              name={antiAutofillIds.firstName}
              {...noAutoFillProps}
              onChange={(event) =>
                handleFullNameChange("firstName", event.target.value)
              }
            />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("middleName").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="middleName"
            label="Отчество"
            required={getFieldProps("middleName").required}
            rules={getFieldProps("middleName").rules}
            validateStatus={latinInputError === "middleName" ? "error" : ""}
            help={
              latinInputError === "middleName" ? "Ввод только на кириллице" : ""
            }
          >
            <Input
              id={antiAutofillIds.middleName}
              name={antiAutofillIds.middleName}
              {...noAutoFillProps}
              onChange={(event) =>
                handleFullNameChange("middleName", event.target.value)
              }
            />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("positionId").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="positionId"
            label="Должность"
            required={getFieldProps("positionId").required}
            rules={getFieldProps("positionId").rules}
          >
            <Select
              placeholder="Выберите должность"
              allowClear
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
              virtual={false}
              listHeight={400}
              popupMatchSelectWidth={false}
              classNames={{ popup: { root: "dropdown-wide" } }}
              autoComplete="off"
            >
              {positions.map((position) => (
                <Option key={position.id} value={position.id}>
                  {position.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      )}
    </Row>

    <Row gutter={16}>
      {!getFieldProps("citizenshipId").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="citizenshipId"
            label="Гражданство"
            required={getFieldProps("citizenshipId").required}
            rules={getFieldProps("citizenshipId").rules}
          >
            <Select
              placeholder="Выберите гражданство"
              allowClear
              showSearch
              optionFilterProp="children"
              virtual={false}
              onChange={handleCitizenshipChange}
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
      {!getFieldProps("birthDate").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
          <Form.Item
            name="birthDate"
            label="Дата рождения"
            required={getFieldProps("birthDate").required}
            rules={[
              ...getFieldProps("birthDate").rules,
              {
                validator: (_, value) => {
                  if (!value) {
                    return Promise.resolve();
                  }

                  const age = dayjs().diff(value, "year");
                  if (age < 16) {
                    return Promise.reject(
                      new Error(
                        "Возраст сотрудника должен быть не менее 16 лет",
                      ),
                    );
                  }
                  if (age > 80) {
                    return Promise.reject(
                      new Error(
                        "Возраст сотрудника должен быть не менее 80 лет",
                      ),
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <MaskedDatePicker format={dateFormat} />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("phone").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
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
      {!getFieldProps("registrationAddress").hidden && (
        <Col xs={24} sm={24} md={24} xxl={24}>
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
      {shouldShowBirthPlaceField(getFieldProps) && (
        <Col xs={24} sm={24} md={24} xxl={12}>
          <Form.Item label="Место рождения">
            <BirthPlaceModal form={form} citizenships={citizenships} />
          </Form.Item>
        </Col>
      )}
      {!getFieldProps("passportType").hidden && (
        <Col xs={24} sm={12} md={12} xxl={6}>
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
        <Col xs={24} sm={12} md={12} xxl={6}>
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
        <Col xs={24} sm={12} md={12} xxl={6}>
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
      {passportType === "foreign" &&
        !getFieldProps("passportExpiryDate").hidden && (
          <Col xs={24} sm={12} md={12} xxl={6}>
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
        <Col xs={24} sm={24} md={24} xxl={12}>
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

export default EmployeeBasicInfoPrimaryRows;
