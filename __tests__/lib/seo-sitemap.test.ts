import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog/posts";
import {
  guideEntries, pageEntries, parseSitemapFile, renderIndex, renderUrlset, SPOTS_PER_SITEMAP, spotChunk, spotChunkCount, spotEntries,
} from "@/lib/seo/sitemap";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `spot-${i}`, lastmod: `2026-0${1 + (i % 9)}-01T00:00:00+00:00` }));

describe("sitemap index", () => {
  it("lists no redirect or auth URL and no URL twice", () => {
    const urls = [...pageEntries(), ...guideEntries()].map((e) => e.loc);
    for (const bad of ["/explore", "/dashboard", "/sign-in", "/sign-up", "/community"]) {
      expect(urls).not.toContain(`https://www.localley.io${bad}`);
    }
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://www.localley.io/spots?city=seoul");
    expect(urls).toContain("https://www.localley.io/help/korea/pay");
  });

  it("never writes a fake lastmod: static pages have none, posts carry their real updated date", () => {
    expect(pageEntries().every((e) => e.lastmod === undefined)).toBe(true);
    const post = BLOG_POSTS[0];
    if (post) expect(guideEntries().find((e) => e.loc.endsWith(`/blog/${post.slug}`))?.lastmod).toBe(post.updated);
    const xml = renderUrlset([{ loc: "https://www.localley.io/a" }, { loc: "https://www.localley.io/b", lastmod: "not a date" }]);
    expect(xml).not.toContain("<lastmod>");
  });

  it("splits spots into children of at most 5,000 URLs and covers every row once", () => {
    const all = rows(SPOTS_PER_SITEMAP * 2 + 7);
    expect(spotChunkCount(all.length)).toBe(3);
    const chunks = [1, 2, 3].map((n) => spotChunk(all, n)!);
    expect(chunks.map((c) => c.length)).toEqual([5000, 5000, 7]);
    expect(chunks.flat().map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(spotChunk(all, 4)).toBeNull();
    expect(spotChunk(all, 0)).toBeNull();
    expect(spotChunk([], 1)).toEqual([]);
  });

  it("renders the index with one child per chunk and the newest lastmod of each", () => {
    const xml = renderIndex(rows(3023));
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://www.localley.io/sitemaps/pages.xml</loc>");
    expect(xml).toContain("<loc>https://www.localley.io/sitemaps/spots-1.xml</loc><lastmod>2026-09-01T00:00:00+00:00</lastmod>");
    expect(xml).not.toContain("spots-2.xml");
  });

  it("escapes URLs and maps spot rows to /spots/<id>", () => {
    const xml = renderUrlset(spotEntries([{ id: "a&b", lastmod: null }]));
    expect(xml).toContain("<loc>https://www.localley.io/spots/a%26b</loc>");
  });

  it("accepts only known child file names", () => {
    expect(parseSitemapFile("pages.xml")).toEqual({ kind: "pages" });
    expect(parseSitemapFile("spots-2.xml")).toEqual({ kind: "spots", n: 2 });
    for (const bad of ["spots-0.xml", "spots-01.xml", "spots-x.xml", "other.xml", "pages"]) expect(parseSitemapFile(bad)).toBeNull();
  });
});
