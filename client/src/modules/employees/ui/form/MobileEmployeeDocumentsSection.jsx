import { Form, Input, Select, Typography } from "antd";
import EmployeeDocumentUpload from "@/components/Employees/EmployeeDocumentUpload";
import { profileDocumentTypeLabels } from "@/modules/employees/lib/documentTypeProfiles";
import {
  createDateInputRules,
  formatDateInputValue,
  getUploadsForDocumentProfile,
  splitUploadsByConsent,
} from "./MobileEmployeeDocumentSectionUtils";
import MobileEmployeeUploadsSection from "./MobileEmployeeUploadsSection";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const INLINE_UPLOAD_TYPES = new Set([
  "passport",
  "passport_translation",
  "snils_card",
]);

export const buildMobileEmployeeDocumentsSection = ({
  getFieldProps,
  formatInn,
  handleInnBlur,
  formatSnils,
  formatBankAccountNumber,
  passportType,
  setPassportType,
  formatRussianPassportNumber,
  noAutoFillProps,
  employee,
  ensureEmployeeId,
  profileCode,
  profilesConfig,
}) => {
  const uploads = getUploadsForDocumentProfile(profileCode, profilesConfig);
  const { documentUploads, consentUploads } = splitUploadsByConsent(uploads);
  const uploadsByType = new Map(
    uploads.map((upload) => [upload.documentType, upload]),
  );
  const getInlineUploadMeta = (documentType) =>
    uploadsByType.get(documentType) || {
      documentType,
      label: profileDocumentTypeLabels[documentType] || documentType,
      multiple: true,
    };
  const remainingDocumentUploads = documentUploads.filter(
    (upload) => !INLINE_UPLOAD_TYPES.has(upload.documentType),
  );

  return {
    key: "documents",
    label: (
      <Title level={5} style={{ margin: 0 }}>
        📄 Документы
      </Title>
    ),
    children: (
      <>
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
            maxLength={14}
            onBlur={handleInnBlur}
            {...noAutoFillProps}
          />
        </Form.Item>

        {!getFieldProps("snils").hidden && (
          <>
            <Form.Item
              label="СНИЛС"
              name="snils"
              required={getFieldProps("snils").required}
              rules={[
                ...getFieldProps("snils").rules,
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve();
                    const digits = value.replace(/[^\d]/g, "");
                    if (digits.length === 11) return Promise.resolve();
                    return Promise.reject(
                      new Error("СНИЛС должен содержать 11 цифр"),
                    );
                  },
                },
              ]}
              getValueFromEvent={(e) => formatSnils(e.target.value)}
            >
              <Input
                placeholder="123-456-789 00"
                size="large"
                {...noAutoFillProps}
              />
            </Form.Item>
            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="snils_card"
              label={getInlineUploadMeta("snils_card").label}
              readonly={false}
              multiple={getInlineUploadMeta("snils_card").multiple}
            />
          </>
        )}

      {!getFieldProps("bankAccountNumber").hidden && (
        <Form.Item
          label="Номер банковского счета"
          name="bankAccountNumber"
          required={getFieldProps("bankAccountNumber").required}
          rules={[
            ...getFieldProps("bankAccountNumber").rules,
            {
              pattern: /^\d{20}$/,
              message: "Номер банковского счета должен содержать 20 цифр",
            },
          ]}
          getValueFromEvent={(e) => formatBankAccountNumber(e.target.value)}
        >
          <Input
            placeholder="40702810900000000000"
            size="large"
            maxLength={20}
            {...noAutoFillProps}
          />
        </Form.Item>
      )}

      {!getFieldProps("passportType").hidden && (
        <Form.Item
          label="Тип паспорта"
          name="passportType"
          required={getFieldProps("passportType").required}
          rules={getFieldProps("passportType").rules}
        >
          <Select
            placeholder="Выберите тип паспорта"
            size="large"
            onChange={(value) => setPassportType(value)}
            autoComplete="off"
          >
            <Option value="russian">Российский</Option>
            <Option value="foreign">Иностранного гражданина</Option>
          </Select>
        </Form.Item>
      )}

        {!getFieldProps("passportNumber").hidden && (
          <>
            <Form.Item
              label="Паспорт (серия и номер)"
              name="passportNumber"
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
                placeholder={
                  passportType === "russian" ? "1234 №123456" : "Номер паспорта"
                }
                size="large"
                maxLength={passportType === "russian" ? 13 : undefined}
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
          label="Дата выдачи паспорта"
          name="passportDate"
          required={getFieldProps("passportDate").required}
          rules={createDateInputRules(getFieldProps("passportDate").rules)}
          normalize={formatDateInputValue}
        >
          <Input placeholder="ДД.ММ.ГГГГ" size="large" {...noAutoFillProps} />
        </Form.Item>
      )}

      {passportType === "foreign" &&
        !getFieldProps("passportExpiryDate").hidden && (
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
          label="Кем выдан паспорт"
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

        {remainingDocumentUploads.length > 0 && (
          <>
            <div style={{ marginTop: 8, marginBottom: 12 }}>
              <Text strong>Фото и файлы документов</Text>
            </div>
            <MobileEmployeeUploadsSection
              uploads={remainingDocumentUploads}
              employee={employee}
              ensureEmployeeId={ensureEmployeeId}
            />
          </>
        )}

        {consentUploads.length > 0 && (
          <>
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <Text strong>Согласия</Text>
            </div>
            <MobileEmployeeUploadsSection
              uploads={consentUploads}
              employee={employee}
              ensureEmployeeId={ensureEmployeeId}
            />
          </>
        )}
      </>
    ),
  };
};
