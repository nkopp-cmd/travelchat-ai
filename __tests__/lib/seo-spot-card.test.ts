import { describe, expect, it } from "vitest";
import { headlineSize, scoreLabel, spotCardText } from "@/lib/seo/spot-card";

describe("per-spot share card text", () => {
  it("uses the spot name, score label and city", () => {
    expect(spotCardText({ name: "Cafe Onion Anguk", category: "Cafe", score: 5, city: "Seoul" }))
      .toEqual({ headline: "Cafe Onion Anguk", label: "Hidden Gem", place: "Seoul" });
  });

  it("never draws a non-Latin name the bundled font cannot show", () => {
    expect(spotCardText({ name: "익선동 한옥거리", category: "Neighborhood", score: 4, city: "Seoul" }).headline)
      .toBe("Neighborhood in Seoul");
    expect(spotCardText({ name: "東京タワー", category: "Attraction", score: 3, city: null }).headline).toBe("Attraction");
  });

  it("keeps Latin names with accents, digits and punctuation", () => {
    expect(spotCardText({ name: "Café No. 9 — Thonglor", category: "Cafe", score: 6, city: "Bangkok" }).headline)
      .toBe("Café No. 9 — Thonglor");
  });

  it("clips long names and keeps the size readable", () => {
    const card = spotCardText({ name: "A".repeat(120), category: "Bar", score: 1, city: "Tokyo" });
    expect(card.headline.length).toBe(70);
    expect(card.headline.endsWith("…")).toBe(true);
    expect(headlineSize(card.headline)).toBe(50);
    expect(headlineSize("Short")).toBe(84);
  });

  it("maps scores to the same labels as the page title", () => {
    expect([6, 5, 4, 3, 0].map(scoreLabel)).toEqual(["Legendary Local Spot", "Hidden Gem", "Local Favorite", "Popular Spot", "Popular Spot"]);
  });
});
