import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import {
  hubIndexable, hubOf, hubSpotCounts, indexableSitemapRows, isSpotIndexable, MIN_HUB_SPOTS, onEnabledHub, spotsHubHeading,
} from "@/lib/seo/spot-indexable";
import { guideUploadDate } from "@/lib/spots/guide-store";
import { pageEntries } from "@/lib/seo/sitemap";

vi.mock("server-only", () => ({}));

describe("isSpotIndexable", () => {
  it("indexes a spot only when it has its own guide (F4)", () => {
    expect(isSpotIndexable({ hasGuide: true })).toBe(true);
    expect(isSpotIndexable({ hasGuide: false })).toBe(false);
  });
});

describe("indexableSitemapRows", () => {
  const row = (id: string, extra: Partial<Parameters<typeof indexableSitemapRows>[0][number]> = {}) => ({
    id, lastmod: null, name: `Spot ${id}`, address: `${id} Street`, ...extra,
  });
  const guides = (...ids: string[]) => new Map(ids.map((id) => [id, null as string | null]));

  it("keeps only guided rows and sorts by id", () => {
    const rows = [row("c"), row("a"), row("b")];
    expect(indexableSitemapRows(rows, guides("c", "b")).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("keeps only the first row of a name+city duplicate, even with different addresses", () => {
    const rows = [
      row("z", { name: "Same", city: "Seoul", address: "One Road" }), row("a", { name: " same ", city: "Seoul", address: "Other Road" }),
      row("b", { name: "Same", city: "Tokyo", address: "One Road" }),
    ];
    expect(indexableSitemapRows(rows, guides("z", "a", "b")).map((r) => r.id)).toEqual(["b", "z"]);
  });

  it("falls back to the address for the dedupe key when the city is unknown", () => {
    const rows = [row("z", { name: "Same", address: "One Road" }), row("a", { name: "same", address: "ONE ROAD" }), row("b", { name: "same", address: "Two" })];
    expect(indexableSitemapRows(rows, guides("z", "a", "b")).map((r) => r.id)).toEqual(["b", "z"]);
  });

  it("guide date wins when newer, the row date when the guide is older or has none (F3)", () => {
    const rows = [
      row("a", { lastmod: "2026-09-01T00:00:00+00:00" }), row("b", { lastmod: "2026-11-20T00:00:00+00:00" }), row("c", { lastmod: null }),
    ];
    const map = new Map<string, string | null>([["a", "2026-11-14T10:00:00+00:00"], ["b", "2026-11-14T10:00:00+00:00"], ["c", null]]);
    expect(indexableSitemapRows(rows, map).map((r) => r.lastmod)).toEqual([
      "2026-11-14T10:00:00+00:00", "2026-11-20T00:00:00+00:00", null,
    ]);
  });

  it("drops rows no enabled hub lists and tags kept rows with their hub", () => {
    const rows = [
      row("a", { city: "Seoul" }), row("b", { city: "Jakarta" }),
      row("c", { city: null, address: "Jl. Margonda, Depok, Indonesia" }), row("d", { city: null, address: "12 Sukhumvit, bangkok" }),
    ];
    const out = indexableSitemapRows(rows, guides("a", "b", "c", "d"), ["Seoul", "Bangkok"]);
    expect(out.map((r) => [r.id, r.hub])).toEqual([["a", "Seoul"], ["d", "Bangkok"]]);
    expect(indexableSitemapRows(rows, guides("a", "b", "c", "d")).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("property: with hub cities, every kept row is on an enabled hub and tagged with it", () => {
    const hubs = ["Seoul", "Tokyo"];
    const arb = fc.array(fc.record({
      id: fc.uuid(), lastmod: fc.constant(null), name: fc.string({ maxLength: 4 }), address: fc.constantFrom("Seoul 1", "Depok", "tokyo x", ""),
      city: fc.constantFrom(null, "Seoul", "Tokyo", "Jakarta"),
    }), { maxLength: 30 });
    fc.assert(fc.property(arb, (rows) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      const all = new Map(rows.map((r) => [r.id.toLowerCase(), null]));
      for (const out of indexableSitemapRows(rows, all, hubs)) {
        expect(onEnabledHub(byId.get(out.id)!, hubs)).toBe(true);
        expect(out.hub).toBe(hubOf(byId.get(out.id)!, hubs));
      }
    }));
  });

  it("property: output ids are unique, guided, and lastmod is never older than either source date", () => {
    const date = fc.option(fc.constantFrom("2026-01-01T00:00:00+00:00", "2026-06-01T00:00:00+00:00", "2026-11-14T00:00:00+00:00"));
    const arb = fc.array(fc.record({
      id: fc.uuid(), lastmod: date, name: fc.constantFrom("A", "B", "C"), address: fc.constantFrom("x", "y"),
      city: fc.constantFrom(null, "Seoul"), guided: fc.boolean(), uploaded: date,
    }), { maxLength: 40 });
    fc.assert(fc.property(arb, (rows) => {
      const map = new Map(rows.filter((r) => r.guided).map((r) => [r.id.toLowerCase(), r.uploaded]));
      const out = indexableSitemapRows(rows, map);
      const ids = out.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const kept of out) {
        const source = byId.get(kept.id)!;
        expect(map.has(kept.id.toLowerCase())).toBe(true);
        for (const d of [source.lastmod, map.get(kept.id.toLowerCase())]) if (d) expect(kept.lastmod! >= d).toBe(true);
      }
    }));
  });
});

describe("hub index gate (F4)", () => {
  const rows = (hub: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${hub}-${i}`, lastmod: null, hub }));

  it("counts indexable spots per hub", () => {
    expect(hubSpotCounts([...rows("Seoul", 3), ...rows("Tokyo", 1), { hub: null }])).toEqual(new Map([["Seoul", 3], ["Tokyo", 1]]));
  });

  it("noindexes a hub below the minimum, keeps it at the minimum, and keeps all hubs when nothing is known", () => {
    const all = [...rows("Seoul", MIN_HUB_SPOTS), ...rows("Manila", MIN_HUB_SPOTS - 1)];
    expect(hubIndexable(all, "Seoul")).toBe(true);
    expect(hubIndexable(all, "Manila")).toBe(false);
    expect(hubIndexable(all, "Tokyo")).toBe(false);
    expect(hubIndexable([], "Manila")).toBe(true);
  });

  it("lists only hubs with enough guide spots in the pages sitemap", () => {
    const urls = pageEntries([...rows("Seoul", MIN_HUB_SPOTS), ...rows("Tokyo", 2)]).map((e) => e.loc);
    expect(urls).toContain("https://www.localley.io/spots?city=seoul");
    expect(urls).not.toContain("https://www.localley.io/spots?city=tokyo");
    expect(urls).toContain("https://www.localley.io/spots");
    expect(pageEntries().map((e) => e.loc)).toContain("https://www.localley.io/spots?city=tokyo");
  });
});

describe("guideUploadDate", () => {
  it("formats the R2 upload time as a sitemap date", () => {
    expect(guideUploadDate(new Date("2026-11-14T09:08:07.654Z"))).toBe("2026-11-14T09:08:07+00:00");
    expect(guideUploadDate(undefined)).toBeNull();
    expect(guideUploadDate(new Date("nope"))).toBeNull();
  });
});

describe("spotsHubHeading", () => {
  it("gives every city hub its own H1 and keeps the all-cities heading", () => {
    expect(spotsHubHeading().title).toBe("Discover Hidden Gems");
    const seoul = spotsHubHeading({ name: "Seoul", country: "South Korea" });
    const tokyo = spotsHubHeading({ name: "Tokyo", country: "Japan" });
    expect(seoul.title).toBe("Hidden gems in Seoul");
    expect(seoul.title).not.toBe(tokyo.title);
    expect(seoul.intro).toContain("Seoul, South Korea");
  });
});
