// node --test scripts/seo/spot-cta-lib.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { plannerCtaKind, sitemapLocs, spotIdOf } from "./spot-cta-lib.mjs";

test("spotIdOf reads only /spots/<id>", () => {
  assert.equal(spotIdOf("https://www.localley.io/spots/02802b01-1431-4efa-9a10-658d531abbb3"), "02802b01-1431-4efa-9a10-658d531abbb3");
  assert.equal(spotIdOf("https://www.localley.io/spots/abc/"), "abc");
  assert.equal(spotIdOf("https://www.localley.io/spots/abc/og"), null);
  assert.equal(spotIdOf("https://www.localley.io/spots?city=seoul"), null);
  assert.equal(spotIdOf("not a url"), null);
});

test("sitemapLocs decodes &amp;", () => {
  assert.deepEqual(sitemapLocs("<urlset><url><loc> https://x.io/spots/a </loc></url><url><loc>https://x.io/?a=1&amp;b=2</loc></url></urlset>"),
    ["https://x.io/spots/a", "https://x.io/?a=1&b=2"]);
});

test("plannerCtaKind: spot + city beats the day-trip city link; no city is no link", () => {
  const id = "02802b01-1431-4efa-9a10-658d531abbb3";
  assert.equal(plannerCtaKind(`<a href="/itineraries/new?city=Seoul">x</a><a href="/itineraries/new?spot=${id}&amp;city=Hong+Kong">Plan</a>`, id), "spot");
  assert.equal(plannerCtaKind(`<a href="/itineraries/new?city=Seoul&spot=${id}">Plan</a>`, id), "spot");
  assert.equal(plannerCtaKind(`<a href="/itineraries/new?city=Taipei">Plan a free Taipei trip</a>`, id), "city");
  assert.equal(plannerCtaKind(`<a href="/itineraries/new?spot=other&amp;city=Seoul">x</a>`, id), "city");
  assert.equal(plannerCtaKind(`<a href="/itineraries/new?spot=${id}">Plan</a>`, id), null); // no city: planner drops the spot
  assert.equal(plannerCtaKind(`<a href="/itineraries/new">Start planning</a>`, id), null);
  assert.equal(plannerCtaKind("", id), null);
});
