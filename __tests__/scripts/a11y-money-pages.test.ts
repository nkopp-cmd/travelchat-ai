import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { BROWSE_PAGES, PAGES, pagesFor } from "../../scripts/a11y-money-pages.mjs";

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
