import { test } from "node:test";
import assert from "node:assert/strict";
import { BURST, DEADLINE_MS, FAST_MS, MAX_REQUESTS, NEEDED_FAST_ROUNDS, warmUp } from "./warm-up.mjs";

const noWait = async () => {};
const urls = ["https://example.test/a", "https://example.test/b"];
const fromList = (times) => { let i = 0; return async () => times[i++] ?? 40; };

test("stops as soon as enough consecutive rounds are fast", async () => {
  const result = await warmUp(urls, { timed: fromList([1300, 900, ...Array(BURST - 2).fill(40)]), wait: noWait });
  assert.equal(result.warm, true);
  assert.equal(result.rounds, 1 + NEEDED_FAST_ROUNDS);
  assert.equal(result.requests, (1 + NEEDED_FAST_ROUNDS) * BURST);
  assert.equal(result.slowest, 1300);
});

test("one slow answer makes its round slow and resets the fast run", async () => {
  const times = [...Array(BURST).fill(40), ...Array(BURST - 1).fill(40), 900];
  const result = await warmUp(urls, { timed: fromList(times), wait: noWait });
  assert.equal(result.rounds, 2 + NEEDED_FAST_ROUNDS);
});

test("each round is a parallel burst of BURST requests", async () => {
  let inFlight = 0, peak = 0;
  await warmUp(urls, {
    timed: async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setImmediate(r)); inFlight--; return 10; },
    wait: noWait,
  });
  assert.equal(peak, BURST);
});

test("never more than MAX_REQUESTS when the Worker stays slow", async () => {
  let calls = 0;
  const result = await warmUp(urls, { timed: async () => { calls++; return FAST_MS + 1; }, wait: noWait });
  assert.equal(result.warm, false);
  assert.ok(calls <= MAX_REQUESTS);
  assert.equal(calls, Math.floor(MAX_REQUESTS / BURST) * BURST);
});

test("errors count as slow and the deadline stops the loop", async () => {
  let clock = 0;
  const result = await warmUp(urls, {
    now: () => clock,
    timed: async () => { clock += 20_000 / BURST; throw new Error("timeout"); },
    wait: noWait,
  });
  assert.equal(result.warm, false);
  assert.ok(result.rounds <= Math.ceil(DEADLINE_MS / 20_000));
  assert.equal(result.slowest, 10_000);
});

test("a burst spreads over the given URLs", async () => {
  const seen = [];
  await warmUp(urls, { timed: async (url) => { seen.push(url); return 10; }, wait: noWait });
  assert.deepEqual(seen.slice(0, 4), [urls[0], urls[1], urls[0], urls[1]]);
});
