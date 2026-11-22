import { describe, expect, it } from "vitest";
import {
  describeCoverageSuggestion,
  suggestCoverageFallback,
  groundGeneratedDailyPlans,
  hasItineraryGroundingCoverage,
  ensurePinnedSpot,
  pinSelectedSpot,
  rankItineraryGroundingSpots,
  type ItineraryGroundingSpot,
} from "@/lib/itineraries/grounded-generation";

function spot(
  id: string,
  name: string,
  category: string,
  options: Partial<ItineraryGroundingSpot> = {},
): ItineraryGroundingSpot {
  return {
    id,
    name: { en: name },
    description: { en: `${name} is a real local place with a specific experience worth planning around.` },
    address: { en: `${id} Example-ro, Seoul` },
    category,
    subcategories: [],
    localley_score: 5,
    local_percentage: 85,
    photos: [`https://localley.io/images/spots/${id}.jpg`],
    location: `POINT(${126.97 + Number(id) / 100} ${37.55 + Number(id) / 100})`,
    verified: true,
    ...options,
  };
}

describe("grounded itinerary generation", () => {
  it("excludes tourist-heavy low-localness records from hidden-gem candidates", () => {
    const ranked = rankItineraryGroundingSpots([
      spot("1", "Gwangjang Market Bindaetteok Alley", "Food", {
        localley_score: 2,
        local_percentage: 30,
        subcategories: ["Market", "Tourist-heavy"],
      }),
      spot("2", "Huam-dong Stairs Village", "Nightlife"),
    ], {
      days: 1,
      interests: ["Nightlife & Bars"],
      localnessLevel: 4,
      pace: "relaxed",
    });

    expect(ranked.map((candidate) => candidate.id)).toEqual(["2"]);
  });

  it("keeps unverified public spots and ranks verified ones first at equal quality", () => {
    const ranked = rankItineraryGroundingSpots([
      spot("1", "Unverified Noodle Bar", "Food", { verified: false }),
      spot("2", "Verified Noodle Bar", "Food"),
      spot("3", "Unverified Short Text", "Food", { verified: false, description: { en: "Too short." } }),
    ], { days: 1, interests: [], localnessLevel: 3, pace: "moderate" });

    expect(ranked.map((candidate) => candidate.id)).toEqual(["2", "1"]);
  });

  it("enforces relaxed pacing, category diversity, and real spot hydration", () => {
    const candidates = [
      spot("1", "Mangwon Food Alley", "Market"),
      spot("2", "Namdaemun Market", "Market"),
      spot("3", "Huam Rooftop Bar", "Nightlife"),
      spot("4", "Seoul Forest Walk", "Outdoor"),
    ];

    const result = groundGeneratedDailyPlans([{
      day: 1,
      theme: "Food and drinks",
      activities: [
        { spotId: "1", name: "Mangwon Food Alley", category: "market", description: "Short." },
        { spotId: "2", name: "Namdaemun Market", category: "market", description: "Short." },
        { spotId: "3", name: "Huam Rooftop Bar", category: "bar", description: "Short." },
        { spotId: "4", name: "Seoul Forest Walk", category: "park", description: "Short." },
      ],
    }], candidates, {
      days: 1,
      interests: ["Nightlife & Bars", "Food & Dining"],
      localnessLevel: 4,
      pace: "relaxed",
    });

    expect(result[0].activities).toHaveLength(3);
    expect(result[0].activities?.map((activity) => activity.name)).toEqual([
      "Mangwon Food Alley",
      "Huam Rooftop Bar",
      "Seoul Forest Walk",
    ]);
    expect(result[0].activities?.every((activity) => activity.image?.includes("localley.io/images/spots/"))).toBe(true);
    expect(result[0].activities?.every((activity) => typeof activity.lat === "number" && typeof activity.lng === "number")).toBe(true);
    expect(result[0].activities?.[0].description).toContain("real local place");
  });

  it("fills sparse model output from nearby verified photographed candidates", () => {
    const candidates = [
      spot("1", "Huam Rooftop Bar", "Nightlife"),
      spot("2", "Sindang Food Street", "Food"),
      spot("3", "Seoul Forest Walk", "Outdoor"),
      spot("4", "Dongmyo Vintage Shops", "Shopping"),
    ];
    const result = groundGeneratedDailyPlans([
      { day: 1, activities: [{ spotId: "1", name: "Huam Rooftop Bar" }] },
    ], candidates, { days: 2, localnessLevel: 4, pace: "relaxed" });

    expect(result.map((day) => day.activities?.length)).toEqual([2, 2]);
    const ids = result.flatMap((day) => day.activities?.map((activity) => activity.spotId) || []);
    expect(new Set(ids).size).toBe(4);
  });

  it("requires enough photographed candidates before strict grounding", () => {
    const candidates = [spot("1", "One Place", "Food")];
    expect(hasItineraryGroundingCoverage(candidates, {
      days: 2,
      pace: "relaxed",
    })).toBe(false);
  });

  it("rejects market-heavy coverage that cannot satisfy relaxed days", () => {
    const candidates = [
      spot("1", "Market One", "Market"),
      spot("2", "Market Two", "Market"),
      spot("3", "Market Three", "Market"),
      spot("4", "One Bar", "Nightlife"),
    ];
    expect(hasItineraryGroundingCoverage(candidates, {
      days: 2,
      interests: ["Nightlife & Bars"],
      pace: "relaxed",
    })).toBe(false);
  });

  it("replaces a full off-interest day with a requested interest", () => {
    const candidates = [
      spot("1", "Outdoor One", "Outdoor"),
      spot("2", "Shopping Two", "Shopping"),
      spot("3", "Culture Three", "Culture"),
      spot("4", "Night Bar Four", "Nightlife"),
    ];
    const result = groundGeneratedDailyPlans([{
      day: 1,
      activities: candidates.slice(0, 3).map((candidate) => ({
        spotId: candidate.id,
        name: typeof candidate.name === "object" ? candidate.name.en : candidate.name,
      })),
    }], candidates, {
      days: 1,
      interests: ["Nightlife & Bars"],
      pace: "relaxed",
    });

    expect(result[0].activities).toHaveLength(3);
    expect(result[0].activities?.some((activity) => activity.spotId === "4")).toBe(true);
  });

  it("reserves the relaxed minimum for remaining requested days", () => {
    const candidates = [
      spot("1", "First Food", "Food"),
      spot("2", "Second Cafe", "Cafe"),
      spot("3", "Third Park", "Outdoor"),
      spot("4", "Fourth Bar", "Nightlife"),
    ];
    const result = groundGeneratedDailyPlans([{
      day: 1,
      activities: candidates.slice(0, 3).map((candidate) => ({
        spotId: candidate.id,
        name: typeof candidate.name === "object" ? candidate.name.en : candidate.name,
      })),
    }], candidates, { days: 2, pace: "relaxed" });

    expect(result.map((day) => day.activities?.length)).toEqual([2, 2]);
  });

  it("reserves future non-market capacity for market-heavy catalogs", () => {
    const candidates = [
      spot("1", "Market One", "Market"),
      spot("2", "Market Two", "Market"),
      spot("3", "Park Three", "Outdoor"),
      spot("4", "Cafe Four", "Cafe"),
    ];
    const result = groundGeneratedDailyPlans([{
      day: 1,
      activities: [
        { spotId: "3", name: "Park Three" },
        { spotId: "4", name: "Cafe Four" },
      ],
    }], candidates, { days: 2, pace: "relaxed" });

    expect(result.map((day) => day.activities?.length)).toEqual([2, 2]);
    expect(result.map((day) =>
      day.activities?.filter((activity) => activity.category === "Market").length,
    )).toEqual([1, 1]);
  });

  it("rejects more requested interests than the schedule can hold", () => {
    const candidates = [
      spot("1", "Food One", "Food"),
      spot("2", "Cafe Two", "Cafe"),
      spot("3", "Bar Three", "Nightlife"),
      spot("4", "Park Four", "Outdoor"),
    ];
    expect(hasItineraryGroundingCoverage(candidates, {
      days: 1,
      interests: ["Food & Dining", "Cafes & Coffee", "Nightlife & Bars", "Nature & Parks"],
      pace: "relaxed",
    })).toBe(false);
  });

  it("schedules deterministic nightlife fillers in the evening", () => {
    const candidates = [
      spot("1", "Lunch Counter", "Food", { best_times: { en: "Lunch" } }),
      spot("2", "Late Bar", "Nightlife", { best_times: { en: "Late evening" } }),
    ];
    const result = groundGeneratedDailyPlans([{
      day: 1,
      activities: [{ spotId: "1", name: "Lunch Counter", time: "12:00 PM", type: "afternoon" }],
    }], candidates, {
      days: 1,
      interests: ["Nightlife & Bars"],
      pace: "relaxed",
    });

    const nightlife = result[0].activities?.find((activity) => activity.spotId === "2");
    expect(nightlife).toMatchObject({ time: "7:00 PM", type: "evening" });
  });

  it("repairs a long leg with a nearby same-category spot without changing its time", () => {
    const candidates = [
      spot("1", "Start", "Outdoor", { location: "POINT(126.90 37.55)" }),
      spot("2", "Far Dinner", "Food", { location: "POINT(127.50 37.90)" }),
      spot("3", "Nearby Dinner", "Food", { location: "POINT(126.91 37.56)" }),
    ];
    const result = groundGeneratedDailyPlans([{
      day: 1,
      activities: [
        { spotId: "1", name: "Start", time: "11:00 AM", type: "morning" },
        { spotId: "2", name: "Far Dinner", time: "7:00 PM", type: "evening" },
      ],
    }], candidates, { days: 1, pace: "relaxed" });

    expect(result[0].activities?.[1]).toMatchObject({
      spotId: "3",
      name: "Nearby Dinner",
      time: "7:00 PM",
      type: "evening",
    });
  });

  it("fails instead of publishing an unrepaired long route", () => {
    const candidates = [
      spot("1", "Start", "Outdoor", { location: "POINT(126.90 37.55)" }),
      spot("2", "Far Dinner", "Food", { location: "POINT(127.50 37.90)" }),
    ];
    expect(() => groundGeneratedDailyPlans([{
      day: 1,
      activities: [
        { spotId: "1", name: "Start", time: "11:00 AM" },
        { spotId: "2", name: "Far Dinner", time: "7:00 PM" },
      ],
    }], candidates, { days: 1, pace: "relaxed" })).toThrow("geographically feasible");
  });

  it("reports no coverage when the counts fit but no feasible route exists", () => {
    const candidates = [
      spot("1", "Start", "Outdoor", { location: "POINT(126.90 37.55)" }),
      spot("2", "Far Dinner", "Food", { location: "POINT(127.50 37.90)" }),
    ];
    expect(hasItineraryGroundingCoverage(candidates, { days: 1, pace: "relaxed" })).toBe(false);
  });

  it("keeps coverage for a nearby pool that grounds into a valid schedule", () => {
    const candidates = [
      spot("1", "Morning Walk", "Outdoor"),
      spot("2", "Lunch Counter", "Food"),
      spot("3", "Gallery Lane", "Culture"),
      spot("4", "Night Bar", "Nightlife"),
    ];
    expect(hasItineraryGroundingCoverage(candidates, { days: 2, pace: "relaxed" })).toBe(true);
  });
});

