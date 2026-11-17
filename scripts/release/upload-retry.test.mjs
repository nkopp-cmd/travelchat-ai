import { test } from "node:test";
import assert from "node:assert/strict";
import { retryableUpload, uploadWithRetry } from "./upload-retry.mjs";

const runtimeFault = { status: 1, stdout: "", stderr: "at async _Miniflare.getBindings ... code: 'ERR_RUNTIME_FAILURE'" };
const ok = { status: 0, stdout: "Worker Version ID: 11111111-2222-3333-4444-555555555555", stderr: "" };

test("only local runtime or disk faults before a version exists are retryable", () => {
  assert.equal(retryableUpload(runtimeFault), true);
  assert.equal(retryableUpload({ status: 1, stderr: "write EDQUOT" }), true);
  assert.equal(retryableUpload({ status: 1, stderr: "Authentication error [code: 10000]" }), false);
  assert.equal(retryableUpload({ status: 1, stdout: "Worker Version ID: x", stderr: "ERR_RUNTIME_FAILURE" }), false);
  assert.equal(retryableUpload(ok), false);
});

test("a runtime fault is retried once, then the second result is returned", async () => {
  const results = [runtimeFault, ok];
  let calls = 0;
  const result = await uploadWithRetry(() => results[calls++], { wait: async () => {}, log: () => {} });
  assert.equal(calls, 2);
  assert.equal(result, ok);
});

test("the retry loop stops after the limit even when every upload fails", async () => {
  let calls = 0;
  const result = await uploadWithRetry(() => { calls++; return runtimeFault; }, { retries: 1, wait: async () => {}, log: () => {} });
  assert.equal(calls, 2);
  assert.equal(result.status, 1);
});

test("other failures are not retried", async () => {
  let calls = 0;
  await uploadWithRetry(() => { calls++; return { status: 1, stderr: "bindings error" }; }, { wait: async () => {}, log: () => {} });
  assert.equal(calls, 1);
});
