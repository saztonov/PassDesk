export const formatKigDisplay = (kig) => {
  if (!kig) return "-";

  if (kig.includes(" ")) {
    return kig;
  }

  const cleaned = kig.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (/^\d{10,16}$/.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2)}`;
  }

  return kig;
};

const getStatusNameByGroup = (employee, group) => {
  const mapping = employee.statusMappings?.find(
    (item) => item.statusGroup === group || item.status_group === group,
  );
  return mapping?.status?.name;
};

export const isEmployeeBlockedBySecureStatus = (employee) => {
  const secureStatusName = getStatusNameByGroup(employee, "status_secure");
  return (
    secureStatusName === "status_secure_block" ||
    secureStatusName === "status_secure_block_compl"
  );
};

export const isEmployeeBlockCompleted = (employee) => {
  const secureStatusName = getStatusNameByGroup(employee, "status_secure");
  return secureStatusName === "status_secure_block_compl";
};

export const matchesSecurityStatusFilters = (employee, filters = []) => {
  if (!filters.length) {
    return true;
  }

  const statusName = getStatusNameByGroup(employee, "status");
  const secureStatusName = getStatusNameByGroup(employee, "status_secure");

  return filters.some((filter) => {
    if (filter === "tb_passed") {
      return (
        statusName === "status_tb_passed" || statusName === "status_processed"
      );
    }
    if (filter === "tb_not_passed") {
      return statusName === "status_new";
    }
    if (filter === "not_blocked") {
      return secureStatusName === "status_secure_allow" || !secureStatusName;
    }
    if (filter === "blocked") {
      return (
        secureStatusName === "status_secure_block" ||
        secureStatusName === "status_secure_block_compl"
      );
    }
    return false;
  });
};