describe("add-to-trip pinned spot", () => {
  const prefs = { days: 1, interests: ["Nightlife & Bars"], localnessLevel: 4, pace: "relaxed" as const };

  it("moves the chosen spot to the front of the candidate list", () => {
    const ranked = [spot("1", "One", "Food"), spot("2", "Two", "Nightlife"), spot("3", "Three", "Outdoor")];
    const result = pinSelectedSpot(ranked, ranked, "3");
    expect(result.pinnedId).toBe("3");
    expect(result.spots.map((candidate) => candidate.id)).toEqual(["3", "1", "2"]);
  });

  it("uses the ranked twin when the chosen row lost the name dedupe", () => {
    const ranked = [spot("1", "One", "Food"), spot("2", "Twin Bar", "Nightlife")];
    const pool = [...ranked, spot("9", "Twin  bar", "Nightlife")];
    expect(pinSelectedSpot(ranked, pool, "9").pinnedId).toBe("2");
  });

  it("changes nothing for an unknown or other-city spot", () => {
    const ranked = [spot("1", "One", "Food"), spot("2", "Two", "Nightlife")];
    expect(pinSelectedSpot(ranked, ranked, "77")).toEqual({ spots: ranked });
    expect(pinSelectedSpot(ranked, ranked, undefined)).toEqual({ spots: ranked });
    const plans = [{ day: 1, activities: [{ spotId: "1", name: "One" }] }];
    expect(ensurePinnedSpot(plans, ranked, undefined, prefs)).toBe(plans);
  });

  it("keeps plans that already include the spot", () => {
    const ranked = [spot("1", "One", "Food"), spot("2", "Two", "Nightlife")];
    const plans = [{ day: 1, activities: [{ spotId: "2", name: "Two" }, { spotId: "1", name: "One" }] }];
    expect(ensurePinnedSpot(plans, ranked, "2", prefs)).toBe(plans);
  });

  it("puts the spot into the slot of the nearest stop and keeps its time and interest cover", () => {
    const ranked = [
      spot("1", "Night Bar", "Nightlife"),
      spot("2", "Food Two", "Food"),
      spot("5", "Outdoor Five", "Outdoor"),
      spot("6", "Chosen Gallery", "Culture"),
    ];
    const plans = [{ day: 1, activities: [
      { spotId: "1", name: "Night Bar", time: "7:00 PM" },
      { spotId: "2", name: "Food Two", time: "12:00 PM" },
      { spotId: "5", name: "Outdoor Five", time: "3:00 PM" },
    ] }];
    const result = ensurePinnedSpot(plans, ranked, "6", prefs);
    const ids = result[0].activities?.map((activity) => activity.spotId);
    expect(ids).toEqual(["1", "2", "6"]);
    expect(result[0].activities?.[2].time).toBe("3:00 PM");
    expect(result[0].activities?.[2].name).toBe("Chosen Gallery");
  });

  it("never removes the only stop that covers a requested interest", () => {
    const ranked = [spot("1", "Night Bar", "Nightlife"), spot("2", "Chosen Gallery", "Culture")];
    const plans = [{ day: 1, activities: [{ spotId: "1", name: "Night Bar" }] }];
    expect(ensurePinnedSpot(plans, ranked, "2", prefs)).toBe(plans);
  });

  it("always includes a chosen spot from the pool when a slot is free of interest duty", () => {
    for (let chosen = 1; chosen <= 6; chosen += 1) {
      const ranked = Array.from({ length: 6 }, (_, index) =>
        spot(String(index + 1), `Place ${index + 1}`, index % 2 ? "Food" : "Outdoor"));
      const plans = [{ day: 1, activities: [1, 2, 3].map((id) => ({ spotId: String(id), name: `Place ${id}` })) }];
      const { pinnedId } = pinSelectedSpot(ranked, ranked, String(chosen));
      const result = ensurePinnedSpot(plans, ranked, pinnedId, { days: 1, localnessLevel: 4, pace: "relaxed" });
      expect(result[0].activities?.some((activity) => activity.spotId === String(chosen))).toBe(true);
      expect(result[0].activities).toHaveLength(3);
    }
  });
});

