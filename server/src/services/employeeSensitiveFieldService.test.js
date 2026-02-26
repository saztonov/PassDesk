import test from "node:test";
import assert from "node:assert/strict";

import { decryptField } from "./encryptionService.js";
import {
  applyLegacySensitivePlaintextPolicy,
  buildEmployeeSensitiveFieldsPatch,
} from "./employeeSensitiveFieldService.js";

const TEST_ENCRYPTION_KEYS =
  '{"v1":"MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="}';

const setEncryptionEnv = () => {
  process.env.FIELD_ENCRYPTION_ENABLED = "true";
  process.env.APP_FIELD_ENCRYPTION_KEYS = TEST_ENCRYPTION_KEYS;
  process.env.APP_FIELD_ENCRYPTION_ACTIVE_KEY_VERSION = "v1";
  process.env.APP_FIELD_HASH_PEPPER = "test-pepper-value-123";
};

const clearEncryptionEnv = () => {
  delete process.env.FIELD_ENCRYPTION_ENABLED;
  delete process.env.APP_FIELD_ENCRYPTION_KEYS;
  delete process.env.APP_FIELD_ENCRYPTION_ACTIVE_KEY_VERSION;
  delete process.env.APP_FIELD_HASH_PEPPER;
  delete process.env.FIELD_ENCRYPTION_KEEP_LEGACY_DOC_PLAINTEXT;
  delete process.env.FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT;
};

test("buildEmployeeSensitiveFieldsPatch should return empty object when encryption is disabled", () => {
  clearEncryptionEnv();
  const patch = buildEmployeeSensitiveFieldsPatch({
    lastName: "Иванов",
    passportNumber: "4015123456",
  });
  assert.deepEqual(patch, {});
});

test("buildEmployeeSensitiveFieldsPatch should generate encrypted/hash fields for provided values", () => {
  setEncryptionEnv();

  const patch = buildEmployeeSensitiveFieldsPatch({
    lastName: "Иванов",
    passportNumber: "40 15-123456",
    kig: "AB1234567",
    patentNumber: "77 №1234567890",
  });

  assert.ok(patch.lastNameEnc);
  assert.ok(patch.lastNameHash);
  assert.equal(patch.lastNameKeyVersion, "v1");

  assert.ok(patch.passportNumberEnc);
  assert.ok(patch.passportNumberHash);
  assert.equal(patch.passportNumberKeyVersion, "v1");

  assert.ok(patch.kigEnc);
  assert.ok(patch.kigHash);
  assert.equal(patch.kigKeyVersion, "v1");

  assert.ok(patch.patentNumberEnc);
  assert.ok(patch.patentNumberHash);
  assert.equal(patch.patentNumberKeyVersion, "v1");
});

test("buildEmployeeSensitiveFieldsPatch should decrypt back to original plaintext for encrypted fields", () => {
  setEncryptionEnv();

  const payload = {
    lastName: "Иванов",
    passportNumber: "4015123456",
    kig: "AB1234567",
    patentNumber: "77001234567890",
  };
  const patch = buildEmployeeSensitiveFieldsPatch(payload);

  assert.equal(
    decryptField(patch.lastNameEnc, patch.lastNameKeyVersion),
    payload.lastName,
  );
  assert.equal(
    decryptField(patch.passportNumberEnc, patch.passportNumberKeyVersion),
    payload.passportNumber,
  );
  assert.equal(decryptField(patch.kigEnc, patch.kigKeyVersion), payload.kig);
  assert.equal(
    decryptField(patch.patentNumberEnc, patch.patentNumberKeyVersion),
    payload.patentNumber,
  );
});

test("buildEmployeeSensitiveFieldsPatch should clear enc/hash/keyVersion for empty values", () => {
  setEncryptionEnv();

  const patch = buildEmployeeSensitiveFieldsPatch({
    passportNumber: "",
    kig: null,
  });

  assert.equal(patch.passportNumberEnc, null);
  assert.equal(patch.passportNumberHash, null);
  assert.equal(patch.passportNumberKeyVersion, null);

  assert.equal(patch.kigEnc, null);
  assert.equal(patch.kigHash, null);
  assert.equal(patch.kigKeyVersion, null);
});

test("applyLegacySensitivePlaintextPolicy should clear legacy plaintext by default", () => {
  setEncryptionEnv();
  delete process.env.FIELD_ENCRYPTION_KEEP_LEGACY_DOC_PLAINTEXT;
  delete process.env.FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT;

  const payload = {
    lastName: "Иванов",
    passportNumber: "4015123456",
    kig: "AB1234567",
    patentNumber: "7700123",
  };
  const patched = applyLegacySensitivePlaintextPolicy(payload);

  assert.equal(patched.lastName, null);
  assert.equal(patched.passportNumber, null);
  assert.equal(patched.kig, null);
  assert.equal(patched.patentNumber, null);
});

test("applyLegacySensitivePlaintextPolicy should keep doc plaintext when enabled by env", () => {
  setEncryptionEnv();
  process.env.FIELD_ENCRYPTION_KEEP_LEGACY_DOC_PLAINTEXT = "true";

  const payload = {
    lastName: "Иванов",
    passportNumber: "4015123456",
    kig: "AB1234567",
    patentNumber: "7700123",
  };
  const patched = applyLegacySensitivePlaintextPolicy(payload);

  assert.deepEqual(patched, payload);
});

test("applyLegacySensitivePlaintextPolicy should support common legacy plaintext flag", () => {
  setEncryptionEnv();
  process.env.FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT = "false";

  const payload = {
    lastName: "Сидоров",
    passportNumber: "4015123456",
  };
  const patched = applyLegacySensitivePlaintextPolicy(payload);

  assert.equal(patched.lastName, null);
  assert.equal(patched.passportNumber, null);
});
