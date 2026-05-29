import test from "node:test";
import assert from "node:assert/strict";
import {
  getMissingRequiredOcrFields,
  assertRequiredOcrFields,
  passesPassportTranslationQualityGate,
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

test("passport_translation quality gate: ФИО без якорей не проходит", () => {
  assert.strictEqual(
    passesPassportTranslationQualityGate({
      lastName: "Иванов",
      firstName: "Иван",
      middleName: "Иванович",
    }),
    false,
  );
});

test("passport_translation quality gate: ФИО + birthDate проходит", () => {
  assert.strictEqual(
    passesPassportTranslationQualityGate({
      lastName: "Иванов",
      firstName: "Иван",
      birthDate: "1990-01-01",
    }),
    true,
  );
});

test("passport_translation quality gate: ФИО + passportNumber проходит", () => {
  assert.strictEqual(
    passesPassportTranslationQualityGate({
      lastName: "Абдурахманов",
      firstName: "Алишер",
      passportNumber: "AB1234567",
    }),
    true,
  );
});

test("passport_translation quality gate: только lastName без firstName не проходит", () => {
  assert.strictEqual(
    passesPassportTranslationQualityGate({
      lastName: "Иванов",
      birthDate: "1990-01-01",
      passportNumber: "AB1234567",
    }),
    false,
  );
});

test("passport_translation quality gate: пустой/невалидный input не проходит", () => {
  assert.strictEqual(passesPassportTranslationQualityGate(null), false);
  assert.strictEqual(passesPassportTranslationQualityGate({}), false);
  assert.strictEqual(passesPassportTranslationQualityGate("not an object"), false);
});

test("getMissingRequiredOcrFields для passport_translation возвращает quality-маркер при провале gate", () => {
  const missing = getMissingRequiredOcrFields({
    documentType: "passport_translation",
    normalized: { lastName: "Иванов", firstName: "Иван" },
  });
  assert.deepEqual(missing, ["passport_translation_quality"]);
});

test("getMissingRequiredOcrFields для passport_translation проходит когда gate ok", () => {
  const missing = getMissingRequiredOcrFields({
    documentType: "passport_translation",
    normalized: {
      lastName: "Иванов",
      firstName: "Иван",
      birthDate: "1990-01-01",
    },
  });
  assert.deepEqual(missing, []);
});

