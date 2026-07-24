import { describe, expect, it } from "vitest";
import {
  buildCorridorRequest,
  corridorSelectionError,
  mapWizardBudget,
  mapWizardGroup,
  mapWizardPace,
  maxStopsForDays,
} from "@/lib/trips/wizard-corridor";

describe("wizard-corridor mappers", () => {
  it("maps wizard budget tiers to planner tiers", () => {
    expect(mapWizardBudget("cheap")).toBe("budget");
    expect(mapWizardBudget("moderate")).toBe("moderate");
    expect(mapWizardBudget("splurge")).toBe("premium");
  });

  it("maps wizard pace to planner pace, collapsing packed to active", () => {
    expect(mapWizardPace("relaxed")).toBe("relaxed");
    expect(mapWizardPace("moderate")).toBe("moderate");
    expect(mapWizardPace("active")).toBe("active");
    expect(mapWizardPace("packed")).toBe("active");
  });

  it("maps group types with sensible party sizes", () => {
    expect(mapWizardGroup("solo")).toMatchObject({ type: "solo", adults: 1, children: [] });
    expect(mapWizardGroup("couple")).toMatchObject({ type: "couple", adults: 2, children: [] });
    expect(mapWizardGroup("family").children).toHaveLength(1);
    expect(mapWizardGroup("business")).toMatchObject({ type: "business", adults: 2 });
    expect(mapWizardGroup("unknown-value")).toMatchObject({ type: "solo", adults: 1 });
  });

  it("builds an optimize-mode planner request from wizard input", () => {
    const request = buildCorridorRequest({
      destinationSlugs: ["seoul", "busan"],
      totalDays: 6,
      budget: "cheap",
      pace: "packed",
      groupType: "couple",
      interests: ["Food & Dining"],
    });
    expect(request).toEqual({
      destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "busan" }],
      orderMode: "optimize",
      totalDays: 6,
      budget: "budget",
      pace: "active",
      group: { type: "couple", adults: 2, children: [], mobility: [] },
      interests: ["Food & Dining"],
    });
  });
});

describe("corridorSelectionError", () => {
  it("requires at least two cities", () => {
    expect(corridorSelectionError(0, 7)).toMatch(/at least 2 cities/);
    expect(corridorSelectionError(1, 7)).toMatch(/at least 2 cities/);
    expect(corridorSelectionError(2, 7)).toBeNull();
  });

  it("caps stops by total days at roughly 2.5 days per stop", () => {
    expect(maxStopsForDays(3)).toBe(1);
    expect(maxStopsForDays(5)).toBe(2);
    expect(maxStopsForDays(6)).toBe(2);
    expect(maxStopsForDays(7)).toBe(2);
    expect(maxStopsForDays(13)).toBe(5);
    expect(maxStopsForDays(21)).toBe(5);
    expect(corridorSelectionError(3, 6)).toMatch(/at most 2 overnight stops/);
    expect(corridorSelectionError(2, 6)).toBeNull();
  });
});
