import {
  Modal,
  Descriptions,
  Button,
  Tabs,
  Row,
  Col,
  Space,
  Checkbox,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import EmployeeFileUpload from "./EmployeeFileUpload";
import dayjs from "dayjs";
import {
  formatPhone,
  formatSnils,
  formatInn,
  formatPatentNumber,
  formatBlankNumber,
} from "../../utils/formatters";

const DATE_FORMAT = "DD.MM.YYYY";

const EmployeeViewModal = ({ visible, employee, onCancel, onEdit }) => {
  if (!employee) return null;

  // Проверяем, требуется ли патент для данного гражданства
  const requiresPatent = employee.citizenship?.requiresPatent !== false;

  // Построение элементов вкладок новым API
  const tabItems = [
    {
      key: "1",
      label: "Основная информация",
      children: (
        <>
          {/* Чекбоксы статусов */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <Space size="large">
                <Checkbox
                  checked={(() => {
                    const statusMapping = employee.statusMappings?.find(
                      (m) =>
                        m.statusGroup === "status_active" ||
                        m.status_group === "status_active",
                    );
                    const statusName = statusMapping?.status?.name;
                    return (
                      statusName === "status_active_fired" ||
                      statusName === "status_active_fired_compl"
                    );
                  })()}
                  disabled
                >
                  <span style={{ color: "#ff4d4f" }}>Уволен</span>
                </Checkbox>
                <Checkbox
                  checked={(() => {
                    const statusMapping = employee.statusMappings?.find(
                      (m) =>
                        m.statusGroup === "status_active" ||
                        m.status_group === "status_active",
                    );
                    const statusName = statusMapping?.status?.name;
                    return statusName === "status_active_inactive";
                  })()}
                  disabled
                >
                  <span style={{ color: "#1890ff" }}>Неактивный</span>
                </Checkbox>
              </Space>
            </Col>
          </Row>

          <Descriptions bordered column={3} size="small">
            <Descriptions.Item label="Фамилия" span={1}>
              {employee.lastName}
            </Descriptions.Item>
            <Descriptions.Item label="Имя" span={1}>
              {employee.firstName}
            </Descriptions.Item>
            <Descriptions.Item label="Отчество" span={1}>
              {employee.middleName || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Пол" span={1}>
              {employee.gender === "male"
                ? "Мужской"
                : employee.gender === "female"
                  ? "Женский"
                  : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Должность" span={1}>
              {employee.position?.name || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Гражданство" span={1}>
              {employee.citizenship?.name || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Дата рождения" span={1}>
              {employee.birthDate
                ? dayjs(employee.birthDate).format(DATE_FORMAT)
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Адрес регистрации" span={1}>
              {employee.registrationAddress || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Email" span={1}>
              {employee.email || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Телефон" span={1}>
              {formatPhone(employee.phone)}
            </Descriptions.Item>
            <Descriptions.Item label="Примечания" span={1}>
              {employee.notes || "-"}
            </Descriptions.Item>
          </Descriptions>
        </>
      ),
    },
    {
      key: "2",
      label: "Документы",
      children: (
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="ИНН" span={1}>
            {formatInn(employee.inn)}
          </Descriptions.Item>
          <Descriptions.Item label="СНИЛС" span={1}>
            {formatSnils(employee.snils)}
          </Descriptions.Item>
          <Descriptions.Item label="№ паспорта" span={1}>
            {employee.passportNumber || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Дата выдачи паспорта" span={1}>
            {employee.passportDate
              ? dayjs(employee.passportDate).format(DATE_FORMAT)
              : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Кем выдан паспорт" span={1}>
            {employee.passportIssuer || "-"}
          </Descriptions.Item>
        </Descriptions>
      ),
    },
  ];

  // Добавляем вкладку Патент если требуется
  if (requiresPatent) {
    tabItems.push({
      key: "3",
      label: "Патент",
      children: (
        <Descriptions bordered column={3} size="small">
          <Descriptions.Item label="Номер патента" span={1}>
            {formatPatentNumber(employee.patentNumber)}
          </Descriptions.Item>
          <Descriptions.Item label="Дата выдачи патента" span={1}>
            {employee.patentIssueDate
              ? dayjs(employee.patentIssueDate).format(DATE_FORMAT)
              : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Номер бланка" span={1}>
            {formatBlankNumber(employee.blankNumber)}
          </Descriptions.Item>
        </Descriptions>
      ),
    });
  }

  // Добавляем вкладку Файлы
  tabItems.push({
    key: "4",
    label: "Файлы",
    children: <EmployeeFileUpload employeeId={employee.id} readonly={true} />,
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
