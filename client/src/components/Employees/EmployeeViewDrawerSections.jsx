import { Form, Input, Select, Typography } from "antd";
import dayjs from "dayjs";
import EmployeeDocumentUpload from "./EmployeeDocumentUpload";
import { formatPassportDepartmentCode } from "@/modules/employees/lib/employeeFormFormatters";

const { Title, Text } = Typography;
const { TextArea } = Input;
const DATE_FORMAT = "DD.MM.YYYY";

export const buildEmployeeViewDrawerFormData = (employee) => {
  if (!employee) {
    return null;
  }

  return {
    lastName: employee.lastName,
    firstName: employee.firstName,
    middleName: employee.middleName,
    citizenshipId: employee.citizenshipId,
    birthDate: employee.birthDate
      ? dayjs(employee.birthDate).format(DATE_FORMAT)
      : null,
    registrationAddress: employee.registrationAddress,
    phone: employee.phone,
    notes: employee.notes,
    inn: employee.inn,
    snils: employee.snils,
    bankAccountNumber: employee.bankAccountNumber,
    bankBik: employee.bankBik,
    passportType: employee.passportType,
    passportNumber: employee.passportNumber,
    passportDate: employee.passportDate
      ? dayjs(employee.passportDate).format(DATE_FORMAT)
      : null,
    passportIssuer: employee.passportIssuer,
    passportDepartmentCode:
      employee.passportType === "russian"
        ? formatPassportDepartmentCode(employee.passportDepartmentCode)
        : employee.passportDepartmentCode,
    kig: employee.kig,
    kigEndDate: employee.kigEndDate
      ? dayjs(employee.kigEndDate).format(DATE_FORMAT)
      : null,
    patentNumber: employee.patentNumber,
    patentIssueDate: employee.patentIssueDate
      ? dayjs(employee.patentIssueDate).format(DATE_FORMAT)
      : null,
    blankNumber: employee.blankNumber,
    isFired: employee.isFired,
    isInactive: employee.isInactive,
  };
};

