const sortCollator = new Intl.Collator("ru", {
  sensitivity: "base",
  numeric: true,
});

const getEmployeeMappings = (employee) =>
  Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];

const getActiveEmployeeMappings = (employee) =>
  getEmployeeMappings(employee).filter((mapping) => !mapping?.dismissedAt);

const getDismissedEmployeeMappings = (employee) =>
  getEmployeeMappings(employee).filter((mapping) => Boolean(mapping?.dismissedAt));

const getFirstMappingValue = (employee, selector) => {
  const activeValue = getActiveEmployeeMappings(employee).map(selector).find(Boolean);
  if (activeValue) {
    return activeValue;
  }

  return getDismissedEmployeeMappings(employee).map(selector).find(Boolean) || "";
};

const getStatusByGroup = (employee, group, alternativeGroups = []) => {
  const groupsToCheck = [group, ...alternativeGroups];
  const mapping = employee?.statusMappings?.find((item) => {
    const mappingGroup = item?.statusGroup || item?.status_group;
    return groupsToCheck.includes(mappingGroup) && item?.isActive !== false;
  });

  return mapping?.status?.name || mapping?.Status?.name || null;
};

export const getEmployeeStatusPriority = (employee) => {
  const secureStatus = getStatusByGroup(employee, "status_secure");
  const activeStatus = getStatusByGroup(employee, "status_active");
  const cardStatus = getStatusByGroup(employee, "status_card", ["card draft"]);
  const mainStatus = getStatusByGroup(employee, "status", ["draft"]);

  if (
    secureStatus === "status_secure_block" ||
    secureStatus === "status_secure_block_compl"
  ) {
    return 1;
  }
  if (
    activeStatus === "status_active_fired" ||
    activeStatus === "status_active_fired_compl"
  ) {
    return 2;
  }
  if (activeStatus === "status_active_inactive") {
    return 3;
  }
  if (cardStatus === "status_card_draft" || mainStatus === "status_draft") {
    return 4;
  }
  if (mainStatus === "status_new") {
    return 5;
  }
  if (mainStatus === "status_tb_passed") {
    return 6;
  }
  if (mainStatus === "status_processed") {
    return 7;
  }
  return 8;
};

export const requiresEmployeeInMemorySort = (sortBy) =>
  [
    "position",
    "department",
    "counterparty",
    "constructionSite",
    "citizenship",
    "statusCard",
    "files",
    "status",
  ].includes(sortBy);

export const getEmployeeSortValue = (
  employee,
  sortBy,
  resolveStatusCard = () => "draft",
) => {
  switch (sortBy) {
    case "position":
      return employee?.position?.name || "";
    case "department":
      return getFirstMappingValue(employee, (mapping) => mapping?.department?.name);
    case "counterparty":
      return getFirstMappingValue(employee, (mapping) => mapping?.counterparty?.name);
    case "constructionSite":
      return getFirstMappingValue(
        employee,
        (mapping) =>
          mapping?.constructionSite?.shortName ||
          mapping?.constructionSite?.name ||
          mapping?.constructionSite?.fullName,
      );
    case "citizenship":
      return employee?.citizenship?.name || "";
    case "statusCard":
      return resolveStatusCard(employee) === "completed" ? 1 : 0;
    case "files":
      return Number(employee?.filesCount || 0);
    case "status":
      return getEmployeeStatusPriority(employee);
    default:
      return "";
  }
};

export const sortEmployeesInMemory = ({
  employees,
  sortBy,
  sortOrder,
  resolveStatusCard,
}) => {
  if (!requiresEmployeeInMemorySort(sortBy)) {
    return employees;
  }

  const direction = sortOrder === "ASC" ? 1 : -1;

  return [...employees].sort((leftEmployee, rightEmployee) => {
    const leftValue = getEmployeeSortValue(
      leftEmployee,
      sortBy,
      resolveStatusCard,
    );
    const rightValue = getEmployeeSortValue(
      rightEmployee,
      sortBy,
      resolveStatusCard,
    );

    const areNumbers =
      typeof leftValue === "number" && typeof rightValue === "number";

    if (areNumbers) {
      const numericResult = leftValue - rightValue;
      if (numericResult !== 0) {
        return numericResult * direction;
      }
    } else {
      const stringResult = sortCollator.compare(
        String(leftValue || ""),
        String(rightValue || ""),
      );
      if (stringResult !== 0) {
        return stringResult * direction;
      }
    }

    return sortCollator.compare(
      String(leftEmployee?.id || ""),
      String(rightEmployee?.id || ""),
    );
  });
};
