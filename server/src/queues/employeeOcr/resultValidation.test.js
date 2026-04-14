import test from "node:test";
import assert from "node:assert/strict";
import {
  getMissingRequiredOcrFields,
  assertRequiredOcrFields,
} from "./resultValidation.js";

test("snils OCR requires snils field", () => {
  const missing = getMissingRequiredOcrFields({
    documentType: "snils",
    normalized: { snils: null, lastName: "Иванов" },
  });

  assert.deepEqual(missing, ["snils"]);
});

test("snils OCR passes when snils is extracted", () => {
  const missing = getMissingRequiredOcrFields({
    documentType: "snils",
    normalized: { snils: "11223344595" },
  });

  assert.deepEqual(missing, []);
  assert.doesNotThrow(() =>
    assertRequiredOcrFields({
      documentType: "snils",
      normalized: { snils: "11223344595" },
    }),
  );
});

test("non-snils OCR has no required fields by this validator", () => {
  const missing = getMissingRequiredOcrFields({
    documentType: "passport_rf",
    normalized: {},
  });

  assert.deepEqual(missing, []);
});

test("assertRequiredOcrFields throws on missing required snils", () => {
  assert.throws(
    () =>
      assertRequiredOcrFields({
        documentType: "snils",
        normalized: { snils: "" },
      }),
    /missing required fields/i,
  );
});

