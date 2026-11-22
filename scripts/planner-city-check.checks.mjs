import assert from "node:assert/strict";
import { DEFAULT_PLAN, summarize } from "./planner-city-check.mjs";

assert.equal(summarize([{ city: "Tokyo", status: 200, reason: "" }]).ok, true);
const bad = summarize([{ city: "Tokyo", status: 200 }, { city: "Canggu", status: 422, reason: "insufficient_verified_spots" }, { city: "Hanoi", status: 0, reason: "TimeoutError" }]);
assert.equal(bad.ok, false);
assert.equal(bad.failed.length, 2);
assert.equal(bad.line, "Canggu 422 insufficient_verified_spots, Hanoi 0 TimeoutError");
// Must stay the preset input, or every run pays for a model call per city.
assert.deepEqual(DEFAULT_PLAN, { days: 3, interests: [], budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" });
console.log("planner-city-check checks: ok");
