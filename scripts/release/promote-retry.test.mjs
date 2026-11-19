import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMOTE_RETRIES, promoteWithRetry, retryablePromote } from "./promote-retry.mjs";

const notFound = { status: 1, stdout: "", stderr: "The requested Worker version could not be found, please check the ID being passed and try again. [code: 100146]" };
const ok = { status: 0, stdout: "SUCCESS", stderr: "" };
const quiet = { wait: async () => {}, log: () => {} };

test("only the 'version not found yet' code is retryable", () => {
  assert.equal(retryablePromote(notFound), true);
  assert.equal(retryablePromote({ status: 1, stdout: "[code: 100146]", stderr: "" }), true);
  assert.equal(retryablePromote({ status: 1, stderr: "Authentication error [code: 10000]" }), false);
  assert.equal(retryablePromote({ status: 1, stderr: "[code: 1001460]" }), false);
  assert.equal(retryablePromote(ok), false);
  assert.equal(retryablePromote(null), false);
});

test("a not-found promote is retried until it succeeds", async () => {
  const results = [notFound, notFound, ok];
  let calls = 0;
  const result = await promoteWithRetry(() => results[calls++], quiet);
  assert.equal(calls, 3);
  assert.equal(result, ok);
});

test("the loop stops after the limit when the version never appears", async () => {
  let calls = 0;
  const waits = [];
  const result = await promoteWithRetry(() => { calls++; return notFound; }, { ...quiet, wait: async (ms) => { waits.push(ms); } });
  assert.equal(calls, PROMOTE_RETRIES + 1);
  assert.equal(result.status, 1);
  assert.ok(waits.every((ms) => ms >= 10_000), "each retry waits at least 10 s");
});

test("other promote failures are not retried", async () => {
  let calls = 0;
  await promoteWithRetry(() => { calls++; return { status: 1, stderr: "Authentication error [code: 10000]" }; }, quiet);
  assert.equal(calls, 1);
});
