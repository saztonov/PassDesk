import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authenticate, authenticateForLogout } from "./auth.js";
import { User } from "../models/index.js";

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

const withPatchedUserFindByPk = async (implementation, fn) => {
  const original = User.findByPk;
  User.findByPk = implementation;
  try {
    return await fn();
  } finally {
    User.findByPk = original;
  }
};

const runMiddleware = (middleware, req, res = {}) =>
  new Promise((resolve) => {
    middleware(req, res, (error) => resolve(error));
  });

test(
  "authenticate rejects token with non-HS256 algorithm before DB lookup",
  { concurrency: false },
  async () =>
    withEnv(
      {
        JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
      },
      async () => {
        const token = jwt.sign({ id: "u-1" }, process.env.JWT_SECRET, {
          algorithm: "HS384",
          expiresIn: "5m",
        });
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        };

        let userLookupCalled = false;
        const error = await withPatchedUserFindByPk(async () => {
          userLookupCalled = true;
          return null;
        }, () => runMiddleware(authenticate, req));

        assert.equal(userLookupCalled, false);
        assert.equal(error?.statusCode, 401);
        assert.equal(error?.message, "Невалидный токен авторизации");
      },
    ),
);

test(
  "authenticate returns inactive-account error when user exists but not active",
  { concurrency: false },
  async () =>
    withEnv(
      {
        JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
      },
      async () => {
        const token = jwt.sign({ id: "u-2" }, process.env.JWT_SECRET, {
          algorithm: "HS256",
          expiresIn: "5m",
        });
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
            "accept-language": "ru",
          },
        };

        const error = await withPatchedUserFindByPk(
          async () => ({
            id: "u-2",
            role: "user",
            counterpartyId: null,
            isActive: false,
            isDeleted: false,
            identificationNumber: "123456",
            userLanguage: "ru",
          }),
          () => runMiddleware(authenticate, req),
        );

        assert.equal(error?.statusCode, 403);
        assert.match(error?.message || "", /не активирован/i);
      },
    ),
);

test(
  "authenticateForLogout does not fail on invalid token algorithm",
  { concurrency: false },
  async () =>
    withEnv(
      {
        JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
      },
      async () => {
        const token = jwt.sign({ id: "u-3" }, process.env.JWT_SECRET, {
          algorithm: "HS384",
          expiresIn: "5m",
        });
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        };

        const error = await runMiddleware(authenticateForLogout, req);
        assert.equal(error, undefined);
        assert.equal(req.user, undefined);
      },
    ),
);