describe("suggestCoverageFallback (push CG3)", () => {
  it("keeps the trip length first: broader interests, then relaxed pace", () => {
    const seen: string[] = [];
    const result = suggestCoverageFallback({ days: 3, pace: "moderate", interests: ["food"] }, (p) => {
      seen.push(`${p.days}/${p.pace}/${(p.interests ?? []).join(",")}`);
      return p.pace === "relaxed" && (p.interests ?? []).length === 1;
    });
    expect(result).toEqual({ days: 3, pace: "relaxed", interests: ["food"] });
    expect(seen).toEqual(["3/moderate/", "3/relaxed/food"]);
  });

  it("falls back to the largest number of days that passes", () => {
    const result = suggestCoverageFallback({ days: 5, pace: "relaxed", interests: [] }, (p) => p.days <= 2);
    expect(result).toEqual({ days: 2, pace: "relaxed", interests: [] });
  });

  it("returns null when nothing passes and stops after a fixed number of checks", () => {
    let checks = 0;
    const result = suggestCoverageFallback({ days: 14, pace: "packed", interests: ["food", "culture"] }, () => { checks += 1; return false; });
    expect(result).toBeNull();
    expect(checks).toBeLessThanOrEqual(12);
  });

  it("never suggests the same mix that just failed", () => {
    const prefs = { days: 1, pace: "relaxed", interests: [] as string[] };
    expect(suggestCoverageFallback(prefs, () => true)).toBeNull();
  });

  it("describes the suggestion in plain words", () => {
    expect(describeCoverageSuggestion({ days: 2, pace: "relaxed", interests: [] }, ["food"])).toBe("2-day relaxed plan with all interests");
    expect(describeCoverageSuggestion({ days: 2, pace: "relaxed", interests: [] }, [])).toBe("2-day relaxed plan");
    expect(describeCoverageSuggestion({ days: 3, pace: "moderate", interests: ["food"] })).toBe("3-day plan");
  });
});
