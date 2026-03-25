import dayjs from "dayjs";
import { formatInn, formatKig, formatSnils } from "@/utils/formatters";
import {
  findEmployeeMapping,
  getBirthCountryName,
} from "@/modules/employees/lib/exportToExcelModalUtils";

const formatDateValue = (date) => (date ? dayjs(date).format("DD.MM.YYYY") : "-");

const formatBirthPlace = (record) => {
  const parts = [
    getBirthCountryName(record) !== "-" ? getBirthCountryName(record) : null,
    record.birthRegion,
    record.birthCity,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "-";
};

export const buildExportToExcelModalColumns = ({
  constructionSiteId,
  counterpartyId,
}) => [
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
    title: "Срок окончания КИГ",
    dataIndex: "kigEndDate",
    key: "kigEndDate",
    render: formatDateValue,
    ellipsis: true,
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
    render: formatDateValue,
    ellipsis: true,
  },
  {
    title: "Место рождения",
    key: "birthPlace",
    width: 240,
    render: (_, record) => formatBirthPlace(record),
  },
  {
    title: "Страна рождения",
    key: "birthCountry",
    ellipsis: true,
    render: (_, record) => getBirthCountryName(record),
  },
  {
    title: "Область рождения",
    dataIndex: "birthRegion",
    key: "birthRegion",
    ellipsis: true,
    render: (value) => value || "-",
  },
  {
    title: "Населенный пункт рождения",
    dataIndex: "birthCity",
    key: "birthCity",
    ellipsis: true,
    render: (value) => value || "-",
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
    title: "р/с",
    dataIndex: "bankAccountNumber",
    key: "bankAccountNumber",
    ellipsis: true,
    render: (value) => value || "-",
  },
  {
    title: "БИК",
    dataIndex: "bankBik",
    key: "bankBik",
    ellipsis: true,
    render: (value) => value || "-",
  },
  {
    title: "Дата окончания паспорта",
    dataIndex: "passportExpiryDate",
    key: "passportExpiryDate",
    render: formatDateValue,
    ellipsis: true,
  },
  {
    title: "Организация",
    key: "organization",
    width: 200,
    render: (_, record) => {
      const mapping = findEmployeeMapping({
        employee: record,
        constructionSiteId,
        counterpartyId,
      });
      return mapping?.counterparty?.name || "-";
    },
  },
  {
    title: "ИНН организации",
    key: "organizationInn",
    width: 140,
    render: (_, record) => {
      const mapping = findEmployeeMapping({
        employee: record,
        constructionSiteId,
        counterpartyId,
      });
      return mapping?.counterparty?.inn || "-";
    },
  },
  {
    title: "КПП организации",
    key: "organizationKpp",
    width: 120,
    render: (_, record) => {
      const mapping = findEmployeeMapping({
        employee: record,
        constructionSiteId,
        counterpartyId,
      });
      return mapping?.counterparty?.kpp || "-";
    },
  },
];
