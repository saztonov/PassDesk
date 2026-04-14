import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  issueFileProxyToken,
  verifyFileProxyToken,
  buildFileProxyRequesterFingerprint,
  buildFileProxyUrl,
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
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
      FILE_PROXY_TOKEN_TTL_SECONDS: "120",
    },
    () => {
      const token = issueFileProxyToken({
        fileId: "f-1",
        disposition: "inline",
        requestedByUserId: "u-1",
        requesterFingerprint: "fp-1",
      });
      const payload = verifyFileProxyToken(token, {
        requesterFingerprint: "fp-1",
      });
      assert.equal(payload.fileId, "f-1");
      assert.equal(payload.disposition, "inline");
      assert.equal(payload.requestedByUserId, "u-1");
    },
  ));

test("file proxy token should reject non-HS256 algorithm", { concurrency: false }, () =>
  withEnv(
    {
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
    },
    () => {
      const token = jwt.sign(
        {
          purpose: "file_proxy_download",
          fileId: "f-1",
          disposition: "attachment",
          requesterFingerprint: "fp-1",
        },
        process.env.FILE_PROXY_JWT_SECRET,
        {
          algorithm: "HS384",
          issuer: "passdesk-file-proxy",
          subject: "f-1",
          expiresIn: 60,
        },
      );

      assert.throws(() =>
        verifyFileProxyToken(token, {
          requesterFingerprint: "fp-1",
        }),
      );
    },
  ));

test("file proxy token should reject payload with wrong purpose", { concurrency: false }, () =>
  withEnv(
    {
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
    },
    () => {
      const token = jwt.sign(
        {
          purpose: "other",
          fileId: "f-1",
          disposition: "attachment",
          requesterFingerprint: "fp-1",
        },
        process.env.FILE_PROXY_JWT_SECRET,
        {
          algorithm: "HS256",
          issuer: "passdesk-file-proxy",
          subject: "f-1",
          expiresIn: 60,
        },
      );

      assert.throws(
        () =>
          verifyFileProxyToken(token, {
            requesterFingerprint: "fp-1",
          }),
        /Invalid file proxy token payload/,
      );
    },
  ));

test("file proxy token should reject mismatched requester fingerprint", { concurrency: false }, () =>
  withEnv(
    {
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
    },
    () => {
      const token = issueFileProxyToken({
        fileId: "f-2",
        disposition: "attachment",
        requestedByUserId: "u-2",
        requesterFingerprint: "fp-original",
      });

      assert.throws(
        () =>
          verifyFileProxyToken(token, {
            requesterFingerprint: "fp-other",
          }),
        /requester fingerprint mismatch/,
      );
    },
  ));

test("file proxy token should require requestedByUserId", { concurrency: false }, () =>
  withEnv(
    {
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
    },
    () => {
      assert.throws(
        () =>
          issueFileProxyToken({
            fileId: "f-3",
            requesterFingerprint: "fp-3",
          }),
        /requestedByUserId is required/,
      );
    },
  ));

test("file proxy URL should embed token in path", { concurrency: false }, () =>
  withEnv(
    {
      FILE_PROXY_JWT_SECRET: "test_file_proxy_secret_test_file_proxy_32",
      API_VERSION: "v1",
    },
    () => {
      const req = {
        protocol: "https",
        headers: {
          host: "example.test",
          "x-forwarded-for": "203.0.113.7",
          "user-agent": "Mozilla/5.0",
        },
        user: {
          id: "u-7",
        },
        get(headerName) {
          return this.headers[String(headerName).toLowerCase()];
        },
      };

      const url = buildFileProxyUrl(req, "f-7", "attachment");
      assert.match(
        url,
        /^https:\/\/example\.test\/api\/v1\/files\/proxy\/f-7\/[^/?#]+$/,
      );
      assert.equal(url.includes("?token="), false);
    },
  ));

test("file proxy token should require dedicated secret in production", { concurrency: false }, () =>
  withEnv(
    {
      NODE_ENV: "production",
      FILE_PROXY_JWT_SECRET: undefined,
      FILE_PROXY_ALLOW_LEGACY_JWT_SECRET: undefined,
      JWT_SECRET: "legacy_jwt_secret_that_is_long_enough_123456",
    },
    () => {
      assert.throws(
        () =>
          issueFileProxyToken({
            fileId: "f-prod",
            requestedByUserId: "u-prod",
            requesterFingerprint: "fp-prod",
          }),
        /FILE_PROXY_JWT_SECRET/,
      );
    },
  ));

test("file proxy should build stable requester fingerprint from request", { concurrency: false }, () => {
  const req = {
    headers: {
      "x-forwarded-for": "198.51.100.10, 10.0.0.1",
      "user-agent": "Mozilla/5.0 Test Browser",
    },
    get(headerName) {
      return this.headers[String(headerName).toLowerCase()];
    },
    ip: "10.0.0.2",
  };

  const fingerprintA = buildFileProxyRequesterFingerprint(req);
  const fingerprintB = buildFileProxyRequesterFingerprint(req);

  assert.equal(fingerprintA, fingerprintB);
  assert.equal(typeof fingerprintA, "string");
  assert.equal(fingerprintA.length, 64);
});
