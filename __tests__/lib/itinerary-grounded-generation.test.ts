import { describe, expect, it } from "vitest";
import {
  groundGeneratedDailyPlans,
  hasItineraryGroundingCoverage,
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
});
