// node --test scripts/trip-story/export-lib.test.mjs — trip-story export (pure, no network).
import assert from "node:assert/strict";
import test from "node:test";
import { buildTrip, derivativeKey, derivativePath, postedTrips, storySha, tripImages } from "./export-lib.mjs";

const sha = (c) => c.repeat(64);
const path = (c) => `/media/story/${sha(c)}.jpg`;
const spot = (id, extra = {}) => ({ id, name: JSON.stringify({ en: `Spot ${id}` }), category: "Food", visible: 1,
  description: JSON.stringify({ en: "A real fact." }), tips: JSON.stringify(["Go early"]), best_times: null, localley_score: 5, ...extra });
const itinerary = (backgrounds, days) => ({
  id: "it-1", title: "Two days", city: "Seoul",
  ai_backgrounds: JSON.stringify(backgrounds),
  activities: JSON.stringify({ dailyPlans: days }),
});
const twoDays = [
  { theme: "Markets", activities: [{ name: "A", spotId: "s1", time: "9:00 AM", cost: "Free" }, { name: "Ghost", spotId: "nope" }] },
  { theme: "Night", activities: [{ name: "B", spotId: "s2" }] },
];

test("storySha accepts only content-addressed story paths", () => {
  assert.equal(storySha(path("a")), sha("a"));
  assert.equal(storySha("/media/story/abc.jpg"), null);
  assert.equal(storySha("https://evil.example/x.jpg"), null);
  assert.equal(storySha(undefined), null);
});

test("a trip with a missing day image is skipped", () => {
  const result = buildTrip({ itinerary: itinerary({ cover: path("a"), day1: path("b"), summary: path("d") }, twoDays), spots: [spot("s1"), spot("s2")] });
  assert.equal(result.trip, undefined);
  assert.equal(result.skip, "day2 image missing");
});

test("a full trip keeps only stops with a visible spot row, with spot facts", () => {
  const { trip } = buildTrip({
    itinerary: itinerary({ cover: path("a"), day1: path("b"), day2: path("c"), summary: path("d") }, twoDays),
    spots: [spot("s1"), spot("s2")], postedAt: "2026-11-25T13:05:02Z",
  });
  assert.equal(trip.days.length, 2);
  assert.deepEqual(trip.days[0].stops.map((s) => s.spotId), ["s1"]);
  assert.equal(trip.days[0].stops[0].name, "Spot s1");
  assert.equal(trip.days[0].stops[0].facts.description, "A real fact.");
  assert.deepEqual(trip.days[0].stops[0].facts.tips, ["Go early"]);
  assert.deepEqual(tripImages(trip), [sha("a"), sha("b"), sha("c"), sha("d")]);
});

test("a day whose only spot is hidden skips the trip", () => {
  const result = buildTrip({
    itinerary: itinerary({ cover: path("a"), day1: path("b"), day2: path("c"), summary: path("d") }, twoDays),
    spots: [spot("s1"), spot("s2", { visible: 0 })],
  });
  assert.equal(result.skip, "day2 has no visible spot");
});

test("postedTrips: published, own backgrounds only, newest first, one per itinerary", () => {
  const ledger = {
    generated: [{ itineraryId: "x", bgSource: "codex-realistic-v2" }, { itineraryId: "y", bgSource: "codex-realistic-v2" }, { itineraryId: "g", bgSource: "gemini" }],
    posts: [
      { itineraryId: "x", city: "Seoul", status: "published", at: "2026-11-20T00:00:00Z" },
      { itineraryId: "x", city: "Seoul", status: "published", at: "2026-11-22T00:00:00Z" },
      { itineraryId: "y", city: "Tokyo", status: "failed", at: "2026-11-23T00:00:00Z" },
      { itineraryId: "g", city: "Osaka", status: "published", at: "2026-11-24T00:00:00Z" },
    ],
  };
  assert.deepEqual(postedTrips(ledger), [{ itineraryId: "x", city: "Seoul", postedAt: "2026-11-22T00:00:00Z" }]);
});

test("derivative key and public path match the media route", () => {
  assert.equal(derivativeKey(sha("a"), 1080, "avif"), `trip-story/${sha("a")}-1080.avif`);
  assert.equal(derivativePath(sha("a"), 540, "webp"), `/media/trip-story/${sha("a")}-540.webp`);
});
