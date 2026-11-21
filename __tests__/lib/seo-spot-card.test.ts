import { describe, expect, it } from "vitest";
import { headlineSize, scoreLabel, spotCardText, spotMetaDescription, SPOT_META_TAIL, spotPageTitle } from "@/lib/seo/spot-card";

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

describe("spot page title (Push CC1)", () => {
  it("names the city once and the task, never the score tier", () => {
    expect(spotPageTitle("Nipponbashi Denden Town", "Osaka")).toBe("Nipponbashi Denden Town, Osaka: local tips and map");
    for (const tier of ["Local Favorite", "Hidden Gem", "Legendary", "Popular Spot"]) {
      expect(spotPageTitle("Cafe Onion Anguk", "Seoul")).not.toContain(tier);
    }
  });

  it("does not repeat a city the name already holds (accents folded)", () => {
    expect(spotPageTitle("Seoul Forest", "Seoul")).toBe("Seoul Forest: local tips and map");
    expect(spotPageTitle("Chợ Bến Thành Ho Chi Minh", "Ho Chi Minh")).toBe("Chợ Bến Thành Ho Chi Minh: local tips and map");
  });

  it("drops the task, then cuts the name, but keeps the city within 54 chars", () => {
    expect(spotPageTitle("Gwangjang Traditional Market Food Alley", "Seoul")).toBe("Gwangjang Traditional Market Food Alley, Seoul");
    const long = spotPageTitle("The Very Long Name Of A Rooftop Bar Above The River Terminal", "Bangkok");
    expect(long.length).toBeLessThanOrEqual(54);
    expect(long.endsWith("…, Bangkok")).toBe(true);
  });

  it("works without a known city", () => {
    expect(spotPageTitle("  Blue   Door  ", null)).toBe("Blue Door: local tips and map");
  });

  it("never exceeds the limit for any name and city", () => {
    const names = ["A", "Namsan Seoul Tower", "x".repeat(80), "Café — No. 9", "익선동 한옥거리 골목 카페 거리"];
    for (const name of names) for (const city of [null, "Seoul", "Kuala Lumpur", "Ho Chi Minh"]) {
      expect(spotPageTitle(name, city).length).toBeLessThanOrEqual(54);
    }
  });
});

describe("spot page meta description (Push CD1)", () => {
  it("names the place and city, keeps the local note and ends with the planner", () => {
    expect(spotMetaDescription({ name: "Bedok Mall", category: "Shopping", city: "Singapore", text: "East side neighborhood mall. Above MRT." }))
      .toBe("Bedok Mall, Singapore: East side neighborhood mall. Above MRT. Local tips, map and a free trip planner.");
  });

  it("never shows the internal score", () => {
    const text = spotMetaDescription({ name: "Changi Beach Park", category: "Nature", city: "Singapore", text: "Quiet beach in far east" });
    expect(text).not.toMatch(/Localley Score|\/6/);
    expect(text).toBe("Changi Beach Park, Singapore: Quiet beach in far east. Local tips, map and a free trip planner.");
  });

  it("does not repeat a city already in the name and has a fallback without a note", () => {
    expect(spotMetaDescription({ name: "Seoul Forest", category: "Park", city: "Seoul", text: "" }))
      .toBe("Seoul Forest: a park spot that locals recommend. Local tips, map and a free trip planner.");
    expect(spotMetaDescription({ name: "Wat Pho", category: "Temple", city: null, text: "" }))
      .toBe("Wat Pho: a temple spot that locals recommend. Local tips, map and a free trip planner.");
  });

  it("clips a long note but keeps the planner tail within 160 chars", () => {
    const text = spotMetaDescription({ name: "Nipponbashi Denden Town", category: "Shopping", city: "Osaka", text: "word ".repeat(80) });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith(`… ${SPOT_META_TAIL}`)).toBe(true);
    expect(text.startsWith("Nipponbashi Denden Town, Osaka: word")).toBe(true);
  });

  it("stays within 160 chars for any input", () => {
    for (let n = 0; n < 300; n += 7) {
      const out = spotMetaDescription({ name: "N".repeat(n % 90 + 1), category: "Cafe", city: "Tokyo", text: "a ".repeat(n) });
      expect(out.length).toBeLessThanOrEqual(160);
      expect(out.endsWith(SPOT_META_TAIL)).toBe(true);
    }
  });
});
