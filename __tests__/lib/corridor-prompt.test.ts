import { describe, expect, it } from "vitest";
import type { CorridorPlan } from "@/lib/trips/corridor-planner";
import {
  buildCorridorUserPrompt,
  corridorLegsFromPlan,
  corridorRouteLabel,
  corridorTransferInsights,
  splitDailyPlansByLeg,
  transferDayIndexes,
} from "@/lib/itineraries/corridor-prompt";

const plan: CorridorPlan = {
  plannerVersion: "corridor-v1",
  totalDays: 6,
  totalNights: 5,
  stops: [
    { destinationSlug: "seoul", position: 0, nights: 3, locked: false },
    { destinationSlug: "busan", position: 1, nights: 2, locked: false },
  ],
  transfers: [{
    position: 0,
    edgeId: "kr-seoul-busan-ktx",
    from: "seoul",
    to: "busan",
    mode: "train",
    durationMinutes: { min: 150, max: 200 },
    occupiedMinutes: 255,
    terminalBufferMinutes: 55,
    costBand: "moderate",
    confidence: 0.95,
  }],
  days: [
    { dayIndex: 1, localDate: null, destinationSlug: "seoul", type: "arrival", activeMinutesBudget: 300 },
    { dayIndex: 2, localDate: null, destinationSlug: "seoul", type: "full", activeMinutesBudget: 540 },
    { dayIndex: 3, localDate: null, destinationSlug: "seoul", type: "full", activeMinutesBudget: 540 },
    { dayIndex: 4, localDate: null, destinationSlug: "busan", type: "transfer", activeMinutesBudget: 120, transferPosition: 0 },
    { dayIndex: 5, localDate: null, destinationSlug: "busan", type: "full", activeMinutesBudget: 540 },
    { dayIndex: 6, localDate: null, destinationSlug: "busan", type: "departure", activeMinutesBudget: 240 },
  ],
  hardViolations: [],
};

const names = { seoul: "Seoul", busan: "Busan" };

describe("corridor-prompt helpers", () => {
  it("derives legs with day indexes from the plan", () => {
    const legs = corridorLegsFromPlan(plan, names);
    expect(legs).toEqual([
      { slug: "seoul", cityName: "Seoul", nights: 3, dayIndexes: [1, 2, 3] },
      { slug: "busan", cityName: "Busan", nights: 2, dayIndexes: [4, 5, 6] },
    ]);
    expect(corridorRouteLabel(legs)).toBe("Seoul → Busan");
  });

  it("finds transfer days", () => {
    expect(transferDayIndexes(plan)).toEqual([4]);
  });

  it("builds deterministic transfer insights", () => {
    const insights = corridorTransferInsights(plan, names);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ label: "Seoul → Busan", kind: "transport" });
    expect(insights[0].text).toContain("train");
    expect(insights[0].text).toContain("2.5 hours");
  });

  it("assigns every day to a city in the user prompt and marks travel days", () => {
    const prompt = buildCorridorUserPrompt({
      plan,
      legs: corridorLegsFromPlan(plan, names),
      totalDays: 6,
      interests: ["Food & Dining"],
      budget: "moderate",
      localnessLevel: 3,
      pace: "moderate",
      groupType: "couple",
      spotContextByLeg: [
        { slug: "seoul", cityName: "Seoul", context: "SEOUL_SPOTS" },
        { slug: "busan", cityName: "Busan", context: "BUSAN_SPOTS" },
      ],
    });
    expect(prompt).toContain("Seoul → Busan");
    expect(prompt).toContain("Day 4: TRAVEL DAY — Seoul → Busan");
    expect(prompt).toContain("Day 2: Seoul");
    expect(prompt).toContain("Day 5: Busan");
    expect(prompt).toContain('"city" field to EVERY day');
    expect(prompt).toContain("SEOUL_SPOTS");
    expect(prompt).toContain("BUSAN_SPOTS");
  });

  it("splits generated plans into contiguous legs for per-city geocoding", () => {
    const dailyPlans = [
      { day: 1, theme: "a" },
      { day: 2, theme: "b" },
      { day: 3, theme: "c" },
      { day: 4, theme: "d" },
      { day: 5, theme: "e" },
      { day: 6, theme: "f" },
    ];
    const chunks = splitDailyPlansByLeg(dailyPlans, corridorLegsFromPlan(plan, names));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].leg.slug).toBe("seoul");
    expect(chunks[0].plans.map((item) => item.day)).toEqual([1, 2, 3]);
    expect(chunks[1].leg.slug).toBe("busan");
    expect(chunks[1].plans.map((item) => item.day)).toEqual([4, 5, 6]);
  });

  it("drops days that belong to no leg instead of misassigning them", () => {
    const dailyPlans = [{ day: 1, theme: "a" }, { day: 99, theme: "rogue" }];
    const chunks = splitDailyPlansByLeg(dailyPlans, corridorLegsFromPlan(plan, names));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].plans).toHaveLength(1);
  });
});
