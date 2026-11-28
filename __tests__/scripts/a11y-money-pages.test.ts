import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { BROWSE_PAGES, PAGES, contentPages, entryPages, pagesFor } from "../../scripts/a11y-money-pages.mjs";

const spotsHtml = `
<a href="/spots/a-z/seoul">Seoul A-Z</a><a href="/spots?city=seoul">Seoul</a>
<a href="/spots?city=tokyo">Tokyo</a><a href="/spots?city=tokyo">Tokyo again</a>
<a href="/spots/a-z/bangkok">Bangkok</a>
<a href="https://example.com/spots?city=evil">outside</a><a href="/spots/123e4567-e89b">a spot</a>
<a href="/spots?city=Seoul%20x">bad slug</a>`;

describe("a11y-money-pages page list (Push DJ3)", () => {
  it("keeps the money walk unchanged without --wide", () => {
    expect(pagesFor(false, spotsHtml)).toEqual(PAGES);
  });

  it("adds browse pages and each city link once, in both link forms, first city included", () => {
    const pages: string[] = pagesFor(true, spotsHtml);
    expect(pages.slice(0, PAGES.length)).toEqual(PAGES);
    for (const page of BROWSE_PAGES) expect(pages).toContain(page);
    const cities = pages.filter((p) => p.startsWith("/spots?city=") || p.startsWith("/spots/a-z/"));
    expect(cities).toEqual(["/spots/a-z/bangkok", "/spots/a-z/seoul", "/spots?city=seoul", "/spots?city=tokyo"]);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it("is stable when called twice (no shared regex state)", () => {
    expect(pagesFor(true, spotsHtml)).toEqual(pagesFor(true, spotsHtml));
  });

  it("finds no city on an empty page", () => {
    expect(pagesFor(true, "")).toEqual([...PAGES, ...BROWSE_PAGES]);
  });
});

// Push DX2: one spot detail page and one blog post, read from the live HTML (no fixed slug).
describe("a11y-money-pages content pages (Push DX2)", () => {
  const spot = "/spots/fe3fb912-2a3e-4e95-9533-e22ed503346c";
  const withSpots = `${spotsHtml}<a href="${spot}">A</a><a href="/spots/d3e692e8-90a6-4429-8686-7f3a8246e06b">B</a>`;
  const blogHtml = `<a href="/blog">Blog</a><a href="/blog/rss.xml">RSS</a><a href="/blog/paying-in-seoul">Seoul</a><a href="/blog/paying-in-tokyo">Tokyo</a>`;

  it("takes the first full spot id and the first post slug, never the index, RSS or a short id", () => {
    expect(contentPages(withSpots, blogHtml)).toEqual([spot, "/blog/paying-in-seoul"]);
  });

  it("adds both to the wide list once, after the city pages, and never to the money walk", () => {
    const pages: string[] = pagesFor(true, withSpots, blogHtml);
    expect(pages.slice(-2)).toEqual([spot, "/blog/paying-in-seoul"]);
    expect(new Set(pages).size).toBe(pages.length);
    expect(pagesFor(false, withSpots, blogHtml)).toEqual(PAGES);
  });

  it("finds nothing on empty pages, so the run fails instead of passing short", () => {
    expect(contentPages("", "")).toEqual([]);
    expect(contentPages(spotsHtml, "")).toEqual([]);
  });
});

// Push EA2: every country help page and every trending detail page, read live, plus the legal pages.
describe("a11y-money-pages entry pages (Push EA2)", () => {
  const helpHtml = `<a href="/help">Help</a><a href="/help/korea">KR</a><a href="/help/korea/pay">Pay</a><a href="/help/japan">JP</a><a href="/help/korea">KR again</a><a href="/help/south-korea">x</a>`;
  const trendingHtml = `<a href="/trending">All</a><a href="/trending/yang-hong-won-seoul-2026-10">A</a><a href="/trending/chey-tae-won-seoul-2026-10">B</a><a href="/trending/../x">bad</a>`;

  it("takes each country page and each trending detail once, never the index or a deeper path", () => {
    expect(entryPages(helpHtml, trendingHtml)).toEqual([
      "/help/japan",
      "/help/korea",
      "/help/south-korea",
      "/trending/chey-tae-won-seoul-2026-10",
      "/trending/yang-hong-won-seoul-2026-10",
    ]);
    expect(entryPages(helpHtml, trendingHtml)).toEqual(entryPages(helpHtml, trendingHtml));
  });

  it("adds them and the legal pages to the wide list once, never to the money walk", () => {
    const pages: string[] = pagesFor(true, "", "", helpHtml, trendingHtml);
    for (const path of ["/help/japan", "/trending/chey-tae-won-seoul-2026-10", "/credits", "/privacy", "/terms"]) expect(pages).toContain(path);
    expect(new Set(pages).size).toBe(pages.length);
    expect(pagesFor(false, "", "", helpHtml, trendingHtml)).toEqual(PAGES);
    expect(BROWSE_PAGES).toEqual(expect.arrayContaining(["/credits", "/privacy", "/terms"]));
  });

  it("finds nothing on empty pages, so the run fails instead of passing short", () => {
    expect(entryPages("", "")).toEqual([]);
  });
});
