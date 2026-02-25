import { Divider, Row, Col, Form, Input } from "antd";
import EmployeeDocumentUpload from "./EmployeeDocumentUpload";
import EmployeePatentTab from "./EmployeePatentTab";
import {
  formatBankAccountNumber,
  formatInn,
  formatSnils,
  noAutoFillProps,
} from "./employeeFormUtils";
import {
  profileDocumentTypeLabels,
} from "@/modules/employees/lib/documentTypeProfiles";
import { getUploadsForDocumentProfile } from "@/modules/employees/ui/form/MobileEmployeeDocumentSectionUtils";

const EmployeeDocumentsTab = ({
  getFieldProps,
  handleInnBlur,
  requiresPatent,
  checkingCitizenship,
  dateFormat,
  employee,
  ensureEmployeeId,
  profileCode,
  profilesConfig,
}) => {
  const uploads = getUploadsForDocumentProfile(profileCode, profilesConfig);
  const uploadsByType = new Map(
    uploads.map((upload) => [upload.documentType, upload]),
  );
  const getUploadMeta = (documentType) =>
    uploadsByType.get(documentType) || {
      documentType,
      label: profileDocumentTypeLabels[documentType] || documentType,
      multiple: true,
    };
  const hasUploadType = (documentType) => uploadsByType.has(documentType);

  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6} lg={6}>
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

          {(hasUploadType("inn_document") || hasUploadType("inn")) && (
            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType={hasUploadType("inn_document") ? "inn_document" : "inn"}
              label={
                hasUploadType("inn_document")
                  ? getUploadMeta("inn_document").label
                  : getUploadMeta("inn").label
              }
              readonly={false}
              multiple={
                hasUploadType("inn_document")
                  ? getUploadMeta("inn_document").multiple
                  : getUploadMeta("inn").multiple
              }
            />
          )}
        </Col>

        {!getFieldProps("snils").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
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

            {hasUploadType("snils_card") && (
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                ensureEmployeeId={ensureEmployeeId}
                documentType="snils_card"
                label={getUploadMeta("snils_card").label}
                readonly={false}
                multiple={getUploadMeta("snils_card").multiple}
              />
            )}
          </Col>
        )}

        {!getFieldProps("bankAccountNumber").hidden && (
          <Col xs={24} sm={12} md={6} lg={6}>
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

            <EmployeeDocumentUpload
              employeeId={employee?.id}
              ensureEmployeeId={ensureEmployeeId}
              documentType="bank_details"
              label={getUploadMeta("bank_details").label}
              readonly={false}
              multiple={getUploadMeta("bank_details").multiple}
            />
          </Col>
        )}
      </Row>

      {(requiresPatent || checkingCitizenship) && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          {checkingCitizenship ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "#999",
              }}
            >
              Проверка необходимости патента...
            </div>
          ) : (
            <EmployeePatentTab
              getFieldProps={getFieldProps}
              dateFormat={dateFormat}
              employee={employee}
              ensureEmployeeId={ensureEmployeeId}
              getUploadMeta={getUploadMeta}
            />
          )}
        </>
      )}
    </>
  );
};

export default EmployeeDocumentsTab;
