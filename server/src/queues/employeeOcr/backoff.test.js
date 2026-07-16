import test from "node:test";
import assert from "node:assert/strict";

import { OCR_BACKOFF_BASE_MS, ocrBackoffStrategy } from "./backoff.js";

test("Retry-After от прокси имеет приоритет над экспонентой", () => {
  const err = { retryAfterMs: 10_000 };
  // Экспонента на первой попытке дала бы 2000 мс — это раньше, чем просит прокси.
  assert.strictEqual(ocrBackoffStrategy(1, "ocr-proxy-aware", err), 10_000);
  assert.strictEqual(ocrBackoffStrategy(3, "ocr-proxy-aware", err), 10_000);
});

test("без Retry-After — экспонента 2^(attemptsMade-1) * base", () => {
  assert.strictEqual(
    ocrBackoffStrategy(1, "ocr-proxy-aware", new Error("boom")),
    OCR_BACKOFF_BASE_MS,
  );
  assert.strictEqual(
    ocrBackoffStrategy(2, "ocr-proxy-aware", new Error("boom")),
    OCR_BACKOFF_BASE_MS * 2,
  );
  assert.strictEqual(
    ocrBackoffStrategy(3, "ocr-proxy-aware", new Error("boom")),
    OCR_BACKOFF_BASE_MS * 4,
  );
});

test("мусорный retryAfterMs не ломает backoff", () => {
  for (const retryAfterMs of [null, undefined, 0, -5, NaN, "abc"]) {
    const delay = ocrBackoffStrategy(1, "ocr-proxy-aware", { retryAfterMs });
    assert.strictEqual(
      delay,
      OCR_BACKOFF_BASE_MS,
      `retryAfterMs=${String(retryAfterMs)} должен откатываться на экспоненту`,
    );
  }
});

test("отсутствие error не роняет стратегию", () => {
  assert.strictEqual(
    ocrBackoffStrategy(1, "ocr-proxy-aware", undefined),
    OCR_BACKOFF_BASE_MS,
  );
});
