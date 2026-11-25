import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ALL_CITIES } from "@/lib/cities";
import centersJson from "@/lib/trips/city-centers.json";
import { NEARBY_MAX_KM, nearestPlannerCity, type CityCenters } from "@/lib/trips/nearest-planner-city";

const centers = centersJson as unknown as CityCenters;
const planner = [
  { slug: "osaka", name: "Osaka" }, { slug: "kyoto", name: "Kyoto" }, { slug: "tokyo", name: "Tokyo" },
  { slug: "seoul", name: "Seoul" }, { slug: "busan", name: "Busan" }, { slug: "bangkok", name: "Bangkok" },
].filter((city) => centers[city.slug]);

describe("nearestPlannerCity (Push DD3)", () => {
  it("city-centers.json matches every city in lib/cities.ts (regenerate it when a city is added)", () => {
    expect(Object.keys(centers).sort()).toEqual(ALL_CITIES.map((c) => c.slug).sort());
    for (const city of ALL_CITIES) {
      expect(centers[city.slug].name).toBe(city.name);
      expect(centers[city.slug].at[0]).toBeCloseTo(city.center.lat, 2);
      expect(centers[city.slug].at[1]).toBeCloseTo(city.center.lng, 2);
    }
  });

  it("swaps Nara for a Kansai city, by name or slug, case-insensitive", () => {
    const near = nearestPlannerCity(centers, "Nara", planner);
    expect(["Kyoto", "Osaka"]).toContain(near?.name);
    expect(near!.km).toBeLessThan(60);
    expect(nearestPlannerCity(centers, "  nara ", planner)?.slug).toBe(near?.slug);
  });

  it("returns null for an unknown city, an empty list, or a city with nothing near", () => {
    expect(nearestPlannerCity(centers, "Atlantis", planner)).toBeNull();
    expect(nearestPlannerCity(centers, "Nara", [])).toBeNull();
    expect(nearestPlannerCity(centers, "Nara", [{ slug: "bangkok", name: "Bangkok" }])).toBeNull();
  });

  it("property: the answer is never the asked city, is a listed city, and is within the nearby limit", () => {
    const slugs = Object.keys(centers);
    fc.assert(fc.property(fc.constantFrom(...slugs), fc.subarray(slugs), (wanted, list) => {
      const near = nearestPlannerCity(centers, wanted, list.map((slug) => ({ slug, name: centers[slug].name })));
      if (!near) return true;
      return near.slug !== wanted && list.includes(near.slug) && near.km <= NEARBY_MAX_KM;
    }));
  });
});
