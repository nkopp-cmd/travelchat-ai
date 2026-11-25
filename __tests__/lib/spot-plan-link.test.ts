import { describe, expect, it } from "vitest";
import { NEAR_PLANNER_CITY_KM, nearestPlannerCity, spotPlanLink } from "@/lib/spots/plan-link";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";

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

  it("never opens the planner for a city the planner does not offer (Push DD2)", () => {
    const offered = new Set(["Seoul", "Osaka", "Kyoto", "Tokyo"]);
    // Nara spot: its own city is too small, the closest offered city within 150 km gets the plan.
    const nara = spotPlanLink({ id: "n1", name: "Todai-ji", plannerCity: "Nara", lat: 34.689, lng: 135.8398 }, offered);
    expect(nara.href).not.toContain("Nara");
    expect(nara.href).not.toContain("spot=");
    expect(["Osaka", "Kyoto"]).toContain(new URLSearchParams(nara.href.split("?")[1]).get("city"));
    expect(nearestPlannerCity(34.689, 135.8398)).toBe("Nara");
    expect(nearestPlannerCity(34.689, 135.8398, offered)).not.toBe("Nara");
    // Jeju spot: no offered city within 150 km -> the plain planner.
    expect(spotPlanLink({ id: "j1", name: "Seongsan", plannerCity: "Jeju", lat: 33.458, lng: 126.9425 }, offered).href).toBe("/itineraries/new");
    // An offered city keeps the pinned spot; an unknown list (null) keeps the old behaviour.
    expect(spotPlanLink({ id: "s1", name: "G", plannerCity: "Seoul", lat: 37.57, lng: 127 }, offered).href).toBe("/itineraries/new?spot=s1&city=Seoul");
    expect(spotPlanLink({ id: "n1", name: "T", plannerCity: "Nara", lat: 34.689, lng: 135.8398 }, null).href).toBe("/itineraries/new?spot=n1&city=Nara");
  });

  it("keeps the static planner links (blog posts, mobile dashboard grid) on the core cities (Push DD2)", () => {
    // These lists have no live spot count; each name must be one of the eight core cities (239+ spots on 2026-11-25).
    const core = new Set(["Seoul", "Tokyo", "Bangkok", "Singapore", "Osaka", "Kyoto", "Taipei", "Hong Kong"]);
    const mobileGrid = SUPPORTED_CITIES.slice(0, 8).map((city) => city.name);
    expect(mobileGrid.filter((name) => !core.has(name))).toEqual([]);
    const blogCities = BLOG_POSTS.flatMap((post) => [...post.body.matchAll(/\(\/itineraries\/new\?city=([^)&]+)/g)].map((m) => decodeURIComponent(m[1])));
    expect(blogCities.length).toBeGreaterThan(0);
    expect(blogCities.filter((name) => !core.has(name))).toEqual([]);
  });
});
