import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";

import { recognizeDocument } from "./ocrService.js";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const setupEnv = () => {
  process.env.OCR_ENABLED = "true";
  process.env.OCR_PROVIDER = "openrouter";
  process.env.OCR_API_KEY = "test-token";
  process.env.OCR_OPENROUTER_ENDPOINT =
    "https://proxy.test/api/v1/chat/completions";
  process.env.OCR_OPENROUTER_MODEL = "test-model";
  process.env.OCR_IDEMPOTENCY_VERSION = "v1";
  process.env.OCR_PASSPORT_RF_PROMPT = "test prompt passport_rf";
  process.env.OCR_SNILS_PROMPT = "test prompt snils";
  process.env.OCR_REQUEST_TIMEOUT_MS = "1000";
  delete process.env.OCR_FALLBACK_MODEL;
  delete process.env.OCR_OPENROUTER_FALLBACK_MODEL;
  delete process.env.OCR_OPENROUTER_HTTP_REFERER;
  delete process.env.OCR_OPENROUTER_APP_TITLE;
};

const installFailingAxiosPost = () => {
  const calls = [];
  const original = axios.post;
  axios.post = async (...args) => {
    calls.push(args);
    const err = new Error("mock provider failure");
    err.response = {
      status: 500,
      data: { error: { message: "mock failure" } },
    };
    throw err;
  };
  return {
    calls,
    restore: () => {
      axios.post = original;
    },
  };
};

const callRecognizeIgnoringError = async (overrides = {}) => {
  try {
    await recognizeDocument({
      documentType: "passport_rf",
      imageDataUrl: TINY_PNG_DATA_URL,
      fileId: "file-default",
      ...overrides,
    });
  } catch {
    // ожидаемо — все мок-вызовы axios бросают
  }
};

