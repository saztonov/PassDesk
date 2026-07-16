export const OCR_BACKOFF_TYPE = "ocr-proxy-aware";
export const OCR_BACKOFF_BASE_MS = 2000;

// Воркер OCR — внешний слой ретрая поверх прокси proxy_llm: сам прокси делает до
// двух upstream-попыток внутри своего дедлайна, а сюда доходят queue_full и
// deadline_exceeded. На queue_full/dedup_full прокси присылает Retry-After —
// ретраить раньше бессмысленно, очередь всё ещё переполнена. Иначе экспонента,
// как во встроенной стратегии BullMQ: 2^(attemptsMade-1) * delay.
export const ocrBackoffStrategy = (attemptsMade, _type, err) => {
  const retryAfterMs = Number(err?.retryAfterMs);
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }

  return Math.round(2 ** Math.max(0, attemptsMade - 1) * OCR_BACKOFF_BASE_MS);
};
