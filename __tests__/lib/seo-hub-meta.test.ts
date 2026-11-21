import { describe, expect, it } from "vitest";
import { ALL_CITIES } from "@/lib/cities";
import { cityAzDescription, cityHubDescription, HUB_META_TAIL, SPOTS_INDEX_DESCRIPTION } from "@/lib/seo/hub-meta";

describe("hub and A-Z meta descriptions (Push CD2)", () => {
  it("name the city and end with the free planner, without the internal score", () => {
    const hub = cityHubDescription("Seoul", "South Korea");
    const az = cityAzDescription("Tokyo", "Japan");
    expect(hub).toContain("Seoul, South Korea");
    expect(az).toContain("Tokyo, Japan");
    for (const text of [hub, az, SPOTS_INDEX_DESCRIPTION]) {
      expect(text.endsWith(HUB_META_TAIL)).toBe(true);
      expect(text).not.toMatch(/Localley Score/);
    }
  });

  it("fit in 160 chars for every city", () => {
    expect(SPOTS_INDEX_DESCRIPTION.length).toBeLessThanOrEqual(160);
    for (const city of ALL_CITIES) {
      expect(cityHubDescription(city.name, city.country).length, city.name).toBeLessThanOrEqual(160);
      expect(cityAzDescription(city.name, city.country).length, city.name).toBeLessThanOrEqual(160);
    }
  });
});
