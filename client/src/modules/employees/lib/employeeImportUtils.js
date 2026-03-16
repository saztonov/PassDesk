export const buildEmployeesForImport = ({
  validEmployees = [],
  conflictingInns = [],
  conflictResolutions = {},
  fileData = [],
}) => {
  const employees = [...validEmployees];

  conflictingInns.forEach((conflict) => {
    if (conflictResolutions[conflict.inn] !== "update") {
      return;
    }

    const source = fileData.find((employee) => {
      const leftInn = String(employee.inn || "").replace(/\s/g, "");
      const rightInn = String(conflict.inn || "").replace(/\s/g, "");
      return leftInn === rightInn;
    });

    if (source) {
      employees.push({
        ...source,
        ...conflict.newEmployee,
        counterpartyInn: source.counterpartyInn,
        counterpartyKpp: source.counterpartyKpp,
      });
      return;
    }

    employees.push(conflict.newEmployee);
  });

  return employees;
};

export const resolveAllConflictResolutions = (
  conflictingInns = [],
  resolution = "skip",
) => {
  return conflictingInns.reduce((accumulator, conflict) => {
    accumulator[conflict.inn] = resolution;
    return accumulator;
  }, {});
};

export const calculateTotalEmployeesForImport = ({
  validEmployees = [],
  conflictingInns = [],
  conflictResolutions = {},
}) => {
  let total = validEmployees.length;

  conflictingInns.forEach((conflict) => {
    if (conflictResolutions[conflict.inn] === "update") {
      total += 1;
    }
  });

  return total;
};
