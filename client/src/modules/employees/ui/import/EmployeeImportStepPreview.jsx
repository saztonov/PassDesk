import { memo } from "react";
import { Empty, Table } from "antd";
import dayjs from "dayjs";
import { EMPLOYEE_IMPORT_PROFILE_1C_ZUP } from "@/modules/employees/model/employeeImportProfiles";

const defaultColumns = [
  {
    title: "№",
    render: (_, __, index) => index + 1,
    width: 40,
    align: "center",
  },
  {
    title: "Фамилия",
    dataIndex: "lastName",
    key: "lastName",
    ellipsis: true,
    width: 120,
  },
  {
    title: "Имя",
    dataIndex: "firstName",
    key: "firstName",
    ellipsis: true,
    width: 120,
  },
  {
    title: "Дата рождения",
    dataIndex: "birthDate",
    key: "birthDate",
    width: 120,
    render: (date) => (date ? dayjs(date).format("DD.MM.YYYY") : "-"),
  },
  {
    title: "ИНН контрагента",
    dataIndex: "counterpartyInn",
    key: "counterpartyInn",
    width: 120,
  },
  {
    title: "ИНН сотрудника",
    dataIndex: "inn",
    key: "inn",
    ellipsis: true,
    width: 120,
  },
];

const zup1cColumns = [
  {
    title: "№",
    render: (_, __, index) => index + 1,
    width: 40,
    align: "center",
  },
  {
    title: "ФИО",
    key: "fullName",
    width: 220,
    render: (_, record) =>
      [record.lastName, record.firstName, record.middleName]
        .filter(Boolean)
        .join(" "),
  },
  {
    title: "Подразделение",
    dataIndex: "department",
    key: "department",
    ellipsis: true,
    width: 220,
  },
  {
    title: "Должность",
    dataIndex: "position",
    key: "position",
    ellipsis: true,
    width: 180,
  },
  {
    title: "Пропуск",
    dataIndex: "passNumber",
    key: "passNumber",
    ellipsis: true,
    width: 160,
  },
  {
    title: "Статус",
    key: "employmentStatus",
    width: 120,
    render: (_, record) => {
      if (record.employmentStatus === "fired" || record.isClosedBrigade) {
        return "Уволен";
      }
      if (record.employmentStatus === "inactive") {
        return "Неактивный";
      }
      return "Активный";
    },
  },
];

const EmployeeImportStepPreview = memo(({ fileData, profile }) => {
  const columns =
    profile === EMPLOYEE_IMPORT_PROFILE_1C_ZUP ? zup1cColumns : defaultColumns;

  return (
  <div>
    <p style={{ marginBottom: "16px" }}>
      Загружено записей: <strong>{fileData?.length || 0}</strong>
    </p>
    {fileData?.length ? (
      <Table
        dataSource={fileData.map((item, index) => ({
          ...item,
          _key: index,
        }))}
        columns={columns}
        pagination={{
          pageSize: 100,
          size: "small",
          showSizeChanger: true,
          pageSizeOptions: ["50", "100", "200"],
        }}
        size="small"
        scroll={{ x: 900 }}
        rowKey="_key"
      />
    ) : (
      <Empty description="Данные не загружены" />
    )}
  </div>
  );
});

EmployeeImportStepPreview.displayName = "EmployeeImportStepPreview";

export default EmployeeImportStepPreview;
