import {
  Modal,
  Descriptions,
  Button,
  Tabs,
  Row,
  Col,
  Space,
  Checkbox,
  Divider,
  Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "@/store/authStore";
import { useReferencesStore } from "@/store/referencesStore";
import { useEmployeeFormFieldConfig } from "./useEmployeeFormFieldConfig";
import EmployeeFilesTab from "./EmployeeFilesTab.jsx";
import {
  formatPhone,
  formatSnils,
  formatInn,
  formatPatentNumber,
  formatBlankNumber,
} from "../../utils/formatters";

const DATE_FORMAT = "DD.MM.YYYY";
const { Text } = Typography;

const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

const formatDateValue = (value) =>
  value ? dayjs(value).format(DATE_FORMAT) : "-";

const formatGender = (gender) => {
  if (gender === "male") return "Мужской";
  if (gender === "female") return "Женский";
  return "-";
};

const formatPassportType = (passportType) => {
  if (passportType === "russian") return "Российский";
  if (passportType === "foreign") return "Иностранного гражданина";
  return "-";
};

const formatBirthPlace = (employee) => {
  const parts = [
    employee?.birthCountry?.name,
    employee?.birthRegion,
    employee?.birthCity,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "-";
};

const getUniqueMappedNames = (employee, key) => {
  const values = (employee?.employeeCounterpartyMappings || [])
    .map((mapping) => mapping?.[key]?.name || mapping?.[key]?.shortName)
    .filter(Boolean);

  return values.length > 0 ? [...new Set(values)].join(", ") : "-";
};

const getActiveStatusName = (employee) => {
  const statusName = employee?.statusMappings?.find(
    (item) =>
      item.statusGroup === "status_active" ||
      item.status_group === "status_active",
  )?.status?.name;

  if (
    statusName === "status_active_fired" ||
    statusName === "status_active_fired_compl"
  ) {
    return "Уволен";
  }

  if (statusName === "status_active_inactive") {
    return "Неактивный";
  }

  return "Действующий";
};

const getCardStatusName = (statusCard) => {
  if (statusCard === "completed") return "Карточка заполнена";
  if (statusCard === "draft") return "Черновик";
  return "-";
};

const EmployeeViewModal = ({ visible, employee, onCancel, onEdit }) => {
  const { user } = useAuthStore();
  const { formConfigDefault, formConfigExternal, settings } = useReferencesStore();
  const { getFieldProps } = useEmployeeFormFieldConfig({
    userCounterpartyId: user?.counterpartyId,
    defaultCounterpartyId: settings?.defaultCounterpartyId || null,
    formConfigDefault,
    formConfigExternal,
  });

  if (!employee) return null;

  const requiresPatent = doesCitizenshipRequirePatent(employee.citizenship);

  const tabItems = [
    {
      key: "1",
      label: "Личная информация",
      children: (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <Space size="large" wrap>
                <Checkbox
                  checked={getActiveStatusName(employee) === "Уволен"}
                  disabled
                >
                  <span style={{ color: "#ff4d4f" }}>Уволен</span>
                </Checkbox>
                <Checkbox
                  checked={getActiveStatusName(employee) === "Неактивный"}
                  disabled
                >
                  <span style={{ color: "#1890ff" }}>Неактивный</span>
                </Checkbox>
              </Space>
            </Col>
          </Row>

          <Descriptions bordered column={3} size="small">
            {!getFieldProps("lastName").hidden && (
              <Descriptions.Item label="Фамилия" span={1}>
                {employee.lastName || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("firstName").hidden && (
              <Descriptions.Item label="Имя" span={1}>
                {employee.firstName || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("middleName").hidden && (
              <Descriptions.Item label="Отчество" span={1}>
                {employee.middleName || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("gender").hidden && (
              <Descriptions.Item label="Пол" span={1}>
                {formatGender(employee.gender)}
              </Descriptions.Item>
            )}
            {!getFieldProps("positionId").hidden && (
              <Descriptions.Item label="Должность" span={1}>
                {employee.position?.name || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("citizenshipId").hidden && (
              <Descriptions.Item label="Гражданство" span={1}>
                {employee.citizenship?.name || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("birthDate").hidden && (
              <Descriptions.Item label="Дата рождения" span={1}>
                {formatDateValue(employee.birthDate)}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Место рождения" span={2}>
              {formatBirthPlace(employee)}
            </Descriptions.Item>
            <Descriptions.Item label="Организация" span={2}>
              {getUniqueMappedNames(employee, "counterparty")}
            </Descriptions.Item>
            <Descriptions.Item label="Объекты" span={1}>
              {getUniqueMappedNames(employee, "constructionSite")}
            </Descriptions.Item>
            {!getFieldProps("registrationAddress").hidden && (
              <Descriptions.Item label="Адрес регистрации" span={2}>
                {employee.registrationAddress || "-"}
              </Descriptions.Item>
            )}
            {!getFieldProps("phone").hidden && (
              <Descriptions.Item label="Телефон" span={1}>
                {formatPhone(employee.phone)}
              </Descriptions.Item>
            )}
            {!getFieldProps("email").hidden && (
              <Descriptions.Item label="Email" span={1}>
                {employee.email || "-"}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Статус" span={1}>
              {getActiveStatusName(employee)}
            </Descriptions.Item>
            <Descriptions.Item label="Статус карточки" span={1}>
              {getCardStatusName(employee.statusCard)}
            </Descriptions.Item>
            {!getFieldProps("notes").hidden && (
              <Descriptions.Item label="Примечания" span={3}>
                {employee.notes || "-"}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider style={{ margin: "12px 0" }} />
          <Text strong style={{ display: "block", marginBottom: 12 }}>
            Документы
          </Text>

        <Descriptions bordered column={2} size="small">
          {!getFieldProps("passportType").hidden && (
            <Descriptions.Item label="Тип паспорта" span={1}>
              {formatPassportType(employee.passportType)}
            </Descriptions.Item>
          )}
          {!getFieldProps("passportNumber").hidden && (
            <Descriptions.Item label="№ паспорта" span={1}>
              {employee.passportNumber || "-"}
            </Descriptions.Item>
          )}
          {!getFieldProps("passportDate").hidden && (
            <Descriptions.Item label="Дата выдачи паспорта" span={1}>
              {formatDateValue(employee.passportDate)}
            </Descriptions.Item>
          )}
          {employee.passportType === "foreign" &&
            !getFieldProps("passportExpiryDate").hidden && (
              <Descriptions.Item label="Дата окончания паспорта" span={1}>
                {formatDateValue(employee.passportExpiryDate)}
              </Descriptions.Item>
            )}
          {!getFieldProps("passportIssuer").hidden && (
            <Descriptions.Item label="Кем выдан паспорт" span={2}>
              {employee.passportIssuer || "-"}
            </Descriptions.Item>
          )}
          {!getFieldProps("inn").hidden && (
            <Descriptions.Item label="ИНН" span={1}>
              {formatInn(employee.inn)}
            </Descriptions.Item>
          )}
          {!getFieldProps("snils").hidden && (
            <Descriptions.Item label="СНИЛС" span={1}>
              {formatSnils(employee.snils)}
            </Descriptions.Item>
          )}
          {!getFieldProps("bankAccountNumber").hidden && (
            <Descriptions.Item label="Номер банковского счета" span={1}>
              {employee.bankAccountNumber || "-"}
            </Descriptions.Item>
          )}
          {!getFieldProps("bankBik").hidden && (
            <Descriptions.Item label="БИК" span={1}>
              {employee.bankBik || "-"}
            </Descriptions.Item>
          )}
          {!getFieldProps("insurancePolicyNumber").hidden && (
            <Descriptions.Item label="Номер страхового полиса" span={1}>
              {employee.insurancePolicyNumber || "-"}
            </Descriptions.Item>
          )}
          {!getFieldProps("insurancePolicyDate").hidden && (
            <Descriptions.Item label="Дата выдачи полиса" span={1}>
              {formatDateValue(employee.insurancePolicyDate)}
            </Descriptions.Item>
          )}
        </Descriptions>

          {requiresPatent && (
            <>
              <Divider style={{ margin: "12px 0" }} />
              <Text strong style={{ display: "block", marginBottom: 12 }}>
                Миграционные документы
              </Text>

              <Descriptions bordered column={3} size="small">
                {!getFieldProps("kig").hidden && (
                  <Descriptions.Item label="КИГ" span={1}>
                    {employee.kig || "-"}
                  </Descriptions.Item>
                )}
                {!getFieldProps("kigEndDate").hidden && (
                  <Descriptions.Item label="Срок окончания КИГ" span={1}>
                    {formatDateValue(employee.kigEndDate)}
                  </Descriptions.Item>
                )}
                {!getFieldProps("patentNumber").hidden && (
                  <Descriptions.Item label="Номер патента" span={1}>
                    {formatPatentNumber(employee.patentNumber)}
                  </Descriptions.Item>
                )}
                {!getFieldProps("patentIssueDate").hidden && (
                  <Descriptions.Item label="Дата выдачи патента" span={1}>
                    {formatDateValue(employee.patentIssueDate)}
                  </Descriptions.Item>
                )}
                {!getFieldProps("blankNumber").hidden && (
                  <Descriptions.Item label="Номер бланка" span={1}>
                    {formatBlankNumber(employee.blankNumber)}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </>
          )}
        </>
      ),
    },
  ];

  tabItems.push({
    key: "2",
    label: "Файлы",
    children: (
      <EmployeeFilesTab
        employee={employee}
        defaultCounterpartyId={settings?.defaultCounterpartyId || null}
        selectedCitizenship={employee.citizenship || null}
        userCounterpartyId={user?.counterpartyId || null}
        documentProfilesConfig={settings?.employeeDocumentProfiles || null}
        readonly
        columnsCount={2}
        showInfoBanner={false}
        embeddedViewerHeight={340}
      />
    ),
  });

  return (
    <Modal
      title="Карточка сотрудника"
      open={visible}
      onCancel={onCancel}
      width={1200}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Закрыть
        </Button>,
        <Button
          key="edit"
          type="primary"
          icon={<EditOutlined />}
          onClick={onEdit}
        >
          Редактировать
        </Button>,
      ]}
    >
      <Tabs defaultActiveKey="1" style={{ marginTop: 16 }} items={tabItems} />
    </Modal>
  );
};

export default EmployeeViewModal;
