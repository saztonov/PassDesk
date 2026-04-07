import dayjs from "dayjs";
import { Col, Form, Input, Row, Select } from "antd";
import {
  formatPhoneNumber,
  formatPassportDepartmentCode,
  formatRussianPassportNumber,
  noAutoFillProps,
} from "./employeeFormUtils";
import {
  capitalizeFirstLetter,
  filterCyrillicOnly,
} from "../../utils/formatters";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";
import BirthPlaceModal from "./BirthPlaceModal";

const { Option } = Select;

const shouldShowBirthPlaceField = (getFieldProps) =>
  ["birthCountryId", "birthRegion", "birthCity"].some(
    (fieldName) => !getFieldProps(fieldName).hidden,
  );

const getQuarterColProps = (compactLayout) =>
  compactLayout
    ? { xs: 24, sm: 12, md: 12, lg: 12, xl: 12, xxl: 12 }
    : { xs: 24, sm: 12, md: 12, xxl: 6 };

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
  compactLayout = false,
}) => {
  const lastNameProps = getFieldProps("lastName");
  const firstNameProps = getFieldProps("firstName");
  const middleNameProps = getFieldProps("middleName");
  const positionProps = getFieldProps("positionId");

  return (
    <>
      <Row gutter={16}>
        {!lastNameProps.hidden && (
          <Col {...getQuarterColProps(compactLayout)}>
            <Form.Item
              label="Фамилия"
              name="lastName"
              required={lastNameProps.required}
              rules={lastNameProps.rules}
              validateStatus={latinInputError === "lastName" ? "error" : ""}
              help={
                latinInputError === "lastName" ? "Ввод только на кириллице" : ""
              }
            >
              <Input
                id={antiAutofillIds.lastName}
                name={antiAutofillIds.lastName}
                {...noAutoFillProps}
                onChange={(e) =>
                  handleFullNameChange(
                    "lastName",
                    capitalizeFirstLetter(filterCyrillicOnly(e.target.value)),
                  )
                }
              />
            </Form.Item>
          </Col>
        )}

        {!firstNameProps.hidden && (
          <Col {...getQuarterColProps(compactLayout)}>
            <Form.Item
              label="Имя"
              name="firstName"
              required={firstNameProps.required}
              rules={firstNameProps.rules}
              validateStatus={latinInputError === "firstName" ? "error" : ""}
              help={
                latinInputError === "firstName"
                  ? "Ввод только на кириллице"
                  : ""
              }
            >
              <Input
                id={antiAutofillIds.firstName}
                name={antiAutofillIds.firstName}
                {...noAutoFillProps}
                onChange={(e) =>
                  handleFullNameChange(
                    "firstName",
                    capitalizeFirstLetter(filterCyrillicOnly(e.target.value)),
                  )
                }
              />
            </Form.Item>
          </Col>
        )}

        {!middleNameProps.hidden && (
          <Col {...getQuarterColProps(compactLayout)}>
            <Form.Item
              label="Отчество"
              name="middleName"
              required={middleNameProps.required}
              rules={middleNameProps.rules}
              validateStatus={latinInputError === "middleName" ? "error" : ""}
              help={
                latinInputError === "middleName"
                  ? "Ввод только на кириллице"
                  : ""
              }
            >
              <Input
                id={antiAutofillIds.middleName}
                name={antiAutofillIds.middleName}
                {...noAutoFillProps}
                onChange={(e) =>
                  handleFullNameChange(
                    "middleName",
                    capitalizeFirstLetter(filterCyrillicOnly(e.target.value)),
                  )
                }
              />
            </Form.Item>
          </Col>
        )}
        {!positionProps.hidden && (
          <Col {...getQuarterColProps(compactLayout)}>
            <Form.Item
              name="positionId"
              label="Должность"
              required={positionProps.required}
              rules={positionProps.rules}
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
          <Col {...getQuarterColProps(compactLayout)}>
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
          <Col {...getQuarterColProps(compactLayout)}>
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
          <Col {...getQuarterColProps(compactLayout)}>
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
          <Col {...getQuarterColProps(compactLayout)}>
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
          <Col {...getQuarterColProps(compactLayout)}>
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
          <Col {...getQuarterColProps(compactLayout)}>
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
            <Col {...getQuarterColProps(compactLayout)}>
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
        {passportType === "russian" &&
          !getFieldProps("passportDepartmentCode").hidden && (
            <Col {...getQuarterColProps(compactLayout)}>
              <Form.Item
                name="passportDepartmentCode"
                label="Код подразделения"
                required={getFieldProps("passportDepartmentCode").required}
                rules={getFieldProps("passportDepartmentCode").rules}
                getValueFromEvent={(e) =>
                  formatPassportDepartmentCode(e.target.value)
                }
              >
                <Input
                  placeholder="111-222"
                  maxLength={7}
                  {...noAutoFillProps}
                />
              </Form.Item>
            </Col>
          )}
        {!getFieldProps("plannedExitDate").hidden && (
          <Col {...getQuarterColProps(compactLayout)}>
            <Form.Item
              name="plannedExitDate"
              label="Планируемая дата выхода"
              required={getFieldProps("plannedExitDate").required}
              rules={getFieldProps("plannedExitDate").rules}
            >
              <MaskedDatePicker format={dateFormat} />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );
};

export default EmployeeBasicInfoPrimaryRows;
