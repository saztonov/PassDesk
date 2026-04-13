import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  issueFileProxyToken,
  verifyFileProxyToken,
} from "./fileDownloadTokenService.js";

const withEnv = (values, fn) => {
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
    return fn();
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

test("file proxy token should issue and verify payload", { concurrency: false }, () =>
  withEnv(
    {
      JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
      FILE_PROXY_TOKEN_TTL_SECONDS: "120",
    },
    () => {
      const token = issueFileProxyToken({
        fileId: "f-1",
        disposition: "inline",
      });
      const payload = verifyFileProxyToken(token);
      assert.equal(payload.fileId, "f-1");
      assert.equal(payload.disposition, "inline");
    },
  ));

test("file proxy token should reject non-HS256 algorithm", { concurrency: false }, () =>
  withEnv(
    {
      JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
    },
    () => {
      const token = jwt.sign(
        {
          purpose: "file_proxy_download",
          fileId: "f-1",
          disposition: "attachment",
        },
        process.env.JWT_SECRET,
        {
          algorithm: "HS384",
          issuer: "passdesk-file-proxy",
          subject: "f-1",
          expiresIn: 60,
        },
      );

      assert.throws(() => verifyFileProxyToken(token));
    },
  ));

test("file proxy token should reject payload with wrong purpose", { concurrency: false }, () =>
  withEnv(
    {
      JWT_SECRET: "test_jwt_secret_test_jwt_secret_32chars",
    },
    () => {
      const token = jwt.sign(
        {
          purpose: "other",
          fileId: "f-1",
          disposition: "attachment",
        },
        process.env.JWT_SECRET,
        {
          algorithm: "HS256",
          issuer: "passdesk-file-proxy",
          subject: "f-1",
          expiresIn: 60,
        },
      );

      assert.throws(
        () => verifyFileProxyToken(token),
        /Invalid file proxy token payload/,
      );
    },
  ));
