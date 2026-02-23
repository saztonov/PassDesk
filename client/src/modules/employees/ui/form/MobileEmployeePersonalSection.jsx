import { Form, Input, Radio, Select, Typography } from "antd";
import dayjs from "dayjs";
import MaskedDateInput from "@/shared/ui/MaskedDateInput";

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const DATE_FORMAT = "DD.MM.YYYY";

const createBirthDateRules = (rules = []) => [
  ...rules,
  {
    pattern: /^\d{2}\.\d{2}\.\d{4}$/,
    message: "Дата должна быть в формате ДД.ММ.ГГГГ",
  },
  {
    validator: (_, value) => {
      if (!value) {
        return Promise.resolve();
      }

      try {
        const dateObj = dayjs(value, DATE_FORMAT, true);
        if (!dateObj.isValid()) {
          return Promise.reject(new Error("Некорректная дата"));
        }

        const age = dayjs().diff(dateObj, "year");
        if (age < 18) {
          return Promise.reject(
            new Error("Возраст сотрудника должен быть не менее 18 лет"),
          );
        }
        if (age > 80) {
          return Promise.reject(
            new Error("Возраст сотрудника должен быть не более 80 лет"),
          );
        }
      } catch {
        return Promise.reject(new Error("Некорректная дата"));
      }

      return Promise.resolve();
    },
  },
];

const normalizeDateInputValue = (value) => {
  if (!value) return value;
  if (typeof value === "string") return value;
  if (value && value.format) return value.format(DATE_FORMAT);
  return value;
};

