import test from "node:test";
import assert from "node:assert/strict";
import { ensureQuickQrReleaseGate } from "./mobileEmployeeAccess.routes.js";
import { AppError } from "../middleware/errorHandler.js";

const withEnv = async (values, fn) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const runMiddleware = (middleware) =>
  new Promise((resolve) => {
    middleware({}, {}, (error) => resolve(error));
  });

test("quick-qr gate blocks requests when flag disabled", async () =>
  withEnv({ MOBILE_ACCESS_QUICK_QR_RELEASED: "false" }, async () => {
    const error = await runMiddleware(ensureQuickQrReleaseGate);
    assert.ok(error instanceof AppError);
    assert.equal(error?.statusCode, 403);
  }),
);

test("quick-qr gate allows requests when flag enabled", async () =>
  withEnv({ MOBILE_ACCESS_QUICK_QR_RELEASED: "true" }, async () => {
    const error = await runMiddleware(ensureQuickQrReleaseGate);
    assert.equal(error, undefined);
  }),
);
