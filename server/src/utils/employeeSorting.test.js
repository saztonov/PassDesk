import test from "node:test";
import assert from "node:assert/strict";
import {
  getEmployeeStatusPriority,
  requiresEmployeeInMemorySort,
  sortEmployeesInMemory,
} from "./employeeSorting.js";

test("requires in-memory sorting for mapping and computed fields", () => {
  assert.equal(requiresEmployeeInMemorySort("fullName"), true);
  assert.equal(requiresEmployeeInMemorySort("counterparty"), true);
  assert.equal(requiresEmployeeInMemorySort("files"), true);
  assert.equal(requiresEmployeeInMemorySort("createdAt"), false);
});

test("sorts employees by full name in memory", () => {
  const employees = [
    { id: "2", firstName: "Иван", lastName: "Яковлев", middleName: "Петрович" },
    { id: "1", firstName: "Иван", lastName: "Абаев", middleName: "Петрович" },
  ];

  const sorted = sortEmployeesInMemory({
    employees,
    sortBy: "fullName",
    sortOrder: "ASC",
  });

  assert.deepEqual(
    sorted.map((employee) => employee.id),
    ["1", "2"],
  );
});

test("sorts employees by counterparty using active mappings first", () => {
  const employees = [
    {
      id: "2",
      employeeCounterpartyMappings: [
        { counterparty: { name: "Бета" }, dismissedAt: null },
      ],
    },
    {
      id: "1",
      employeeCounterpartyMappings: [
        { counterparty: { name: "Альфа" }, dismissedAt: null },
      ],
    },
  ];

  const sorted = sortEmployeesInMemory({
    employees,
    sortBy: "counterparty",
    sortOrder: "ASC",
  });

  assert.deepEqual(
    sorted.map((employee) => employee.id),
    ["1", "2"],
  );
});

test("sorts employees by status card using resolver", () => {
  const employees = [
    { id: "2" },
    { id: "1" },
  ];

  const sorted = sortEmployeesInMemory({
    employees,
    sortBy: "statusCard",
    sortOrder: "DESC",
    resolveStatusCard: (employee) =>
      employee.id === "1" ? "completed" : "draft",
  });

  assert.deepEqual(
    sorted.map((employee) => employee.id),
    ["1", "2"],
  );
});

test("calculates status priority like employee table", () => {
  assert.equal(
    getEmployeeStatusPriority({
      statusMappings: [
        {
          statusGroup: "status_active",
          isActive: true,
          status: { name: "status_active_fired" },
        },
      ],
    }),
    2,
  );
});