export const buildMobileEmployeePersonalSection = ({
  getFieldProps,
  formatInn,
  handleInnBlur,
  noAutoFillProps,
  latinInputError,
  antiAutofillIds,
  handleFullNameChange,
  loadingReferences,
  positions,
  citizenships,
  handleCitizenshipChange,
  formatPhoneNumber,
}) => ({
  key: "personal",
  label: (
    <Title level={5} style={{ margin: 0 }}>
      📋 Личная информация
    </Title>
  ),
  children: (
    <>
      {!getFieldProps("inn").hidden && (
        <Form.Item
          label="ИНН"
          name="inn"
          required={getFieldProps("inn").required}
          rules={[
            ...getFieldProps("inn").rules,
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const digits = value.replace(/[^\d]/g, "");
                if (digits.length === 10 || digits.length === 12) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error("ИНН должен содержать 10 или 12 цифр"),
                );
              },
            },
          ]}
          getValueFromEvent={(e) => formatInn(e.target.value)}
        >
          <Input
            placeholder="1234-567890-12"
            size="large"
            onBlur={handleInnBlur}
            {...noAutoFillProps}
          />
        </Form.Item>
      )}

      {!getFieldProps("gender").hidden && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "16px",
            gap: "12px",
          }}
        >
          <label style={{ marginBottom: 0, minWidth: "70px", fontWeight: 500 }}>
            Пол{" "}
            {getFieldProps("gender").required && (
              <span style={{ color: "#ff4d4f" }}>*</span>
            )}
          </label>
          <Form.Item
            name="gender"
            rules={getFieldProps("gender").rules}
            style={{ marginBottom: 0 }}
          >
            <Radio.Group style={{ display: "flex", gap: "16px" }}>
              <Radio value="male">Муж</Radio>
              <Radio value="female">Жен</Radio>
            </Radio.Group>
          </Form.Item>
        </div>
      )}

      {!getFieldProps("lastName").hidden && (
        <Form.Item
          label="Фамилия"
          name="lastName"
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
            placeholder="Иванов"
            size="large"
            {...noAutoFillProps}
            onChange={(e) => handleFullNameChange("lastName", e.target.value)}
          />
        </Form.Item>
      )}

      {!getFieldProps("firstName").hidden && (
        <Form.Item
          label="Имя"
          name="firstName"
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
            placeholder="Иван"
            size="large"
            {...noAutoFillProps}
            onChange={(e) => handleFullNameChange("firstName", e.target.value)}
          />
        </Form.Item>
      )}

      {!getFieldProps("middleName").hidden && (
        <Form.Item
          label="Отчество"
          name="middleName"
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
            placeholder="Иванович"
            size="large"
            {...noAutoFillProps}
            onChange={(e) => handleFullNameChange("middleName", e.target.value)}
          />
        </Form.Item>
      )}

      {!getFieldProps("positionId").hidden && (
        <Form.Item
          label="Должность"
          name="positionId"
          required={getFieldProps("positionId").required}
          rules={getFieldProps("positionId").rules}
        >
          <Select
            placeholder="Выберите должность"
            size="large"
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
            virtual={false}
            listHeight={400}
            loading={loadingReferences}
            disabled={loadingReferences || positions.length === 0}
            autoComplete="off"
          >
            {positions.map((position) => (
              <Option key={position.id} value={position.id}>
                {position.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      )}

      {!getFieldProps("citizenshipId").hidden && (
        <Form.Item
          label="Гражданство"
          name="citizenshipId"
          required={getFieldProps("citizenshipId").required}
          rules={getFieldProps("citizenshipId").rules}
        >
          <Select
            placeholder="Выберите гражданство"
            size="large"
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
            virtual={false}
            onChange={handleCitizenshipChange}
            loading={loadingReferences}
            disabled={loadingReferences || citizenships.length === 0}
            autoComplete="off"
          >
            {citizenships.map((citizenship) => (
              <Option key={citizenship.id} value={citizenship.id}>
                {citizenship.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      )}

      {!getFieldProps("birthDate").hidden && (
        <Form.Item
          label="Дата рождения"
          name="birthDate"
          required={getFieldProps("birthDate").required}
          rules={createBirthDateRules(getFieldProps("birthDate").rules)}
          normalize={normalizeDateInputValue}
        >
          <MaskedDateInput format={DATE_FORMAT} size="large" />
        </Form.Item>
      )}

      {!getFieldProps("birthCountryId").hidden && (
        <Form.Item
          label="Страна рождения"
          name="birthCountryId"
          required={getFieldProps("birthCountryId").required}
          rules={getFieldProps("birthCountryId").rules}
        >
          <Select
            popupMatchSelectWidth
            placeholder="Выберите страну рождения"
            size="large"
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
            virtual={false}
            loading={loadingReferences}
            disabled={loadingReferences || citizenships.length === 0}
            autoComplete="off"
          >
            {citizenships.map((citizenship) => (
              <Option key={citizenship.id} value={citizenship.id}>
                {citizenship.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      )}

      {!getFieldProps("registrationAddress").hidden && (
        <Form.Item
          label="Адрес регистрации"
          name="registrationAddress"
          required={getFieldProps("registrationAddress").required}
          rules={getFieldProps("registrationAddress").rules}
        >
          <TextArea
            id={antiAutofillIds.registrationAddress}
            name={antiAutofillIds.registrationAddress}
            placeholder="г. Москва, ул. Ленина, д. 1"
            rows={3}
            size="large"
            {...noAutoFillProps}
          />
        </Form.Item>
      )}

      {!getFieldProps("phone").hidden && (
        <Form.Item
          label="Телефон"
          name="phone"
          required={getFieldProps("phone").required}
          rules={[
            ...getFieldProps("phone").rules,
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const digits = value.replace(/[^\d]/g, "");
                if (digits.length === 11) return Promise.resolve();
                return Promise.reject(
                  new Error("Телефон должен содержать 11 цифр"),
                );
              },
            },
          ]}
          getValueFromEvent={(e) => formatPhoneNumber(e.target.value)}
        >
          <Input
            id={antiAutofillIds.phone}
            name={antiAutofillIds.phone}
            placeholder="+7 (___) ___-__-__"
            size="large"
            {...noAutoFillProps}
          />
        </Form.Item>
      )}
    </>
  ),
});
