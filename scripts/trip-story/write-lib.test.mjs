// node --test scripts/trip-story/write-lib.test.mjs — trip-story post writer (pure, fake generator).
import assert from "node:assert/strict";
import test from "node:test";
import { checkDraft, dayAlt, draftTripPost, postFile, slugify, tripFacts } from "./write-lib.mjs";

const sha = (c) => c.repeat(64);
const stop = (name, extra = {}) => ({ spotId: name, name, category: "Food", time: "9:00 AM", duration: null, cost: "₩15,000", plan: null,
  facts: { description: `${name} serves noodles since 1962.`, tips: ["Go before the lunch queue"], bestTimes: [], address: null, localleyScore: 5 }, ...extra });
const trip = {
  itineraryId: "it-1", city: "Seoul", title: "Two days of markets", postedAt: "2026-11-24T00:00:00Z",
  cover: sha("a"), summary: sha("d"),
  days: [
    { day: 1, theme: "Markets", image: sha("b"), stops: [stop("Gwangjang Market"), stop("Cheonggyecheon")] },
    { day: 2, theme: "Night views", image: sha("c"), stops: [stop("Namsan Tower")] },
  ],
};
const filler = (n) => Array.from({ length: n }, () => "Walk slowly and look around the small lanes with a friend.").join(" ");
const good = {
  title: "Two days in Seoul: markets, a stream walk and night views",
  description: "A real two-day Seoul plan: Gwangjang Market noodles at 9:00 AM, a walk along Cheonggyecheon, and Namsan Tower when the city lights come on.",
  intro: `This plan covers two easy days in Seoul for a first visit.\n\n${filler(20)}`,
  days: [
    { heading: "Markets and a stream walk", text: `Start at Gwangjang Market at 9:00 AM. It serves noodles since 1962 and costs about ₩15,000. Then walk to Cheonggyecheon. ${filler(20)}` },
    { heading: "Up the hill at dusk", text: `End at Namsan Tower. Go before the lunch queue. ${filler(20)}` },
  ],
};

test("facts carry every stop field, nothing internal", () => {
  const lines = tripFacts(trip).join("\n");
  assert.match(lines, /Gwangjang Market" tip: Go before the lunch queue/);
  assert.match(lines, /cost ₩15,000/);
  assert.match(tripFacts({ ...trip, days: [{ ...trip.days[0], stops: [stop("Gwangjang Market", { plan: "Eat bindaetteok at the stalls." })] }] }).join("\n"), /"Gwangjang Market" what to do: Eat bindaetteok at the stalls\./);
  assert.doesNotMatch(lines, /localleyScore|score/i);
});

test("a grounded draft passes", () => {
  assert.deepEqual(checkDraft(good, trip), []);
});

test("an invented number, a missing stop, a link and image talk fail", () => {
  const bad = { ...good, days: [{ ...good.days[0], text: good.days[0].text.replace("Cheonggyecheon", "the stream") + " Entry is 25,000 won. See [map](https://x.y)." }, { ...good.days[1], text: good.days[1].text + " This photo shows it." }] };
  const problems = checkDraft(bad, trip).join("\n");
  assert.match(problems, /misses "Cheonggyecheon"/);
  assert.match(problems, /number 25000 not in facts/);
  assert.match(problems, /markdown or links/);
  assert.match(problems, /mentions images/);
});

test("wrong day count fails early", () => {
  assert.match(checkDraft({ ...good, days: [good.days[0]] }, trip).join(), /days 1 != 2/);
});

test("post file: front matter illustration, one painted image per day, own planner link", () => {
  const src = postFile({ trip, date: "2026-11-25", draft: good });
  assert.match(src, new RegExp(`\\nillustration: ${sha("a")}\\n`));
  assert.match(src, /\nillustrationAlt: Painted illustration of a 2-day trip in Seoul\n/);
  assert.equal(src.match(/^!\[/gm).length, 2);
  assert.ok(src.includes(`![${dayAlt(trip, trip.days[0])}](/media/trip-story/${sha("b")}-1080.webp)`));
  assert.match(src, /^## Day 2: Up the hill at dusk$/m);
  assert.match(src, /\]\(\/itineraries\/new\?city=Seoul\)/);
  assert.doesNotMatch(src.split("\n---\n")[1], /\bphoto/i);
});

test("draftTripPost retries once with the problems, then gives up", () => {
  const prompts = [];
  const fail = draftTripPost({ trip, date: "2026-11-25", generate: (p) => { prompts.push(p); return { ...good, title: "Seoul" }; } });
  assert.equal(fail.ok, false);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /failed these checks: title length/);
  const ok = draftTripPost({ trip, date: "2026-11-25", generate: () => good });
  assert.equal(ok.ok, true);
  assert.equal(ok.file, "2026-11-25-two-days-in-seoul-markets-a-stream-walk-and-night-views.md");
});

test("slugify keeps file names valid", () => {
  assert.match(slugify("Tokyo — 3 Days: Café & Ramen!"), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});
