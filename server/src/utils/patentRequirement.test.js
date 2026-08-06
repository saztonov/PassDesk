import test from "node:test";
import assert from "node:assert/strict";
import {
  doesCitizenshipRequirePatent,
  doesEmployeeRequirePatent,
  RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES,
} from "./patentRequirement.js";
import {
  DEFAULT_FORM_CONFIG,
  getMissingRequiredFields,
  isEmployeeCardComplete,
} from "./employeeFieldsConfig.js";

const PATENT_CITIZENSHIP = {
  id: "uzb",
  name: "Узбекистан",
  requiresPatent: true,
  isEaeu: false,
};

// Заполнено всё, что DEFAULT_FORM_CONFIG считает обязательным, кроме патента и КИГ.
const buildEmployeeWithoutPatent = (overrides = {}) => ({
  lastName: "Иванов",
  firstName: "Иван",
  inn: "123456789012",
  citizenship: PATENT_CITIZENSHIP,
  citizenshipId: PATENT_CITIZENSHIP.id,
  birthDate: "1990-01-01",
  snils: "12345678901",
  passportNumber: "AB1234567",
  passportDate: "2020-01-01",
  passportIssuer: "МВД",
  passportType: "foreign",
  passportExpiryDate: "2030-01-01",
  kig: null,
  kigEndDate: null,
  patentNumber: null,
  patentIssueDate: null,
  blankNumber: null,
  hasResidencePermit: false,
  ...overrides,
});

test("гражданство определяет требование патента без учёта сотрудника", () => {
  assert.equal(doesCitizenshipRequirePatent(PATENT_CITIZENSHIP), true);
  assert.equal(
    doesCitizenshipRequirePatent({ requiresPatent: false, isEaeu: false }),
    false,
  );
  assert.equal(
    doesCitizenshipRequirePatent({ requiresPatent: true, isEaeu: true }),
    false,
  );
});

test("ВНЖ снимает требование патента у патентного гражданства", () => {
  assert.equal(
    doesEmployeeRequirePatent({
      citizenship: PATENT_CITIZENSHIP,
      hasResidencePermit: false,
    }),
    true,
  );
  assert.equal(
    doesEmployeeRequirePatent({
      citizenship: PATENT_CITIZENSHIP,
      hasResidencePermit: true,
    }),
    false,
  );
});

test("отсутствие флага ВНЖ не меняет прежнее поведение", () => {
  assert.equal(doesEmployeeRequirePatent({ citizenship: PATENT_CITIZENSHIP }), true);
  assert.equal(doesEmployeeRequirePatent({}), true);
});

test("без ВНЖ карточка без патента остаётся незаполненной", () => {
  const employee = buildEmployeeWithoutPatent();

  assert.equal(isEmployeeCardComplete(employee, DEFAULT_FORM_CONFIG), false);

  const missing = getMissingRequiredFields(employee, DEFAULT_FORM_CONFIG);
  assert.ok(missing.includes("patentNumber"));
  assert.ok(missing.includes("patentIssueDate"));
  assert.ok(missing.includes("blankNumber"));
});

test("с ВНЖ карточка без патента и КИГ считается заполненной", () => {
  const employee = buildEmployeeWithoutPatent({ hasResidencePermit: true });

  assert.equal(
    getMissingRequiredFields(employee, DEFAULT_FORM_CONFIG).join(", "),
    "",
  );
  assert.equal(isEmployeeCardComplete(employee, DEFAULT_FORM_CONFIG), true);
});

test("сам чекбокс ВНЖ не становится новым обязательным полем", () => {
  assert.equal(DEFAULT_FORM_CONFIG.hasResidencePermit.required, false);
  assert.equal(DEFAULT_FORM_CONFIG.hasResidencePermit.visible, true);
});

test("для ВНЖ исключаются сканы патента и КИГ", () => {
  assert.deepEqual(RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES, [
    "patent_front",
    "patent_back",
    "patent_payment_receipt",
    "kig",
    "kig_back",
  ]);
});