test("postOpenRouterPayload генерирует уникальный X-Request-Id для каждой HTTP-попытки", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError();

    assert.ok(
      stub.calls.length >= 2,
      `ожидалось ≥2 axios.post-попыток, было ${stub.calls.length}`,
    );

    const requestIds = stub.calls.map(
      ([, , options]) => options.headers["X-Request-Id"],
    );
    requestIds.forEach((id, idx) => {
      assert.match(
        String(id || ""),
        UUID_V4_RE,
        `X-Request-Id на попытке #${idx} должен быть UUID`,
      );
    });
    assert.strictEqual(
      new Set(requestIds).size,
      requestIds.length,
      "все X-Request-Id должны быть уникальны",
    );
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key стабилен между двумя вызовами recognizeDocument с одинаковыми входами", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError({ fileId: "stable-file" });
    const firstBatchSize = stub.calls.length;
    await callRecognizeIgnoringError({ fileId: "stable-file" });

    const keys = stub.calls.map(
      ([, , options]) => options.headers["X-Idempotency-Key"],
    );
    assert.ok(keys.length >= firstBatchSize * 2);
    assert.strictEqual(
      new Set(keys).size,
      1,
      `X-Idempotency-Key должен быть один на все вызовы, получено: ${[
        ...new Set(keys),
      ].join(", ")}`,
    );
    keys.forEach((key) => {
      assert.match(
        String(key || ""),
        /^[0-9a-f]{64}$/,
        "X-Idempotency-Key должен быть hex sha256 (64 символа)",
      );
    });
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key различается при смене fileId", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError({ fileId: "file-A" });
    const splitAt = stub.calls.length;
    await callRecognizeIgnoringError({ fileId: "file-B" });

    const keysA = new Set(
      stub.calls
        .slice(0, splitAt)
        .map(([, , options]) => options.headers["X-Idempotency-Key"]),
    );
    const keysB = new Set(
      stub.calls
        .slice(splitAt)
        .map(([, , options]) => options.headers["X-Idempotency-Key"]),
    );

    assert.strictEqual(keysA.size, 1);
    assert.strictEqual(keysB.size, 1);
    assert.notStrictEqual(
      [...keysA][0],
      [...keysB][0],
      "X-Idempotency-Key должен различаться для разных fileId",
    );
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key различается при смене OCR_IDEMPOTENCY_VERSION", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    process.env.OCR_IDEMPOTENCY_VERSION = "v1";
    await callRecognizeIgnoringError({ fileId: "version-test" });
    const splitAt = stub.calls.length;
    process.env.OCR_IDEMPOTENCY_VERSION = "v2";
    await callRecognizeIgnoringError({ fileId: "version-test" });

    const keyV1 = stub.calls[0][2].headers["X-Idempotency-Key"];
    const keyV2 = stub.calls[splitAt][2].headers["X-Idempotency-Key"];
    assert.notStrictEqual(
      keyV1,
      keyV2,
      "bump OCR_IDEMPOTENCY_VERSION обязан менять ключ",
    );
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key различается при разных documentType", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError({
      fileId: "doctype-test",
      documentType: "passport_rf",
    });
    const splitAt = stub.calls.length;
    await callRecognizeIgnoringError({
      fileId: "doctype-test",
      documentType: "snils",
    });

    const keyPassport = stub.calls[0][2].headers["X-Idempotency-Key"];
    const keySnils = stub.calls[splitAt][2].headers["X-Idempotency-Key"];
    assert.notStrictEqual(
      keyPassport,
      keySnils,
      "разные documentType должны давать разные idempotency-ключи",
    );
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key различается при разных imageDataUrl даже без fileId", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  const ALT_PNG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  try {
    await callRecognizeIgnoringError({
      fileId: null,
      imageDataUrl: TINY_PNG_DATA_URL,
    });
    const splitAt = stub.calls.length;
    await callRecognizeIgnoringError({
      fileId: null,
      imageDataUrl: ALT_PNG_DATA_URL,
    });

    const keysA = new Set(
      stub.calls
        .slice(0, splitAt)
        .map(([, , options]) => options.headers["X-Idempotency-Key"]),
    );
    const keysB = new Set(
      stub.calls
        .slice(splitAt)
        .map(([, , options]) => options.headers["X-Idempotency-Key"]),
    );

    assert.strictEqual(keysA.size, 1);
    assert.strictEqual(keysB.size, 1);
    assert.notStrictEqual(
      [...keysA][0],
      [...keysB][0],
      "разные imageDataUrl с одинаковым fileId=null должны давать разные ключи (защита от коллизии f:unknown)",
    );
  } finally {
    stub.restore();
  }
});

test("X-Idempotency-Key стабилен при одинаковом imageDataUrl и fileId", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError({
      fileId: "stable-file",
      imageDataUrl: TINY_PNG_DATA_URL,
    });
    const splitAt = stub.calls.length;
    await callRecognizeIgnoringError({
      fileId: "stable-file",
      imageDataUrl: TINY_PNG_DATA_URL,
    });

    const allKeys = new Set(
      stub.calls.map(([, , options]) => options.headers["X-Idempotency-Key"]),
    );
    assert.strictEqual(
      allKeys.size,
      1,
      "одинаковые fileId+imageDataUrl должны давать один ключ (легитимная идемпотентность)",
    );
    assert.ok(stub.calls.length >= splitAt * 2);
  } finally {
    stub.restore();
  }
});

test("axios.post идёт в OCR_OPENROUTER_ENDPOINT с Authorization Bearer OCR_API_KEY", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError();
    assert.ok(stub.calls.length >= 1);
    const [url, , options] = stub.calls[0];
    assert.strictEqual(
      url,
      "https://proxy.test/api/v1/chat/completions",
      "endpoint должен быть взят из OCR_OPENROUTER_ENDPOINT",
    );
    assert.strictEqual(options.headers.Authorization, "Bearer test-token");
    assert.ok(
      !String(url).includes("openrouter.ai"),
      "запросы НЕ должны идти на openrouter.ai",
    );
  } finally {
    stub.restore();
  }
});
