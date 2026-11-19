import { describe, expect, it } from "vitest";
import { creditCitySlug, groupCreditsByCity } from "@/lib/credits";
import type { D1PhotoCredit } from "@/lib/spots/d1-queries";

const credit = (spotId: string, city: string | null, n: number, name: D1PhotoCredit["spotName"] = { en: `Spot ${spotId}` }): D1PhotoCredit =>
  ({ spotId, spotName: name, city, src: `/media/spot/${spotId}/${n}.webp`, credit: `Author ${n}, CC BY-SA 4.0`, sourceUrl: n % 2 ? `https://commons.wikimedia.org/wiki/File:${n}.jpg` : null });

describe("photo credits per city (Push AS3)", () => {
  it("makes stable URL slugs", () => {
    expect(creditCitySlug("Seoul")).toBe("seoul");
    expect(creditCitySlug("Ho Chi Minh City")).toBe("ho-chi-minh-city");
    expect(creditCitySlug("São Paulo")).toBe("sao-paulo");
    expect(creditCitySlug("서울")).toBe("more-places");
  });

  it("keeps every credit, one entry per spot, in input order", () => {
    const input = [credit("a", "Seoul", 1), credit("a", "Seoul", 2), credit("b", "Seoul", 3), credit("c", "Tokyo", 4, "Shibuya"), credit("d", null, 5)];
    const cities = groupCreditsByCity(input);
    expect(cities.map((c) => [c.slug, c.city, c.spots.length, c.photoCount])).toEqual([
      ["seoul", "Seoul", 2, 3], ["tokyo", "Tokyo", 1, 1], ["more-places", "More places", 1, 1],
    ]);
    expect(cities[0].spots[0]).toEqual({ id: "a", name: "Spot a", photos: [
      { credit: "Author 1, CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:1.jpg" },
      { credit: "Author 2, CC BY-SA 4.0", sourceUrl: null },
    ] });
    expect(cities[1].spots[0].name).toBe("Shibuya");
    expect(cities.reduce((n, c) => n + c.photoCount, 0)).toBe(input.length);
  });

  it("merges a spot whose rows are not adjacent", () => {
    const cities = groupCreditsByCity([credit("a", "Seoul", 1), credit("b", "Seoul", 2), credit("a", "Seoul", 3)]);
    expect(cities[0].spots.map((s) => [s.id, s.photos.length])).toEqual([["a", 2], ["b", 1]]);
  });
});
