import dayjs from "dayjs";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { formatInn, formatKig, formatSnils } from "@/utils/formatters";

export const buildApplicationRequestModalColumns = (employeesWithConsents) => [
  { title: "№", render: (_, __, index) => index + 1, width: 50 },
  {
    title: "Ф.И.О.",
    render: (_, record) =>
      `${record.lastName} ${record.firstName} ${record.middleName || ""}`,
    ellipsis: true,
  },
  {
    title: "КИГ",
    dataIndex: "kig",
    key: "kig",
    ellipsis: true,
    render: (value) => formatKig(value),
  },
  {
    title: "Гражданство",
    dataIndex: ["citizenship", "name"],
    key: "citizenship",
    ellipsis: true,
  },
  {
    title: "Дата рождения",
    dataIndex: "birthDate",
    key: "birthDate",
    render: (date) => (date ? dayjs(date).format("DD.MM.YYYY") : "-"),
    ellipsis: true,
  },
  {
    title: "СНИЛС",
    dataIndex: "snils",
    key: "snils",
    ellipsis: true,
    render: (value) => formatSnils(value),
  },
  {
    title: "Должность",
    dataIndex: ["position", "name"],
    key: "position",
    ellipsis: true,
  },
  {
    title: "ИНН сотрудника",
    dataIndex: "inn",
    key: "inn",
    ellipsis: true,
    render: (value) => formatInn(value),
  },
  {
    title: "Согласие Перс.д.",
    key: "biometricConsent",
    width: 130,
    render: (_, record) => {
      const hasConsent = employeesWithConsents[record.id];
      return hasConsent ? (
        <span style={{ color: "#52c41a", fontSize: "16px" }}>
          <CheckOutlined /> Да
        </span>
      ) : (
        <span style={{ color: "#f5222d", fontSize: "16px" }}>
          <CloseOutlined /> Нет
        </span>
      );
    },
  },
];
