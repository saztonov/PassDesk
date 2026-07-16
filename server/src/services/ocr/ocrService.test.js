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

const idempotencyKeysOf = (calls) =>
  calls.map(([, , options]) => options.headers["X-Idempotency-Key"]);

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

    const keys = idempotencyKeysOf(stub.calls);
    assert.ok(keys.length >= firstBatchSize * 2);

    // Ключ обязан совпадать попытка-в-попытку: именно на это опирается
    // дедуп прокси при ретрае той же задачи из BullMQ.
    assert.deepStrictEqual(
      keys.slice(firstBatchSize, firstBatchSize * 2),
      keys.slice(0, firstBatchSize),
      "повтор той же задачи должен дать те же ключи попытка-в-попытку",
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

test("X-Idempotency-Key различается между попытками внутри одного вызова", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError({ fileId: "attempt-variants" });

    const keys = idempotencyKeysOf(stub.calls);
    assert.ok(keys.length >= 2, "нужно минимум две попытки для проверки");
    // strict-json и loose-json шлют разный payload (response_format), значит это
    // разные задачи — прокси не должен схлопнуть их дедупом в один вызов.
    assert.strictEqual(
      new Set(keys).size,
      keys.length,
      `у каждой попытки должен быть свой ключ, получено: ${keys.join(", ")}`,
    );
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

    const keys = idempotencyKeysOf(stub.calls);
    const keysA = keys.slice(0, splitAt);
    const keysB = keys.slice(splitAt);

    assert.strictEqual(keysA.length, keysB.length);
    keysA.forEach((keyA, idx) => {
      assert.notStrictEqual(
        keyA,
        keysB[idx],
        `X-Idempotency-Key должен различаться для разных fileId (попытка #${idx})`,
      );
    });
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

    const keys = idempotencyKeysOf(stub.calls);
    const keysA = keys.slice(0, splitAt);
    const keysB = keys.slice(splitAt);

    assert.strictEqual(keysA.length, keysB.length);
    keysA.forEach((keyA, idx) => {
      assert.notStrictEqual(
        keyA,
        keysB[idx],
        `разные imageDataUrl с одинаковым fileId=null должны давать разные ключи (защита от коллизии f:unknown, попытка #${idx})`,
      );
    });
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

    const keys = idempotencyKeysOf(stub.calls);
    assert.ok(stub.calls.length >= splitAt * 2);
    assert.deepStrictEqual(
      keys.slice(splitAt, splitAt * 2),
      keys.slice(0, splitAt),
      "одинаковые fileId+imageDataUrl должны давать те же ключи попытка-в-попытку (легитимная идемпотентность)",
    );
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

// --- Контракт прокси proxy_llm ---

test("без OCR_MODEL в payload уходит заглушка proxy, а не реальный слаг", async () => {
  setupEnv();
  delete process.env.OCR_MODEL;
  delete process.env.OCR_OPENROUTER_MODEL;
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError();
    assert.ok(stub.calls.length >= 1);

    for (const [, payload] of stub.calls) {
      assert.strictEqual(
        payload.model,
        "proxy",
        "по умолчанию модель не выбираем — прокси подставит дефолт клиента + fallback",
      );
    }
  } finally {
    stub.restore();
  }
});

test("OCR_MODEL с реальным слагом уходит как явный выбор модели", async () => {
  setupEnv();
  delete process.env.OCR_OPENROUTER_MODEL;
  process.env.OCR_MODEL = "google/gemini-2.5-flash";
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError();
    assert.ok(stub.calls.length >= 1);
    assert.strictEqual(stub.calls[0][1].model, "google/gemini-2.5-flash");
  } finally {
    stub.restore();
    delete process.env.OCR_MODEL;
  }
});

test("без OCR_OPENROUTER_ENDPOINT — ошибка конфигурации, а не запрос в openrouter.ai", async () => {
  setupEnv();
  delete process.env.OCR_OPENROUTER_ENDPOINT;
  const stub = installFailingAxiosPost();
  try {
    await assert.rejects(
      () =>
        recognizeDocument({
          documentType: "passport_rf",
          imageDataUrl: TINY_PNG_DATA_URL,
          fileId: "no-endpoint",
        }),
      /OCR_OPENROUTER_ENDPOINT/,
      "без endpoint должна быть явная ошибка конфигурации",
    );
    assert.strictEqual(
      stub.calls.length,
      0,
      "не должно быть ни одного исходящего запроса",
    );
  } finally {
    stub.restore();
  }
});

