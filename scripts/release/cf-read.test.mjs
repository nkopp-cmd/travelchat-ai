import { test } from "node:test";
import assert from "node:assert/strict";
import { READ_RETRIES, readWithRetry, retryDelay } from "./cf-read.mjs";

const quiet = { wait: async () => {}, log: () => {} };

test("a read that is not ready yet succeeds on a later attempt", async () => {
  const bodies = [{ success: false, errors: [{ code: 10007 }] }, { success: true, result: { id: "v" } }];
  let calls = 0;
  const result = await readWithRetry(async () => bodies[calls++], quiet);
  assert.equal(calls, 2);
  assert.deepEqual(result, { id: "v" });
});

test("network errors are retried too", async () => {
  let calls = 0;
  const result = await readWithRetry(async () => { if (calls++ === 0) throw new Error("timeout"); return { success: true, result: 1 }; }, quiet);
  assert.equal(result, 1);
});

test("the loop stops after the retry limit and throws", async () => {
  let calls = 0;
  await assert.rejects(readWithRetry(async () => { calls++; return { success: false }; }, { ...quiet, retries: 3, label: "/x" }), /Cloudflare read failed: \/x/);
  assert.equal(calls, 4);
});

test("pauses grow 5, 10, 20, 30 s and stay at 30 s; the default budget covers several minutes but stays bounded", async () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => retryDelay(n)), [5_000, 10_000, 20_000, 30_000, 30_000]);
  const pauses = [];
  let calls = 0;
  await assert.rejects(readWithRetry(async () => { calls++; return { success: false }; }, { wait: async (ms) => { pauses.push(ms); }, log: () => {} }));
  assert.equal(calls, READ_RETRIES + 1);
  const total = pauses.reduce((sum, ms) => sum + ms, 0);
  assert.ok(total >= 180_000 && total <= 300_000, `total pause ${total} ms`);
});
