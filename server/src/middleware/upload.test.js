import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  MAX_FILE_SIZE_BYTES,
  validateUploadedFiles,
} from "./upload.js";

const createTempPdf = async () => {
  const filePath = path.join(
    os.tmpdir(),
    `passdesk-upload-test-${crypto.randomUUID()}.pdf`,
  );
  await fs.writeFile(filePath, Buffer.from("%PDF-1.4\n"));
  return filePath;
};

const runMiddleware = (req) =>
  new Promise((resolve) => {
    validateUploadedFiles(req, {}, (error) => resolve(error));
  });

test("validateUploadedFiles rejects empty file", { concurrency: false }, async (t) => {
  const filePath = await createTempPdf();
  t.after(async () => {
    await fs.unlink(filePath).catch(() => {});
  });

  const req = {
    file: {
      path: filePath,
      originalname: "sample.pdf",
      mimetype: "application/pdf",
      size: 0,
    },
  };

  const error = await runMiddleware(req);
  assert.equal(error?.statusCode, 400);
  assert.match(error?.message || "", /Пустой файл/);
});

test(
  "validateUploadedFiles rejects declared oversize file",
  { concurrency: false },
  async (t) => {
    const filePath = await createTempPdf();
    t.after(async () => {
      await fs.unlink(filePath).catch(() => {});
    });

    const req = {
      file: {
        path: filePath,
        originalname: "sample.pdf",
        mimetype: "application/pdf",
        size: MAX_FILE_SIZE_BYTES + 1,
      },
    };

    const error = await runMiddleware(req);
    assert.equal(error?.statusCode, 400);
    assert.match(error?.message || "", /Размер файла превышает лимит/);
  },
);

test("validateUploadedFiles accepts valid PDF metadata", { concurrency: false }, async (t) => {
  const filePath = await createTempPdf();
  t.after(async () => {
    await fs.unlink(filePath).catch(() => {});
  });

  const req = {
    file: {
      path: filePath,
      originalname: "sample.pdf",
      mimetype: "application/pdf",
      size: 1024,
    },
  };

  const error = await runMiddleware(req);
  assert.equal(error, undefined);
});
