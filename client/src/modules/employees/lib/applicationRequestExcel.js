import dayjs from "dayjs";
import { formatInn, formatKig, formatSnils } from "@/utils/formatters";

const formatDateValue = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY") : "-";

const formatGender = (gender) => {
  if (!gender) return "-";
  return gender === "male" ? "М" : gender === "female" ? "Ж" : gender;
};

export const formatApplicationRequestCell = (employee, columnKey) => {
  switch (columnKey) {
    case "number":
      return "";
    case "fullName":
      return (
        `${employee.lastName || ""} ${employee.firstName || ""} ${employee.middleName || ""}`.trim() ||
        "-"
      );
    case "gender":
      return formatGender(employee.gender);
    case "kig":
      return formatKig(employee.kig) || "-";
    case "kigEndDate":
      return formatDateValue(employee.kigEndDate);
    case "citizenship":
      return employee.citizenship?.name || "-";
    case "birthCountry":
      return employee.birthCountry?.code || employee.citizenship?.code || "-";
    case "birthDate":
      return formatDateValue(employee.birthDate);
    case "birthRegion":
      return employee.birthRegion || "-";
    case "birthCity":
      return employee.birthCity || "-";
    case "snils":
      return formatSnils(employee.snils) || "-";
    case "position":
      return employee.position?.name || "-";
    case "inn":
      return formatInn(employee.inn) || "-";
    case "passportType":
      return employee.passportType || "-";
    case "passport":
      return employee.passportNumber || "-";
    case "passportDate":
      return formatDateValue(employee.passportDate);
    case "passportExpiryDate":
      return formatDateValue(employee.passportExpiryDate);
    case "passportIssuer":
      return employee.passportIssuer || "-";
    case "registrationAddress":
      return employee.registrationAddress || "-";
    case "phone":
      return employee.phone || "-";
    case "patentNumber":
      return employee.patentNumber || "-";
    case "patentIssueDate":
      return formatDateValue(employee.patentIssueDate);
    case "blankNumber":
      return employee.blankNumber || "-";
    case "department": {
      const deptNames =
        employee.employeeCounterpartyMappings?.map(
          (mapping) => mapping.department?.name,
        ) || [];
      return deptNames.join(", ") || "-";
    }
    case "counterparty": {
      const counterpartyName =
        employee.employeeCounterpartyMappings?.[0]?.counterparty?.name;
      return counterpartyName || "-";
    }
    case "counterpartyInn": {
      const counterpartyInn =
        employee.employeeCounterpartyMappings?.[0]?.counterparty?.inn;
      return counterpartyInn || "-";
    }
    case "counterpartyKpp": {
      const counterpartyKpp =
        employee.employeeCounterpartyMappings?.[0]?.counterparty?.kpp;
      return counterpartyKpp || "-";
    }
    case "bankAccountNumber":
      return employee.bankAccountNumber || "-";
    case "bankBik":
      return employee.bankBik || "-";
    case "idAll":
      return employee.idAll || "-";
    default:
      return "-";
  }
};