export const buildEmployeeViewDrawerItems = ({
  employee,
  citizenships,
  requiresPatent,
  canViewStatuses,
  getFieldProps,
}) => {
  const patentFields = requiresPatent ? (
    <>
      {!getFieldProps("kig").hidden && (
        <>
          <Form.Item label="КИГ" name="kig">
            <Input
              placeholder={employee?.kig ? undefined : ""}
              size="large"
              disabled
            />
          </Form.Item>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            documentType="kig"
            label="Фото КИГ"
            readonly
            hideIfEmpty
          />
        </>
      )}

      {!getFieldProps("kigEndDate").hidden && (
        <Form.Item label="Срок окончания КИГ" name="kigEndDate">
          <Input size="large" disabled />
        </Form.Item>
      )}

      {!getFieldProps("patentNumber").hidden && (
        <>
          <Form.Item label="Номер патента" name="patentNumber">
            <Input
              placeholder={employee?.patentNumber ? undefined : ""}
              size="large"
              disabled
            />
          </Form.Item>
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            documentType="patent_front"
            label="Фото патента (лиц.)"
            readonly
            hideIfEmpty
          />
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            documentType="patent_back"
            label="Фото патента (спин.)"
            readonly
            hideIfEmpty
          />
          <EmployeeDocumentUpload
            employeeId={employee?.id}
            documentType="patent_payment_receipt"
            label="Чек оплаты патента"
            readonly
            hideIfEmpty
          />
        </>
      )}

      {!getFieldProps("patentIssueDate").hidden && (
        <Form.Item label="Дата выдачи патента" name="patentIssueDate">
          <Input size="large" disabled />
        </Form.Item>
      )}

      {!getFieldProps("blankNumber").hidden && (
        <Form.Item label="Номер бланка" name="blankNumber">
          <Input
            placeholder={employee?.blankNumber ? undefined : ""}
            size="large"
            maxLength={9}
            disabled
          />
        </Form.Item>
      )}
    </>
  ) : null;

  const items = [
    {
      key: "personal",
      label: (
        <Title level={5} style={{ margin: 0 }}>
          📋 Личная информация
        </Title>
      ),
      children: (
        <>
          {!getFieldProps("lastName").hidden && (
            <Form.Item label="Фамилия" name="lastName">
              <Input disabled size="large" />
            </Form.Item>
          )}

          {!getFieldProps("firstName").hidden && (
            <Form.Item label="Имя" name="firstName">
              <Input disabled size="large" />
            </Form.Item>
          )}

          {!getFieldProps("middleName").hidden && (
            <Form.Item label="Отчество" name="middleName">
              <Input
                disabled
                size="large"
                placeholder={employee?.middleName ? undefined : ""}
              />
            </Form.Item>
          )}

          {!getFieldProps("citizenshipId").hidden && (
            <Form.Item label="Гражданство" name="citizenshipId">
              <Select placeholder="Выберите гражданство" size="large" disabled>
                {citizenships.map((citizenship) => (
                  <Select.Option key={citizenship.id} value={citizenship.id}>
                    {citizenship.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {!getFieldProps("birthDate").hidden && (
            <Form.Item label="Дата рождения" name="birthDate">
              <Input size="large" disabled />
            </Form.Item>
          )}

          {!getFieldProps("registrationAddress").hidden && (
            <Form.Item label="Адрес регистрации" name="registrationAddress">
              <TextArea
                placeholder="г. Москва, ул. Ленина, д. 1"
                rows={3}
                size="large"
                disabled
              />
            </Form.Item>
          )}

          {!getFieldProps("phone").hidden && (
            <Form.Item label="Телефон" name="phone">
              <Input
                placeholder={employee?.phone ? undefined : ""}
                size="large"
                disabled
              />
            </Form.Item>
          )}

          {!getFieldProps("passportType").hidden && (
            <Form.Item label="Тип паспорта" name="passportType">
              <Select size="large" disabled>
                <Select.Option value="russian">Российский</Select.Option>
                <Select.Option value="foreign">Иностранный</Select.Option>
              </Select>
            </Form.Item>
          )}

          {!getFieldProps("passportNumber").hidden && (
            <>
              <Form.Item label="Паспорт (серия и номер)" name="passportNumber">
                <Input
                  placeholder={employee?.passportNumber ? undefined : ""}
                  size="large"
                  disabled
                />
              </Form.Item>
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="passport"
                label="Фото паспорта"
                readonly
                hideIfEmpty
              />
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="passport_translation"
                label="Фото перевода паспорта"
                readonly
                hideIfEmpty
              />
            </>
          )}

          {!getFieldProps("passportDate").hidden && (
            <Form.Item label="Дата выдачи паспорта" name="passportDate">
              <Input size="large" disabled />
            </Form.Item>
          )}

          {!getFieldProps("passportIssuer").hidden && (
            <Form.Item label="Кем выдан паспорт" name="passportIssuer">
              <TextArea
                placeholder={employee?.passportIssuer ? undefined : ""}
                rows={3}
                size="large"
                disabled
              />
            </Form.Item>
          )}

          {employee?.passportType === "russian" &&
            !getFieldProps("passportDepartmentCode").hidden && (
              <Form.Item
                label="Код подразделения"
                name="passportDepartmentCode"
              >
                <Input
                  placeholder={
                    employee?.passportDepartmentCode ? undefined : ""
                  }
                  size="large"
                  disabled
                />
              </Form.Item>
            )}

        </>
      ),
    },
    {
      key: "documents",
      label: (
        <Title level={5} style={{ margin: 0 }}>
          📄 Документы
        </Title>
      ),
      children: (
        <>
          {!getFieldProps("inn").hidden && (
            <>
              <Form.Item label="ИНН" name="inn">
                <Input
                  placeholder={employee?.inn ? undefined : ""}
                  size="large"
                  disabled
                />
              </Form.Item>
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="inn_document"
                label="Документ ИНН"
                readonly
                hideIfEmpty
              />
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="inn"
                label="Документ ИНН"
                readonly
                hideIfEmpty
              />
            </>
          )}

          {!getFieldProps("snils").hidden && (
            <>
              <Form.Item label="СНИЛС" name="snils">
                <Input
                  placeholder={employee?.snils ? undefined : ""}
                  size="large"
                  disabled
                />
              </Form.Item>
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="snils_card"
                label="Фото СНИЛС"
                readonly
                hideIfEmpty
              />
            </>
          )}

          {!getFieldProps("bankAccountNumber").hidden && (
            <>
              <Form.Item
                label="Номер банковского счета"
                name="bankAccountNumber"
              >
                <Input
                  placeholder={employee?.bankAccountNumber ? undefined : ""}
                  size="large"
                  disabled
                />
              </Form.Item>
              <EmployeeDocumentUpload
                employeeId={employee?.id}
                documentType="bank_details"
                label="Реквизиты счета"
                readonly
                hideIfEmpty
              />
            </>
          )}

          {!getFieldProps("bankBik").hidden && (
            <Form.Item label="БИК" name="bankBik">
              <Input
                placeholder={employee?.bankBik ? undefined : ""}
                size="large"
                disabled
              />
            </Form.Item>
          )}

          {patentFields}
        </>
      ),
    },
  ];

  if (employee?.id && canViewStatuses) {
    items.push({
      key: "statuses",
      label: (
        <Title level={5} style={{ margin: 0 }}>
          ⚙️ Статусы
        </Title>
      ),
      children: (
        <>
          <div style={{ padding: "8px 0" }}>
            <Text>
              Уволен: <strong>{employee.isFired ? "Да" : "Нет"}</strong>
            </Text>
          </div>
          <div style={{ padding: "8px 0" }}>
            <Text>
              Неактивен (временно):{" "}
              <strong>{employee.isInactive ? "Да" : "Нет"}</strong>
            </Text>
          </div>
        </>
      ),
    });
  }

  return items;
};
