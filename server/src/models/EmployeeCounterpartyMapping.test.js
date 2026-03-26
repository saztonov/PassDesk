import test from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";

import sequelize from "../config/database.js";
import { touchEmployeesForMappings } from "./EmployeeCounterpartyMapping.js";

test("touchEmployeesForMappings updates employees by unique employee ids", async () => {
  const EmployeeModel = sequelize.models.Employee;
  const originalUpdate = EmployeeModel?.update;
  const calls = [];

  sequelize.models.Employee = {
    async update(values, options) {
      calls.push({ values, options });
      return [2];
    },
  };

  try {
    await touchEmployeesForMappings([
      { employeeId: "emp-1" },
      { employeeId: "emp-2" },
      { employeeId: "emp-1" },
      { employee_id: "emp-3" },
      {},
    ]);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].values.updatedAt instanceof Date);
    assert.deepEqual(calls[0].options.where.id[Op.in], [
      "emp-1",
      "emp-2",
      "emp-3",
    ]);
  } finally {
    sequelize.models.Employee = {
      ...(sequelize.models.Employee || {}),
      update: originalUpdate,
    };
  }
});

test("touchEmployeesForMappings skips update when employee ids are missing", async () => {
  const EmployeeModel = sequelize.models.Employee;
  const originalUpdate = EmployeeModel?.update;
  let called = false;

  sequelize.models.Employee = {
    async update() {
      called = true;
      return [0];
    },
  };

  try {
    await touchEmployeesForMappings([{}, { employeeId: null }]);
    assert.equal(called, false);
  } finally {
    sequelize.models.Employee = {
      ...(sequelize.models.Employee || {}),
      update: originalUpdate,
    };
  }
});
