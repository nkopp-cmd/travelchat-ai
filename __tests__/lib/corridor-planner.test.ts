import { describe, expect, it } from "vitest";
import { corridorGoldenTrips } from "@/__tests__/fixtures/corridor-golden-trips";
import { PlannerValidationError, planCorridorTrip } from "@/lib/trips/corridor-planner";

describe("deterministic corridor planner", () => {
  it.each(corridorGoldenTrips)("passes golden trip: $name", ({ request }) => {
    const plan = planCorridorTrip(request);
    expect(plan.hardViolations).toEqual([]);
    expect(plan.days).toHaveLength(request.totalDays);
    expect(plan.stops.reduce((sum, stop) => sum + stop.nights, 0)).toBe(request.totalDays - 1);
    expect(plan.transfers).toHaveLength(request.destinations.length - 1);
    expect(plan.transfers.every((transfer) => transfer.confidence >= 0.8)).toBe(true);
    expect(plan.days.every((day) => day.activeMinutesBudget >= 0 && day.activeMinutesBudget <= 640)).toBe(true);
  });

  it("is byte-for-byte deterministic for the same request", () => {
    const request = corridorGoldenTrips[10].request;
    expect(planCorridorTrip(request)).toEqual(planCorridorTrip(request));
  });

  it("honors locked nights and allocates every remaining night", () => {
    const plan = planCorridorTrip({
      ...corridorGoldenTrips[10].request,
      destinations: [
        { destinationSlug: "tokyo", nights: 4, locked: true },
        { destinationSlug: "kyoto" },
        { destinationSlug: "osaka" },
      ],
      totalDays: 10,
    });
    expect(plan.stops.find((stop) => stop.destinationSlug === "tokyo")?.nights).toBe(4);
    expect(plan.stops.reduce((sum, stop) => sum + stop.nights, 0)).toBe(9);
  });

  it("rejects an unsupported direct route instead of inventing transport", () => {
    expect(() => planCorridorTrip({
      ...corridorGoldenTrips[0].request,
      destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "nara" }],
    })).toThrowError(PlannerValidationError);
  });

  it("rejects too many stops for the available trip duration", () => {
    expect(() => planCorridorTrip({
      ...corridorGoldenTrips[10].request,
      destinations: [
        { destinationSlug: "tokyo" },
        { destinationSlug: "kyoto" },
        { destinationSlug: "osaka" },
      ],
      totalDays: 6,
    })).toThrow(/supports at most 2 overnight stops/);
  });

  it("turns international flight days into conservative light days", () => {
    const plan = planCorridorTrip(corridorGoldenTrips[15].request);
    const transferDay = plan.days.find((day) => day.type === "transfer");
    expect(transferDay?.activeMinutesBudget).toBeLessThanOrEqual(230);
  });
});
