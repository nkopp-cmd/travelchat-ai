import { test } from "node:test";
import assert from "node:assert/strict";
import { findOrphans, linkedSpotIds, sitemapLocs, spotIdsFromUrls } from "./orphan-check-lib.mjs";

const A = "f242e187-56ee-4cc8-9736-52f4ea46aebc";
const B = "5e0839c7-5725-4c7b-b696-3d4c015d12bc";
const C = "fe0d855d-ef59-462f-a8fd-2f6c2b9dbb4b";

test("sitemapLocs reads index and urlset locs", () => {
  const xml = `<urlset><url><loc>https://www.localley.io/spots/${A}</loc></url><url><loc> https://www.localley.io/spots?city=seoul&amp;page=2 </loc></url></urlset>`;
  assert.deepEqual(sitemapLocs(xml), [`https://www.localley.io/spots/${A}`, "https://www.localley.io/spots?city=seoul&page=2"]);
});

test("spotIdsFromUrls keeps only spot detail URLs", () => {
  const ids = spotIdsFromUrls([`https://www.localley.io/spots/${A.toUpperCase()}`, "https://www.localley.io/spots?city=seoul", `https://www.localley.io/spots/${B}/tips`]);
  assert.deepEqual([...ids].sort(), [A, B].sort());
});

test("linkedSpotIds reads relative and absolute hrefs, ignores text mentions", () => {
  const html = `<a href="/spots/${A}">x</a><a href="https://www.localley.io/spots/${B}?from=hub">y</a><p>/spots/${C}</p>`;
  assert.deepEqual([...linkedSpotIds(html)].sort(), [A, B].sort());
});

test("findOrphans lists unlinked sitemap ids only", () => {
  assert.deepEqual(findOrphans(new Set([A, B, C]), new Set([B])), [A, C].sort());
  assert.deepEqual(findOrphans(new Set([A]), new Set([A, B])), []);
});
