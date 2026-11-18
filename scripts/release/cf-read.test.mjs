import { test } from "node:test";
import assert from "node:assert/strict";
import { readWithRetry } from "./cf-read.mjs";

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
