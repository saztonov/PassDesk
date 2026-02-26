import { Form, Input, Typography } from "antd";
import EmployeeDocumentUpload from "@/components/Employees/EmployeeDocumentUpload";
import { profileDocumentTypeLabels } from "@/modules/employees/lib/documentTypeProfiles";
import {
  createDateInputRules,
  formatDateInputValue,
  getUploadsForDocumentProfile,
} from "./MobileEmployeeDocumentSectionUtils";

const { Title } = Typography;

export const buildMobileEmployeePatentSection = ({
  requiresPatent,
  getFieldProps,
  formatKig,
  formatPatentNumber,
  noAutoFillProps,
  formatBlankNumber,
  employee,
  ensureEmployeeId,
  profileCode,
  profilesConfig,
}) => {
  if (!requiresPatent) {
    return null;
  }

  const uploads = getUploadsForDocumentProfile(profileCode, profilesConfig);
  const uploadsByType = new Map(
    uploads.map((upload) => [upload.documentType, upload]),
  );
  const hasUploadType = (documentType) => uploadsByType.has(documentType);
  const getInlineUploadMeta = (documentType) =>
    uploadsByType.get(documentType) || {
      documentType,
      label: profileDocumentTypeLabels[documentType] || documentType,
      multiple: true,
    };

  return {
    key: "patent",
    label: (
      <Title level={5} style={{ margin: 0 }}>
        📑 Патент
      </Title>
    ),
    children: (
      <>
        {!getFieldProps("kig").hidden && (
          <>
            <Form.Item
              label="КИГ"
              name="kig"
              required={getFieldProps("kig").required}
              rules={[
                ...getFieldProps("kig").rules,
                {
                  pattern: /^\d{7}$/,
                  message: "КИГ должен содержать 7 цифр",
                },
              ]}
              getValueFromEvent={(e) => formatKig(e.target.value)}
            >
              <Input
                placeholder="1234567"
                size="large"
                maxLength={7}
                {...noAutoFillProps}
              />
            </Form.Item>
            {hasUploadType("kig") && (
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                ensureEmployeeId={ensureEmployeeId}
                documentType="kig"
                label={getInlineUploadMeta("kig").label}
                readonly={false}
                multiple={getInlineUploadMeta("kig").multiple}
              />
            )}
          </>
        )}

        {!getFieldProps("patentNumber").hidden && (
          <>
            <Form.Item
              label="Номер патента"
              name="patentNumber"
              required={getFieldProps("patentNumber").required}
              rules={[
                ...getFieldProps("patentNumber").rules,
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve();
                    const digits = value.replace(/[^\d]/g, "");
                    if (digits.length === 12) return Promise.resolve();
                    return Promise.reject(
                      new Error("Номер патента должен содержать 12 цифр"),
                    );
                  },
                },
              ]}
              getValueFromEvent={(e) => formatPatentNumber(e.target.value)}
            >
              <Input
                placeholder="01 №1234567890"
                size="large"
                {...noAutoFillProps}
              />
            </Form.Item>

            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="patent_front"
              label={getInlineUploadMeta("patent_front").label}
              readonly={false}
              multiple={getInlineUploadMeta("patent_front").multiple}
            />
            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="patent_back"
              label={getInlineUploadMeta("patent_back").label}
              readonly={false}
              multiple={getInlineUploadMeta("patent_back").multiple}
            />
            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="patent_payment_receipt"
              label={getInlineUploadMeta("patent_payment_receipt").label}
              readonly={false}
              multiple={getInlineUploadMeta("patent_payment_receipt").multiple}
            />
          </>
        )}

        {!getFieldProps("patentIssueDate").hidden && (
          <Form.Item
            label="Дата выдачи патента"
            name="patentIssueDate"
            required={getFieldProps("patentIssueDate").required}
            rules={createDateInputRules(getFieldProps("patentIssueDate").rules)}
            normalize={formatDateInputValue}
          >
            <Input placeholder="ДД.ММ.ГГГГ" size="large" {...noAutoFillProps} />
          </Form.Item>
        )}

        {!getFieldProps("blankNumber").hidden && (
          <Form.Item
            label="Номер бланка"
            name="blankNumber"
            required={getFieldProps("blankNumber").required}
            rules={[
              ...getFieldProps("blankNumber").rules,
              {
                pattern: /^[А-ЯЁ]{2}\d{7}$/,
                message: "Номер бланка должен быть в формате: ПР1234567",
              },
            ]}
            getValueFromEvent={(e) => formatBlankNumber(e.target.value)}
          >
            <Input
              placeholder="ПР1234567"
              size="large"
              maxLength={9}
              {...noAutoFillProps}
            />
          </Form.Item>
        )}
      </>
    ),
  };
};