test("payload не содержит stream и полей, которые прокси вырезает", async () => {
  setupEnv();
  const stub = installFailingAxiosPost();
  try {
    await callRecognizeIgnoringError();
    assert.ok(stub.calls.length >= 1);

    for (const [, payload] of stub.calls) {
      for (const banned of [
        "stream",
        "stream_options",
        "models",
        "provider",
        "route",
        "transforms",
        "plugins",
        "debug",
      ]) {
        assert.ok(
          !(banned in payload),
          `поле ${banned} не должно уходить на прокси`,
        );
      }
    }
  } finally {
    stub.restore();
  }
});

test("400 model_not_allowed не ретраится и сообщает список разрешённых моделей", async () => {
  setupEnv();
  process.env.OCR_MODEL = "no/such-model";
  const calls = [];
  const original = axios.post;
  axios.post = async (...args) => {
    calls.push(args);
    const err = new Error("mock model_not_allowed");
    err.response = {
      status: 400,
      headers: {},
      data: {
        error: {
          code: "model_not_allowed",
          message: "model not allowed",
          allowed: ["google/gemini-2.5-flash"],
        },
      },
    };
    throw err;
  };

  try {
    await assert.rejects(
      () =>
        recognizeDocument({
          documentType: "passport_rf",
          imageDataUrl: TINY_PNG_DATA_URL,
          fileId: "model-not-allowed",
        }),
      (error) => {
        assert.match(error.message, /model_not_allowed/);
        assert.match(
          error.message,
          /google\/gemini-2\.5-flash/,
          "список allowed обязан попасть в сообщение — иначе конфиг не починить по логам",
        );
        assert.deepStrictEqual(error.allowedModels, [
          "google/gemini-2.5-flash",
        ]);
        return true;
      },
    );
    assert.strictEqual(
      calls.length,
      1,
      "это конфиг, а не сбой: перебирать остальные попытки нельзя",
    );
  } finally {
    axios.post = original;
    delete process.env.OCR_MODEL;
  }
});

test("503 queue_full прерывает перебор попыток и отдаёт Retry-After наверх", async () => {
  setupEnv();
  const calls = [];
  const original = axios.post;
  axios.post = async (...args) => {
    calls.push(args);
    const err = new Error("mock queue_full");
    err.response = {
      status: 503,
      headers: { "retry-after": "10" },
      data: { error: { code: "queue_full", message: "queue is full" } },
    };
    throw err;
  };

  try {
    await assert.rejects(
      () =>
        recognizeDocument({
          documentType: "passport_rf",
          imageDataUrl: TINY_PNG_DATA_URL,
          fileId: "queue-full",
        }),
      (error) => {
        assert.strictEqual(error.isProxyBackpressure, true);
        assert.strictEqual(error.isTransientProviderFailure, true);
        assert.strictEqual(
          error.retryAfterMs,
          10_000,
          "Retry-After: 10 → 10000 мс для backoff BullMQ",
        );
        return true;
      },
    );
    assert.strictEqual(
      calls.length,
      1,
      "очередь прокси от модели не зависит — добивать её остальными попытками нельзя",
    );
  } finally {
    axios.post = original;
  }
});

test("фактическая модель берётся из ответа прокси, а не из запроса", async () => {
  setupEnv();
  delete process.env.OCR_MODEL;
  delete process.env.OCR_OPENROUTER_MODEL;
  const original = axios.post;
  axios.post = async () => ({
    status: 200,
    headers: {
      "x-proxy-request-id": "proxy-req-1",
      "x-openrouter-request-id": "gen-abc123",
    },
    data: {
      model: "google/gemini-2.5-flash",
      choices: [{ message: { content: '{"surname":"Иванов"}' } }],
    },
  });

  try {
    const result = await recognizeDocument({
      documentType: "passport_rf",
      imageDataUrl: TINY_PNG_DATA_URL,
      fileId: "effective-model",
    });
    assert.strictEqual(
      result.model,
      "google/gemini-2.5-flash",
      "при заглушке в запросе только ответ показывает, что реально отработало",
    );
    assert.strictEqual(result.normalized.lastName, "Иванов");
  } finally {
    axios.post = original;
  }
});
