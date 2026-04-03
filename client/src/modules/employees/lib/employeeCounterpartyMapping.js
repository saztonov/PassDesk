const toDateTimestamp = (value) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getMappingRecencyTimestamp = (mapping) =>
  Math.max(
    toDateTimestamp(mapping?.updatedAt || mapping?.updated_at),
    toDateTimestamp(mapping?.createdAt || mapping?.created_at),
  );

export const resolvePreferredEmployeeCounterpartyMapping = (employee) => {
  const mappings = Array.isArray(employee?.employeeCounterpartyMappings)
    ? employee.employeeCounterpartyMappings
    : [];

  if (mappings.length === 0) {
    return null;
  }

  const activeMappings = mappings.filter((mapping) => !mapping?.dismissedAt);
  const pool = activeMappings.length > 0 ? activeMappings : mappings;

  return [...pool].sort(
    (left, right) =>
      getMappingRecencyTimestamp(right) - getMappingRecencyTimestamp(left),
  )[0];
};

