import assert from "node:assert/strict";
import { DEFAULT_PLAN, offeredCities, plannerMinSpots, summarize } from "./planner-city-check.mjs";

assert.equal(summarize([{ city: "Tokyo", status: 200, reason: "" }]).ok, true);
const bad = summarize([{ city: "Tokyo", status: 200 }, { city: "Canggu", status: 422, reason: "insufficient_verified_spots" }, { city: "Hanoi", status: 0, reason: "TimeoutError" }]);
assert.equal(bad.ok, false);
assert.equal(bad.failed.length, 2);
assert.equal(bad.line, "Canggu 422 insufficient_verified_spots, Hanoi 0 TimeoutError");
// Must stay the preset input, or every run pays for a model call per city.
assert.deepEqual(DEFAULT_PLAN, { days: 3, interests: [], budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" });
// Push DD1: the check reads the picker threshold and covers only the cities the picker offers.
assert.equal(plannerMinSpots(), 30);
assert.equal(plannerMinSpots("export const PLANNER_MIN_SPOTS = 12;"), 12);
assert.throws(() => plannerMinSpots("const x = 1;"));
assert.deepEqual(offeredCities([
  { name: "Tokyo", isEnabled: true, status: "recommended", spotCount: 486 },
  { name: "Ubud, Bali", isEnabled: true, status: "beta", spotCount: 34 },
  { name: "Canggu, Bali", isEnabled: true, status: "beta", spotCount: 22 },
  { name: "Nara", isEnabled: true, status: "beta", spotCount: 1 },
  { name: "Penang", isEnabled: false, status: "beta", spotCount: 90 },
  { name: "Hidden", isEnabled: true, status: "hidden", spotCount: 90 },
], 30), ["Tokyo", "Ubud, Bali"]);
console.log("planner-city-check checks: ok");
