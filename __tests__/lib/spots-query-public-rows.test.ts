import { describe, expect, it } from "vitest";
import {
  getPublicVisibleSpotRows,
  getScoreThresholdCount,
} from "@/lib/spots/queries";
import type { RawSpot } from "@/lib/spots/transform";

function makeSpot(overrides: Partial<RawSpot> = {}): RawSpot {
  return {
    id: "spot_1",
    name: { en: "Ikseon Tea Room" },
    description: { en: "A quiet tea room in a narrow alley." },
    address: { en: "17 Supyo-ro 28-gil, Jongno-gu, Seoul" },
    category: "Cafe",
    subcategories: ["Tea"],
    location: { type: "Point", coordinates: [126.9908, 37.5744] },
    localley_score: 5,
    local_percentage: 88,
    best_time: "Late afternoon",
    best_times: { en: "Late afternoon" },
    photos: ["/api/places/photo?name=places%2FChIJabc123%2Fphotos%2Fphoto456&w=1200"],
    google_place_id: "ChIJabc123",
    tips: ["Go before the dinner rush."],
    verified: true,
    trending_score: 0.2,
    ...overrides,
  };
}

describe("public visible spot rows", () => {
  it("deduplicates visible rows by localized name and address", () => {
    const rows = getPublicVisibleSpotRows([
      makeSpot({ id: "spot_1" }),
      makeSpot({ id: "spot_2" }),
      makeSpot({
        id: "spot_3",
        name: { en: "Gwangjang Market" },
        address: { en: "88 Changgyeonggung-ro, Jongno-gu, Seoul, Korea" },
        photos: ["/api/places/photo?name=places%2FChIJmarket%2Fphotos%2Fphoto1&w=1200"],
        google_place_id: "ChIJmarket",
      }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["spot_1", "spot_3"]);
  });

  it("removes hidden weak public rows before list and count code uses them", () => {
    const rows = getPublicVisibleSpotRows([
      makeSpot({ id: "spot_visible" }),
      makeSpot({
        id: "spot_hidden_broad",
        name: { en: "Shinjuku Office District" },
      }),
      makeSpot({
        id: "spot_hidden_photo",
        name: { en: "Real Cafe Name" },
        photos: ["/images/placeholders/cafe.svg"],
      }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["spot_visible"]);
  });

  it("counts score filters as thresholds to match 5+ and 4+ labels", () => {
    const rows = [
      makeSpot({ id: "score_6", localley_score: 6 }),
      makeSpot({ id: "score_5", localley_score: 5 }),
      makeSpot({ id: "score_4", localley_score: 4 }),
      makeSpot({ id: "score_3", localley_score: 3 }),
    ];

    expect(getScoreThresholdCount(rows, 6)).toBe(1);
    expect(getScoreThresholdCount(rows, 5)).toBe(2);
    expect(getScoreThresholdCount(rows, 4)).toBe(3);
    expect(getScoreThresholdCount(rows, 3)).toBe(4);
  });
});
