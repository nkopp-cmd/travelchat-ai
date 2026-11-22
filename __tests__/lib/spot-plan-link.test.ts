import { describe, expect, it } from "vitest";
import { NEAR_PLANNER_CITY_KM, nearestPlannerCity, spotPlanLink } from "@/lib/spots/plan-link";

describe("spotPlanLink (Push CK1)", () => {
  it("pins the spot and promises a day around it when the spot has a planner city", () => {
    const link = spotPlanLink({ id: "s1", name: "Gwangjang Market", plannerCity: "Seoul", lat: 37.57, lng: 127.0 });
    expect(link.href).toBe("/itineraries/new?spot=s1&city=Seoul");
    expect(link.label).toBe("Plan a free day around Gwangjang Market");
  });

  it.each([
    ["Amphawa Floating Market", 13.4250675, 99.9549371, "Bangkok"],
    ["Vinyl Cafe at Suwon Starfield Library", 37.2875533, 126.9913337, "Seoul"],
    ["Basegate Yokohama Kannai", 35.4436262, 139.6383549, "Tokyo"],
  ])("sends day-trip spot %s to the nearest planner city without a dropped pin", (name, lat, lng, city) => {
    const link = spotPlanLink({ id: "x", name, plannerCity: null, lat, lng });
    expect(link.href).toBe(`/itineraries/new?city=${encodeURIComponent(city)}`);
    expect(link.href).not.toContain("spot=");
    expect(link.label).toBe(`Plan a free ${city} trip`);
    expect(link.label).not.toContain(name);
    expect(link.shortLabel).toBe(link.label);
  });

  it("never links ?spot= without a city", () => {
    for (const [lat, lng] of [[48.85, 2.35], [Number.NaN, 0], [null, null]] as const) {
      const link = spotPlanLink({ id: "far", name: "Far Place", plannerCity: null, lat, lng });
      expect(link).toEqual({ href: "/itineraries/new", label: "Plan a free trip", shortLabel: "Plan a free trip" });
    }
  });

  it("keeps the radius bound: no city beyond the limit", () => {
    expect(NEAR_PLANNER_CITY_KM).toBe(150);
    expect(nearestPlannerCity(37.5665, 126.978)).toBe("Seoul");
    expect(nearestPlannerCity(0, 0)).toBeNull();
  });
});
