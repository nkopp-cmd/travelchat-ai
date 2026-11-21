import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("server-only", () => ({}));
import { homeGuideSpots, homeHubLinks, homeJournalLinks } from "@/lib/seo/home-links";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { ENABLED_CITIES } from "@/lib/cities";
import { homeLinkRows } from "@/lib/seo/home-links-snapshot";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const row = (id: string, hub: string, lastmod: string | null = null, name = `Spot ${id}`) => ({ id, hub, lastmod, name });

describe("homeGuideSpots", () => {
  it("round-robins over hubs, largest hub first, newest guide first", () => {
    const rows = [row("a", "Seoul", "2026-11-01"), row("b", "Seoul", "2026-11-10"), row("c", "Seoul"), row("d", "Tokyo", "2026-11-05")];
    expect(homeGuideSpots(rows, 3).map((s) => s.id)).toEqual(["b", "d", "a"]);
  });

  it("skips rows without a hub or a name", () => {
    expect(homeGuideSpots([{ id: "x", lastmod: null, hub: null, name: "X" }, row("y", "Seoul", null, "  ")])).toEqual([]);
  });

  it("property: at most limit, unique ids, every hub represented when limit allows", () => {
    fc.assert(fc.property(
      fc.array(fc.record({ id: fc.uuid(), hub: fc.constantFrom("Seoul", "Tokyo", "Bangkok"), lastmod: fc.constant(null), name: fc.constant("n") }), { maxLength: 40 }),
      fc.integer({ min: 0, max: 20 }),
      (raw, limit) => {
        const rows = [...new Map(raw.map((r) => [r.id, r])).values()];
        const out = homeGuideSpots(rows, limit);
        expect(out.length).toBe(Math.min(limit, rows.length));
        expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
        const hubs = new Set(rows.map((r) => r.hub));
        if (limit >= hubs.size) expect(new Set(out.map((s) => s.hub)).size).toBe(hubs.size);
      },
    ));
  });
});

describe("homeHubLinks", () => {
  it("lists every hub when rows are unknown and drops thin hubs otherwise", () => {
    expect(homeHubLinks([])).toHaveLength(ENABLED_CITIES.length);
    const seoul = Array.from({ length: 5 }, (_, i) => row(`s${i}`, "Seoul"));
    expect(homeHubLinks([...seoul, row("t", "Tokyo")]).map((h) => h.href)).toEqual(["/spots?city=seoul"]);
  });
});

describe("static home snapshot (release: '/' must stay a static prerender)", () => {
  it("home page reads the committed snapshot and never renders per request", () => {
    const page = readFileSync(resolve("app/page.tsx"), "utf8");
    expect(page).not.toMatch(/export const (dynamic|revalidate)\b/);
    expect(page).not.toMatch(/async function LandingPage/);
    expect(page).not.toContain("sitemap-spots");
  });

  it("snapshot rows are named guide spots on enabled hubs and give 12 links", () => {
    const rows = homeLinkRows();
    const hubs = new Set(ENABLED_CITIES.map((c) => c.name));
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(r.name.trim()).not.toBe("");
      expect(hubs.has(r.hub)).toBe(true);
    }
    expect(homeGuideSpots(rows)).toHaveLength(12);
    expect(homeHubLinks(rows).length).toBeGreaterThan(0);
  });

  it("refresh script parses hub HTML and city names", async () => {
    const { hubRows, cityNames } = await import("../../scripts/seo/refresh-home-links.mjs");
    expect([...cityNames('slug: "seoul",\n        name: "Seoul",').entries()]).toEqual([["seoul", "Seoul"]]);
    const id = "e2230c5a-e857-4f8c-8917-770d9edf12d4";
    const html = `<a class="x" href="/spots/${id}">Dad&#x27;s &amp; Co</a><a href="/spots/00000000-0000-4000-8000-000000000000">Not in sitemap</a>`;
    expect(hubRows(html, "Seoul", new Map([[id, "2026-11-14"]]))).toEqual([{ id, name: "Dad's & Co", hub: "Seoul", lastmod: "2026-11-14" }]);
  });
});

describe("home journal and A-Z links (Push CC2)", () => {
  it("links the newest posts first, limit 3, ties by slug", () => {
    const posts = [
      { slug: "a", title: "A", published: "2026-11-02" }, { slug: "c", title: "C", published: "2026-11-13" },
      { slug: "b", title: "B", published: "2026-11-13" }, { slug: "d", title: "D", published: "2026-11-09" },
    ];
    expect(homeJournalLinks(posts).map((p) => p.href)).toEqual(["/blog/b", "/blog/c", "/blog/d"]);
    expect(homeJournalLinks([])).toEqual([]);
  });

  it("the real journal gives 3 links to existing posts, paying-in-seoul included", () => {
    const links = homeJournalLinks(BLOG_POSTS);
    expect(links).toHaveLength(Math.min(3, BLOG_POSTS.length));
    for (const l of links) expect(BLOG_POSTS.some((p) => `/blog/${p.slug}` === l.href && p.title === l.title)).toBe(true);
    expect(links.map((l) => l.href)).toContain("/blog/paying-in-seoul");
  });

  it("every linked hub also links its A-Z page (same path as the hub page's own link)", () => {
    for (const hub of homeHubLinks([])) {
      const slug = new URL(hub.href, "https://x").searchParams.get("city")!;
      expect(hub.azHref).toBe(`/spots/a-z/${slug}`);
    }
    const linked = homeHubLinks([]).map((h) => h.azHref);
    expect(linked).toEqual(expect.arrayContaining(["/spots/a-z/seoul", "/spots/a-z/tokyo"]));
  });
});
