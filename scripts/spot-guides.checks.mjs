// node --test scripts/spot-guides.checks.mjs — pure parts of the spot guide writer (no network).
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FAILURES, RUN_CAP, acceptGuides, buildGuidePrompt, pickSpots, spotFacts } from "./spot-guides.mjs";

const id = "6bff8713-ceaa-45f8-a8b8-3e39d4017b03";
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const row = { id, city: "Seoul", address: null, category: "Food", payload: JSON.stringify({
  name: { en: "Dosan Hoikwan", ko: "도산회관" }, address: { en: "8-7 Dosan-daero 45-gil, Gangnam-gu, Seoul" },
  description: { en: "Old-school beef house. [Venue guide](https://example.com/g)" },
  tips: { en: ["Go before 6 pm.", "Verify which branch before final submission."] }, best_times: { en: ["Dinner"] },
}) };

test("facts drop pipeline-note tips and markdown links, keep viral who/when", () => {
  const facts = spotFacts(row, [{ label: "Justin Bieber ate here", month: "2026-10", note: null, sources: [{ title: "MT", url: "https://www.mt.co.kr/a" }] }]);
  assert.equal(facts.nameEn, "Dosan Hoikwan");
  assert.equal(facts.description, "Old-school beef house. Venue guide");
  assert.deepEqual(facts.tips, ["Go before 6 pm."]);
  assert.equal(facts.viral[0].month, "2026-10");
  assert.match(buildGuidePrompt([facts]), /Unknown stays unknown/);
});

test("accepts only guides that pass the page rules and cite a source", () => {
  const facts = [spotFacts(row), spotFacts({ ...row, id: "11111111-2222-4333-8444-555555555555" }), spotFacts({ ...row, id: "21111111-2222-4333-8444-555555555555" })];
  const base = { orderOrDo: ["Bulgogi"], bestTime: "Dinner", price: null, duration: "1 hour", tips: ["Book ahead."] };
  const raw = JSON.stringify({ guides: [
    { ...base, spotId: facts[0].spotId, guide: words(120), sources: [{ title: "Visit Korea", url: "https://english.visitkorea.or.kr/x" }] },
    { ...base, spotId: facts[1].spotId, guide: words(40), sources: [{ title: "x", url: "https://x.com" }] },
    { ...base, spotId: facts[2].spotId, guide: words(120), sources: [{ title: "x", url: "http://insecure.example" }] },
  ] });
  const { ok, failed } = acceptGuides(raw, facts, "2026-11-01T00:00:00Z");
  assert.deepEqual(ok.map((g) => g.spotId), [id]);
  assert.equal(ok[0].version, 1);
  assert.deepEqual(failed.map((f) => f.reason), ["rules (length, wording or shape)", "no sources"]);
  assert.equal(acceptGuides("not json", facts).failed.length, 3);
});

test("pick order: viral first, no repeats, done and failed skipped, run cap", () => {
  const state = { done: { b: "x" }, failed: { c: MAX_FAILURES } };
  assert.deepEqual(pickSpots(["a", "b"], ["c", "a", "d", "e"], state, { limit: 3 }), ["a", "d", "e"]);
  assert.deepEqual(pickSpots(["a", "b"], ["c"], state, { limit: 5, force: true }), ["a", "b", "c"]);
  const many = Array.from({ length: 100 }, (_, i) => `s${i}`);
  assert.equal(pickSpots([], many, { done: {}, failed: {} }, { limit: 999 }).length, RUN_CAP);
});
