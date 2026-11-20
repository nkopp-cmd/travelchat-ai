import { test } from "node:test";
import assert from "node:assert/strict";
import { DEADLINE_MS, FAST_MS, MAX_REQUESTS, NEEDED_FAST, warmUp } from "./warm-up.mjs";

const noWait = async () => {};
const urls = ["https://example.test/a", "https://example.test/b"];

test("stops as soon as enough consecutive answers are fast", async () => {
  const times = [1300, 900, ...Array(20).fill(40)];
  let i = 0;
  const result = await warmUp(urls, { timed: async () => times[i++], wait: noWait });
  assert.equal(result.warm, true);
  assert.equal(result.requests, 2 + NEEDED_FAST * urls.length);
  assert.equal(result.slowest, 1300);
});

test("a slow answer resets the fast run", async () => {
  const times = [40, 40, 40, 900, ...Array(20).fill(40)];
  let i = 0;
  const result = await warmUp(urls, { timed: async () => times[i++], wait: noWait });
  assert.equal(result.requests, 4 + NEEDED_FAST * urls.length);
});

test("never more than MAX_REQUESTS when the Worker stays slow", async () => {
  let calls = 0;
  const result = await warmUp(urls, { timed: async () => { calls++; return FAST_MS + 1; }, wait: noWait });
  assert.deepEqual([result.warm, calls], [false, MAX_REQUESTS]);
});

test("errors count as slow and the deadline stops the loop", async () => {
  let clock = 0;
  const result = await warmUp(urls, {
    now: () => clock,
    timed: async () => { clock += 20_000; throw new Error("timeout"); },
    wait: noWait,
  });
  assert.equal(result.warm, false);
  assert.ok(result.requests <= Math.ceil(DEADLINE_MS / 20_000));
  assert.equal(result.slowest, 10_000);
});

test("requests alternate between the given URLs", async () => {
  const seen = [];
  await warmUp(urls, { timed: async (url) => { seen.push(url); return 10; }, wait: noWait });
  assert.deepEqual(seen.slice(0, 4), [urls[0], urls[1], urls[0], urls[1]]);
});
