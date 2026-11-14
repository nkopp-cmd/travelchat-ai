import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { groupByInitial, nearestEntries, scoreCounts, toDirectoryEntries, topPicks } from "@/lib/spots/city-directory";

const rows = [
  { id: "1", name: { en: "Zen Cafe" }, category: "Cafe", latitude: 37.57, longitude: 126.98 },
  { id: "2", name: { en: "alley bar" }, category: "Nightlife", latitude: 37.5701, longitude: 126.9801 },
  { id: "3", name: { ko: "광장시장" }, category: "Market", latitude: 37.57, longitude: 127.0 },
  { id: "4", name: "", category: null, latitude: 37.5, longitude: 127 },
  { id: "5", name: { en: "Bukchon Walk" }, category: "Outdoor", latitude: null, longitude: null },
];

describe("toDirectoryEntries", () => {
  it("names rows (en first), drops nameless rows and sorts A-Z ignoring case", () => {
    expect(toDirectoryEntries(rows).map((e) => e.name)).toEqual(["alley bar", "Bukchon Walk", "Zen Cafe", "광장시장"]);
  });
});

describe("nearestEntries", () => {
  const entries = toDirectoryEntries(rows);

  it("returns the closest entries with coordinates, excluding given ids", () => {
    const near = nearestEntries(entries, { lat: 37.57, lng: 126.98 }, ["1"], 6);
    expect(near.map((e) => e.id)).toEqual(["2", "3"]);
    expect(near[0].distanceKm).toBeLessThan(near[1].distanceKm);
  });

  it("returns nothing for an unusable origin", () => {
    expect(nearestEntries(entries, { lat: 0, lng: 0 }, [], 6)).toEqual([]);
  });

  it("property: at most `limit`, never an excluded id, sorted by distance", () => {
    const arb = fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }), category: fc.constant(null),
      latitude: fc.double({ min: 35, max: 38, noNaN: true }), longitude: fc.double({ min: 126, max: 128, noNaN: true }) }), { maxLength: 30 });
    fc.assert(fc.property(arb, fc.integer({ min: 0, max: 8 }), (input, limit) => {
      const list = toDirectoryEntries(input);
      const exclude = list.slice(0, 2).map((e) => e.id);
      const out = nearestEntries(list, { lat: 36.5, lng: 127 }, exclude, limit);
      expect(out.length).toBeLessThanOrEqual(limit);
      for (const e of out) expect(exclude).not.toContain(e.id);
      for (let i = 1; i < out.length; i += 1) expect(out[i].distanceKm).toBeGreaterThanOrEqual(out[i - 1].distanceKm);
    }));
  });
});

describe("groupByInitial", () => {
  it("groups by first Latin letter, accents folded, other scripts under # last", () => {
    const groups = groupByInitial(toDirectoryEntries([...rows, { id: "6", name: { en: "Élan" }, category: null, latitude: null, longitude: null }]));
    expect(groups.map((g) => g.letter)).toEqual(["A", "B", "E", "Z", "#"]);
  });
});

describe("topPicks", () => {
  it("keeps hub score order (rank), filters one category and caps the list", () => {
    const entries = toDirectoryEntries([
      { id: "a", name: "Zebra Cafe", category: "Cafe" },
      { id: "b", name: "Apple Food", category: "Food" },
      { id: "c", name: "Mellow Cafe", category: "Cafe" },
      { id: "d", name: "Brew Cafe", category: "Cafe" },
    ]);
    expect(topPicks(entries, "Cafe", 2).map((e) => e.id)).toEqual(["a", "c"]);
    expect(topPicks(entries, "Food").map((e) => e.id)).toEqual(["b"]);
    expect(topPicks(entries, "Cafe", 0)).toEqual([]);
  });

  it("property: at most `limit`, one category, ranks ascending", () => {
    const arb = fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }), category: fc.constantFrom("Cafe", "Food", null) }), { maxLength: 40 });
    fc.assert(fc.property(arb, fc.integer({ min: 0, max: 8 }), (input, limit) => {
      const out = topPicks(toDirectoryEntries(input), "Cafe", limit);
      expect(out.length).toBeLessThanOrEqual(limit);
      for (const e of out) expect(e.category).toBe("Cafe");
      for (let i = 1; i < out.length; i++) expect(out[i].rank).toBeGreaterThan(out[i - 1].rank);
    }));
  });
});

describe("scoreCounts", () => {
  it("counts valid scores 6..1 and ignores missing or invalid ones", () => {
    const entries = toDirectoryEntries([
      { id: "a", name: "A", localley_score: 5 },
      { id: "b", name: "B", localley_score: 5 },
      { id: "c", name: "C", localley_score: 3 },
      { id: "d", name: "D", localley_score: null },
      { id: "e", name: "E", localley_score: 9 },
      { id: "f", name: "F", localley_score: 4.5 },
    ]);
    expect(scoreCounts(entries)).toEqual([
      { score: 6, count: 0 }, { score: 5, count: 2 }, { score: 4, count: 0 },
      { score: 3, count: 1 }, { score: 2, count: 0 }, { score: 1, count: 0 },
    ]);
  });

  it("property: the counts sum to the entries with a 1-6 integer score", () => {
    const arb = fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }).filter((n) => n.trim().length > 0),
      localley_score: fc.oneof(fc.constant(null), fc.integer({ min: -2, max: 9 }), fc.double({ noNaN: true })) }), { maxLength: 60 });
    fc.assert(fc.property(arb, (input) => {
      const entries = toDirectoryEntries(input);
      const counts = scoreCounts(entries);
      expect(counts.map((c) => c.score)).toEqual([6, 5, 4, 3, 2, 1]);
      const valid = entries.filter((e) => e.score !== null && Number.isInteger(e.score) && e.score >= 1 && e.score <= 6).length;
      expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(valid);
      expect(entries.every((e) => e.score === null || (e.score >= 1 && e.score <= 6))).toBe(true);
    }));
  });
});
