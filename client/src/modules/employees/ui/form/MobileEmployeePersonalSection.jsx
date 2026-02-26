import { Form, Input, Radio, Select, Typography } from "antd";
import dayjs from "dayjs";
import MaskedDateInput from "@/shared/ui/MaskedDateInput";
import EmployeeDocumentUpload from "@/components/Employees/EmployeeDocumentUpload";
import { profileDocumentTypeLabels } from "@/modules/employees/lib/documentTypeProfiles";
import {
  createDateInputRules,
  formatDateInputValue,
  getUploadsForDocumentProfile,
} from "./MobileEmployeeDocumentSectionUtils";

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

const renderRequiredLabel = (label, showRequiredMark) =>
  showRequiredMark ? (
    <>
      {label}
      <span style={{ color: "#ff4d4f", marginLeft: 4 }}>*</span>
    </>
  ) : (
    label
  );

export const buildMobileEmployeePersonalSection = ({
  getFieldProps,
  handleLastNameBlur,
  noAutoFillProps,
  latinInputError,
  antiAutofillIds,
  handleFullNameChange,
  loadingReferences,
  citizenships,
  handleCitizenshipChange,
  formatPhoneNumber,
  employee,
  ensureEmployeeId,
  profileCode,
  profilesConfig,
}) => {
  const uploads = getUploadsForDocumentProfile(profileCode, profilesConfig);
  const uploadsByType = new Map(
    uploads.map((upload) => [upload.documentType, upload]),
  );
  const getInlineUploadMeta = (documentType) =>
    uploadsByType.get(documentType) || {
      documentType,
      label: profileDocumentTypeLabels[documentType] || documentType,
      multiple: true,
    };

  return {
  key: "personal",
  label: (
    <Title level={5} style={{ margin: 0 }}>
      📋 Личная информация
    </Title>
  ),
  children: (
    <>
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
            Пол
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
          label={renderRequiredLabel(
            "Фамилия",
            getFieldProps("lastName").required,
          )}
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
            onBlur={handleLastNameBlur}
          />
        </Form.Item>
      )}

      {!getFieldProps("firstName").hidden && (
        <Form.Item
          label={renderRequiredLabel("Имя", getFieldProps("firstName").required)}
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

      {!getFieldProps("citizenshipId").hidden && (
        <Form.Item
          label={renderRequiredLabel(
            "Гражданство",
            getFieldProps("citizenshipId").required,
          )}
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
          label={renderRequiredLabel(
            "Дата рождения",
            getFieldProps("birthDate").required,
          )}
          name="birthDate"
          required={getFieldProps("birthDate").required}
          rules={createBirthDateRules(getFieldProps("birthDate").rules)}
          normalize={normalizeDateInputValue}
        >
          <MaskedDateInput format={DATE_FORMAT} size="large" />
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

      {!getFieldProps("passportNumber").hidden && (
        <>
          <Form.Item
            label={renderRequiredLabel(
              "Паспорт (серия и номер)",
              getFieldProps("passportNumber").required,
            )}
            name="passportNumber"
            required={getFieldProps("passportNumber").required}
            rules={getFieldProps("passportNumber").rules}
          >
            <Input
              placeholder="Номер паспорта"
              size="large"
              {...noAutoFillProps}
            />
          </Form.Item>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType="passport"
            label={getInlineUploadMeta("passport").label}
            readonly={false}
            multiple={getInlineUploadMeta("passport").multiple}
          />
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType="passport_translation"
            label={getInlineUploadMeta("passport_translation").label}
            readonly={false}
            multiple={getInlineUploadMeta("passport_translation").multiple}
          />
        </>
      )}

      {!getFieldProps("passportDate").hidden && (
        <Form.Item
          label={renderRequiredLabel(
            "Дата выдачи паспорта",
            getFieldProps("passportDate").required,
          )}
          name="passportDate"
          required={getFieldProps("passportDate").required}
          rules={createDateInputRules(getFieldProps("passportDate").rules)}
          normalize={formatDateInputValue}
        >
          <Input placeholder="ДД.ММ.ГГГГ" size="large" {...noAutoFillProps} />
        </Form.Item>
      )}

      {!getFieldProps("passportExpiryDate").hidden && (
        <Form.Item
          label="Дата окончания паспорта"
          name="passportExpiryDate"
          required={getFieldProps("passportExpiryDate").required}
          rules={getFieldProps("passportExpiryDate").rules}
        >
          <Input placeholder="ДД.ММ.ГГГГ" size="large" {...noAutoFillProps} />
        </Form.Item>
      )}

      {!getFieldProps("passportIssuer").hidden && (
        <Form.Item
          label={renderRequiredLabel(
            "Кем выдан паспорт",
            getFieldProps("passportIssuer").required,
          )}
          name="passportIssuer"
          required={getFieldProps("passportIssuer").required}
          rules={getFieldProps("passportIssuer").rules}
        >
          <TextArea
            placeholder="Наименование органа выдачи"
            rows={3}
            size="large"
            {...noAutoFillProps}
          />
        </Form.Item>
      )}
    </>
  ),
  };
};
