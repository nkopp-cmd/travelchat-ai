import { describe, expect, it } from "vitest";
import { categoryNoun, spotIntro } from "@/lib/seo/spot-intro";

const entry = (id: string, rank: number, distanceKm = 0) => ({ id, name: `Spot ${id}`, category: "Cafe", lat: 1, lng: 1, rank, score: 5, distanceKm });

describe("spotIntro", () => {
  it("states score, hub rank and the closest neighbours from own data", () => {
    const directory = [entry("a", 0), entry("b", 1), entry("self", 11)];
    const text = spotIntro({
      id: "SELF", name: "Mangwon Market", category: "Market", score: 5, area: "Mapo-gu", city: "Seoul", directory,
      nearby: [entry("a", 0, 0.234), entry("b", 1, 0.6), entry("c", 2, 1.4)],
    });
    expect(text).toBe(
      "Mangwon Market is a market in Mapo-gu, Seoul, rated Hidden Gem and ranked 12th of 3 rated places in Seoul. " +
      "The closest rated spot is Spot a, 230 m away. 2 rated spots are within a 10-minute walk.",
    );
  });

  it("stays one sentence without neighbours and drops a repeated city", () => {
    expect(spotIntro({ id: "x", name: "Jjim", category: "", score: 6, area: "Seoul", city: "Seoul", directory: [], nearby: [] }))
      .toBe("Jjim is a place in Seoul, rated Legendary Local Spot.");
  });

  it("gives every page a different lead for different spots and neighbours", () => {
    const base = { category: "Bar", score: 4, area: "Shibuya", city: "Tokyo", directory: [] };
    const a = spotIntro({ ...base, id: "1", name: "One", nearby: [entry("x", 0, 2)] });
    const b = spotIntro({ ...base, id: "2", name: "Two", nearby: [entry("y", 0, 2)] });
    expect(a).not.toBe(b);
    expect(a).toContain("2.0 km away.");
  });

  it("names field categories as a spot and keeps countable ones (push CE1)", () => {
    expect(spotIntro({ id: "b", name: "Bedok Mall", category: "Shopping", score: 5, area: "Singapore", city: "Singapore", directory: [], nearby: [] }))
      .toBe("Bedok Mall is a shopping spot in Singapore, rated Hidden Gem.");
    expect(spotIntro({ id: "o", name: "Chestnut Nature Park", category: "Outdoor", score: 4, area: "", city: "Singapore", directory: [], nearby: [] }))
      .toBe("Chestnut Nature Park is an outdoor spot in Singapore, rated Local Favorite.");
    expect(categoryNoun("Cafe")).toBe("cafe");
    expect(categoryNoun("Historic Site")).toBe("historic site");
    expect(categoryNoun("Entertainment")).toBe("entertainment spot");
    expect(categoryNoun(" ")).toBe("place");
  });

  it("never shows the internal score scale", () => {
    for (const score of [1, 3, 4, 5, 6]) {
      expect(spotIntro({ id: "x", name: "X", category: "Food", score, area: "", city: "Tokyo", directory: [], nearby: [] })).not.toMatch(/Localley Score|\/6/);
    }
  });
});
