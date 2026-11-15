import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("server-only", () => ({}));
import { homeGuideSpots, homeHubLinks } from "@/lib/seo/home-links";
import { ENABLED_CITIES } from "@/lib/cities";

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
