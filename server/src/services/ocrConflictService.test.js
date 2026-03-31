import test from "node:test";
import assert from "node:assert/strict";

import { applyEmployeeOcrConflict } from "./ocrConflictService.js";
import { EmployeeOcrConflict, sequelize } from "../models/index.js";

const stubMethod = (target, methodName, impl, restoreStack) => {
  const original = target[methodName];
  target[methodName] = impl;
  restoreStack.push(() => {
    target[methodName] = original;
  });
};

test("applyEmployeeOcrConflict normalizes phone value to model format", async () => {
  const restoreStack = [];

  try {
    const cases = [
      { input: "+7 (912) 345-67-89", expected: "+79123456789" },
      { input: "8 (912) 345-67-89", expected: "+79123456789" },
      { input: "9123456789", expected: "+79123456789" },
    ];

    for (const testCase of cases) {
      let employeeUpdatePayload = null;
      let conflictUpdatePayload = null;

      const conflictRecord = {
        id: `conflict-${testCase.input}`,
        fieldName: "phone",
        ocrValue: testCase.input,
        metadata: {},
        employee: {
          id: "employee-1",
          update: async (payload) => {
            employeeUpdatePayload = payload;
          },
        },
        update: async (payload) => {
          conflictUpdatePayload = payload;
        },
      };

      stubMethod(
        EmployeeOcrConflict,
        "findByPk",
        async () => conflictRecord,
        restoreStack,
      );

      const result = await applyEmployeeOcrConflict({
        conflictId: conflictRecord.id,
        resolvedBy: "user-1",
      });

      assert.equal(employeeUpdatePayload.phone, testCase.expected);
      assert.equal(employeeUpdatePayload.updatedBy, "user-1");
      assert.equal(result.appliedPatch.phone, testCase.expected);
      assert.equal(conflictUpdatePayload.status, "resolved");
    }
  } finally {
    while (restoreStack.length > 0) {
      restoreStack.pop()();
    }

    await sequelize.close();
  }
});
