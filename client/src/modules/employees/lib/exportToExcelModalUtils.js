import dayjs from "dayjs";
import { formatInn, formatKig, formatSnils } from "@/utils/formatters";

const formatDateValue = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY") : "-";

const formatBirthPlace = (employee) => {
  const parts = [
    employee.birthCountry?.name,
    employee.birthRegion,
    employee.birthCity,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "-";
};

const getStatusByGroup = (employee, group) => {
  const mapping = employee.statusMappings?.find(
    (item) => item.statusGroup === group || item.status_group === group,
  );
  return mapping?.status?.name;
};

export const findEmployeeMapping = ({
  employee,
  constructionSiteId,
  counterpartyId,
}) =>
  employee.employeeCounterpartyMappings?.find(
    (mapping) =>
      mapping.constructionSiteId === constructionSiteId &&
      mapping.counterpartyId === counterpartyId,
  );

export const filterEmployeesForExport = ({
  allEmployees,
  constructionSiteId,
  counterpartyId,
  filterType,
}) =>
  allEmployees.filter((employee) => {
    const mappings = employee.employeeCounterpartyMappings || [];
    const hasMatchingMapping = mappings.some(
      (mapping) =>
        mapping?.constructionSiteId === constructionSiteId &&
        mapping?.counterpartyId === counterpartyId,
    );

    if (!hasMatchingMapping) {
      return false;
    }

    const mainStatus = getStatusByGroup(employee, "status");
    const activeStatus = getStatusByGroup(employee, "status_active");
    const secureStatus = getStatusByGroup(employee, "status_secure");

    if (filterType === "tb_passed") {
      return mainStatus === "status_tb_passed";
    }

    if (filterType === "blocked") {
      return (
        activeStatus === "status_active_fired" ||
        activeStatus === "status_active_inactive" ||
        secureStatus === "status_secure_block"
      );
    }

    return (
      mainStatus === "status_tb_passed" || mainStatus === "status_processed"
    );
  });

export const buildExportExcelRows = ({
  employees,
  constructionSiteId,
  counterpartyId,
}) =>
  employees.map((employee, index) => {
    const mapping = findEmployeeMapping({
      employee,
      constructionSiteId,
      counterpartyId,
    });

    return {
      "№": index + 1,
      "Ф.И.О.": `${employee.lastName} ${employee.firstName} ${employee.middleName || ""}`,
      КИГ: formatKig(employee.kig),
      "Срок окончания КИГ": formatDateValue(employee.kigEndDate),
      Гражданство: employee.citizenship?.name || "-",
      "Дата рождения": formatDateValue(employee.birthDate),
      "Место рождения": formatBirthPlace(employee),
      "Страна рождения": employee.birthCountry?.name || "-",
      "Область рождения": employee.birthRegion || "-",
      "Населенный пункт рождения": employee.birthCity || "-",
      СНИЛС: formatSnils(employee.snils),
      Должность: employee.position?.name || "-",
      "ИНН сотрудника": formatInn(employee.inn),
      БИК: employee.bankBik || "-",
      "Дата окончания паспорта": formatDateValue(employee.passportExpiryDate),
      Организация: mapping?.counterparty?.name || "-",
      "ИНН организации": mapping?.counterparty?.inn || "-",
      "КПП организации": mapping?.counterparty?.kpp || "-",
    };
  });

export const buildStatusUpdatesForExport = ({
  employees,
  filterType,
  allStatuses,
}) => {
  const updates = [];

  if (filterType === "tb_passed") {
    const processedStatus = allStatuses.find(
      (status) => status.name === "status_processed",
    );
    if (!processedStatus) {
      return updates;
    }

    employees.forEach((employee) => {
      const mainStatus = getStatusByGroup(employee, "status");
      if (mainStatus === "status_tb_passed") {
        updates.push({
          employeeId: employee.id,
          statusId: processedStatus.id,
        });
      }
    });
    return updates;
  }

  if (filterType === "blocked") {
    const firedCompleted = allStatuses.find(
      (status) => status.name === "status_active_fired_compl",
    );
    const blockedCompleted = allStatuses.find(
      (status) => status.name === "status_secure_block_compl",
    );

    employees.forEach((employee) => {
      const activeStatus = getStatusByGroup(employee, "status_active");
      const secureStatus = getStatusByGroup(employee, "status_secure");

      if (activeStatus === "status_active_fired" && firedCompleted) {
        updates.push({
          employeeId: employee.id,
          statusId: firedCompleted.id,
        });
      }
      if (secureStatus === "status_secure_block" && blockedCompleted) {
        updates.push({
          employeeId: employee.id,
          statusId: blockedCompleted.id,
        });
      }
    });
  }

  return updates;
};
