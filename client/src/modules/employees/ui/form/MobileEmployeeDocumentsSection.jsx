import { Form, Input, Typography } from "antd";
import EmployeeDocumentUpload from "@/components/Employees/EmployeeDocumentUpload";
import { profileDocumentTypeLabels } from "@/modules/employees/lib/documentTypeProfiles";
import {
  getUploadsForDocumentProfile,
  splitUploadsByConsent,
} from "./MobileEmployeeDocumentSectionUtils";
import MobileEmployeeUploadsSection from "./MobileEmployeeUploadsSection";

const { Title, Text } = Typography;
const INLINE_UPLOAD_TYPES = new Set([
  "passport",
  "passport_translation",
  "snils_card",
  "bank_details",
  "patent_front",
  "patent_back",
  "patent_payment_receipt",
  "inn_document",
  "inn",
]);

export const buildMobileEmployeeDocumentsSection = ({
  getFieldProps,
  formatInn,
  handleInnBlur,
  formatSnils,
  formatBankAccountNumber,
  noAutoFillProps,
  employee,
  ensureEmployeeId,
  profileCode,
  profilesConfig,
  patentFields,
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
  const hasUploadType = (documentType) => uploadsByType.has(documentType);
  const additionalDocumentUploads = documentUploads.filter(
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

        {(hasUploadType("inn_document") || hasUploadType("inn")) && (
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            ensureEmployeeId={ensureEmployeeId}
            documentType={hasUploadType("inn_document") ? "inn_document" : "inn"}
            label={
              hasUploadType("inn_document")
                ? getInlineUploadMeta("inn_document").label
                : getInlineUploadMeta("inn").label
            }
            readonly={false}
            multiple={
              hasUploadType("inn_document")
                ? getInlineUploadMeta("inn_document").multiple
                : getInlineUploadMeta("inn").multiple
            }
          />
        )}

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
            {hasUploadType("snils_card") && (
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                ensureEmployeeId={ensureEmployeeId}
                documentType="snils_card"
                label={getInlineUploadMeta("snils_card").label}
                readonly={false}
                multiple={getInlineUploadMeta("snils_card").multiple}
              />
            )}
          </>
        )}

        {!getFieldProps("bankAccountNumber").hidden && (
          <>
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
            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="bank_details"
              label={getInlineUploadMeta("bank_details").label}
              readonly={false}
              multiple={getInlineUploadMeta("bank_details").multiple}
            />
          </>
        )}

        {patentFields}

        {additionalDocumentUploads.length > 0 && (
          <>
            <div style={{ marginTop: 8, marginBottom: 12 }}>
              <Text strong>Дополнительные документы</Text>
            </div>
            <MobileEmployeeUploadsSection
              uploads={additionalDocumentUploads}
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
