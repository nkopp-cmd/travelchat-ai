// node --test scripts/trip-story/publish-lib.test.mjs — trip-story T5 selection caps (pure, no network).
import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { CITY_GAP_DAYS, MAX_PER_WEEK, pickTrip, previewText, tripPostInfo } from "./publish-lib.mjs";

const sha = (c) => c.repeat(64);
const post = (date, city, cover) => ({ date, city, cover });

test("tripPostInfo reads date, cover and city; other posts are null", () => {
  const src = `---\ntitle: X\nillustration: ${sha("a")}\nillustrationAlt: y\n---\nText [Kyoto trip planner](/itineraries/new?city=Kyoto).\n`;
  assert.deepEqual(tripPostInfo("2026-11-25-kyoto.md", src), post("2026-11-25", "Kyoto", sha("a")));
  assert.equal(tripPostInfo("2026-11-20-paying-in-seoul.md", "---\ntitle: X\nphoto: /media/spot/a.webp\n---\n"), null);
  const spaced = `---\nillustration: ${sha("b")}\n---\n[x](/itineraries/new?city=Chiang%20Mai)`;
  assert.equal(tripPostInfo("2026-11-01-a.md", spaced).city, "Chiang Mai");
});

test("picks the newest trip that has no post and whose city is free", () => {
  const candidates = [{ itineraryId: "1", city: "Kyoto", cover: sha("a") }, { itineraryId: "2", city: "Kyoto", cover: sha("b") },
    { itineraryId: "3", city: "Seoul", cover: sha("c") }];
  const { pick } = pickTrip({ candidates, posts: [post("2026-11-10", "Kyoto", sha("a"))], today: "2026-11-25" });
  assert.equal(pick.itineraryId, "3");
});

test("no pick when the weekly cap is used", () => {
  const posts = [post("2026-11-20", "Tokyo", sha("x")), post("2026-11-24", "Osaka", sha("y"))];
  const result = pickTrip({ candidates: [{ itineraryId: "1", city: "Seoul", cover: sha("a") }], posts, today: "2026-11-25" });
  assert.equal(result.pick, null);
  assert.match(result.reason, /max 2/);
});

test("property: a pick never breaks a cap and never repeats a trip", () => {
  const cities = ["Seoul", "Tokyo", "Kyoto", "Bangkok"];
  const date = fc.integer({ min: 0, max: 200 }).map((d) => new Date(Date.UTC(2026, 5, 1) + d * 86_400_000).toISOString().slice(0, 10));
  const cover = fc.constantFrom(...["a", "b", "c", "d", "e"].map(sha));
  fc.assert(fc.property(
    fc.array(fc.record({ date, city: fc.constantFrom(...cities), cover }), { maxLength: 8 }),
    fc.array(fc.record({ itineraryId: fc.string(), city: fc.constantFrom(...cities), cover }), { maxLength: 8 }),
    (posts, candidates) => {
      const today = "2026-12-20";
      const { pick } = pickTrip({ candidates, posts, today });
      if (!pick) return true;
      const ago = (d) => (Date.parse(today) - Date.parse(d)) / 86_400_000;
      assert.ok(posts.filter((p) => ago(p.date) < 7).length < MAX_PER_WEEK);
      assert.ok(!posts.some((p) => p.cover === pick.cover));
      assert.ok(!posts.some((p) => p.city === pick.city && ago(p.date) < CITY_GAP_DAYS));
      return true;
    }));
});

test("preview names the stop reply and drops front matter and images", () => {
  const text = previewText({ slug: "kyoto", pr: "https://x/pr/1", title: "Kyoto", source: `---\ntitle: Kyoto\n---\n![a](/m.webp)\n\nHello` });
  assert.match(text, /no trip kyoto/);
  assert.doesNotMatch(text, /title: Kyoto|\/m\.webp/);
  assert.match(text, /Hello/);
});
