import dayjs from "dayjs";
import { Col, Form, Input, Row, Select } from "antd";
import { noAutoFillProps } from "./employeeFormUtils";
import MaskedDatePicker from "../../shared/ui/MaskedDatePicker";

const { Option } = Select;

const EmployeeBasicInfoPrimaryRows = ({
  getFieldProps,
  positions,
  citizenships,
  handleCitizenshipChange,
  antiAutofillIds,
  latinInputError,
  handleFullNameChange,
  dateFormat,
}) => (
  <>
    <Row gutter={16}>
      {!getFieldProps("lastName").hidden && (
        <Col xs={24} sm={12} md={6} lg={6}>
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
        <Col xs={24} sm={12} md={6} lg={6}>
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
        <Col xs={24} sm={12} md={6} lg={6}>
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
        <Col xs={24} sm={12} md={6} lg={6}>
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
        <Col xs={24} sm={12} md={6} lg={6}>
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
        <Col xs={24} sm={12} md={6} lg={6}>
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
    </Row>
  </>
);

export default EmployeeBasicInfoPrimaryRows;
