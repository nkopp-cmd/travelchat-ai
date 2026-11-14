import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { indexableSitemapRows, isSpotIndexable, MIN_INDEXABLE_DESCRIPTION, spotsHubHeading } from "@/lib/seo/spot-indexable";

const long = "A quiet riverside noodle bar where office workers queue at noon for hand-cut kalguksu and kimchi.";

describe("isSpotIndexable", () => {
  it("indexes a spot with a guide even without description or photo", () => {
    expect(isSpotIndexable({ description: null, hasPhoto: false, hasGuide: true })).toBe(true);
  });

  it("needs both a photo and a description of the minimum length", () => {
    expect(long.length).toBeGreaterThanOrEqual(MIN_INDEXABLE_DESCRIPTION);
    expect(isSpotIndexable({ description: long, hasPhoto: true, hasGuide: false })).toBe(true);
    expect(isSpotIndexable({ description: long, hasPhoto: false, hasGuide: false })).toBe(false);
    expect(isSpotIndexable({ description: "Good food.", hasPhoto: true, hasGuide: false })).toBe(false);
    expect(isSpotIndexable({ description: undefined, hasPhoto: true, hasGuide: false })).toBe(false);
  });

  it("does not count link text towards the description length", () => {
    const linky = "Menu. [The full venue guide with opening hours and prices](https://example.com/a-very-long-menu-path)";
    expect(isSpotIndexable({ description: linky, hasPhoto: true, hasGuide: false })).toBe(false);
  });

  it("property: a guide always indexes; no photo and no guide never indexes", () => {
    fc.assert(fc.property(fc.option(fc.string()), fc.boolean(), (description, hasPhoto) => {
      expect(isSpotIndexable({ description, hasPhoto, hasGuide: true })).toBe(true);
      expect(isSpotIndexable({ description, hasPhoto: false, hasGuide: false })).toBe(false);
    }));
  });
});

describe("indexableSitemapRows", () => {
  const row = (id: string, extra: Partial<Parameters<typeof indexableSitemapRows>[0][number]> = {}) => ({
    id, lastmod: null, name: `Spot ${id}`, address: `${id} Street`, description: long, hasPhoto: true, ...extra,
  });

  it("drops thin rows, keeps guided rows and sorts by id", () => {
    const rows = [row("c"), row("a", { description: "short" }), row("b", { description: "", hasPhoto: false })];
    expect(indexableSitemapRows(rows, new Set(["b"])).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("keeps only the first row of a name+address duplicate, like the hub", () => {
    const rows = [row("z", { name: "Same", address: "One Road" }), row("a", { name: " same ", address: "ONE ROAD" })];
    expect(indexableSitemapRows(rows, new Set()).map((r) => r.id)).toEqual(["z"]);
  });

  it("property: output ids are unique, a subset of the input, and every one is indexable", () => {
    const arb = fc.array(fc.record({
      id: fc.uuid(), lastmod: fc.constant(null), name: fc.constantFrom("A", "B", "C"), address: fc.constantFrom("x", "y"),
      description: fc.constantFrom("", "short", long), hasPhoto: fc.boolean(),
    }), { maxLength: 40 });
    fc.assert(fc.property(arb, fc.boolean(), (rows, guideAll) => {
      const guides = new Set(guideAll ? rows.map((r) => r.id.toLowerCase()) : []);
      const out = indexableSitemapRows(rows, guides);
      const ids = out.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of ids) {
        const source = byId.get(id)!;
        expect(isSpotIndexable({ description: source.description, hasPhoto: source.hasPhoto, hasGuide: guides.has(id.toLowerCase()) })).toBe(true);
      }
    }));
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
