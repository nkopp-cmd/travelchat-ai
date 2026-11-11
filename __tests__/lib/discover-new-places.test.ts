import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: vi.fn() }));

import { normalizeApifySpotCandidate } from "@/lib/apify-spot-discovery";
// @ts-expect-error plain ESM script without types
import { actorInput, freshPlaces, MAX_CHARGE_USD, MAX_PLACES, normalizePlace, parseCityList, pickCity, spendLine } from "../../scripts/discover-new-places.mjs";

const cities = parseCityList(readFileSync("lib/cities.ts", "utf8"));
const base = {
  placeId: "ChIJ-local", title: "Tiny Noodle House", address: "12 Itaewon-ro, Yongsan-gu, Seoul, South Korea",
  location: { lat: 37.5345, lng: 126.9946 }, url: "https://www.google.com/maps/place/?q=place_id:ChIJ-local",
  imageUrl: "https://lh5.googleusercontent.com/p/abc", categoryName: "Noodle restaurant", categories: ["Restaurant"],
  totalScore: 4.7, reviewsCount: 120, countryCode: "KR", searchString: "hidden gem restaurant",
};

describe("discover-new-places", () => {
  it("parses country codes for the ten watch cities", () => {
    expect(cities.seoul).toMatchObject({ name: "Seoul", countryCode: "KR" });
    expect(cities["kuala-lumpur"]).toMatchObject({ countryCode: "MY" });
  });

  it("filters exactly like the app normalizer (parity)", () => {
    const variants: Record<string, unknown>[] = [
      base,
      { ...base, permanentlyClosed: true },
      { ...base, isAdvertisement: true },
      { ...base, imageUrl: "https://example.com/a.jpg" },
      { ...base, url: "https://maps.example.com/x" },
      { ...base, countryCode: "JP" },
      { ...base, location: { lat: 35.18, lng: 129.07 } }, // Busan, > 120 km from Seoul
      { ...base, totalScore: 3.9 },
      { ...base, reviewsCount: 4 },
      { ...base, categoryName: "Equipment supplier", categories: [] },
      { ...base, categoryName: "Hotel", categories: ["Hotel"] },
      { ...base, totalScore: null, reviewsCount: null, countryCode: undefined },
      { ...base, categoryName: "Coffee shop", totalScore: 4.4, reviewsCount: 3000 },
    ];
    for (const item of variants) {
      const app = normalizeApifySpotCandidate({ item, citySlug: "seoul", runId: "r1" });
      const ours = normalizePlace(item, cities.seoul, "r1");
      expect(ours).toEqual(app);
    }
  });

  it("picks the watch city with the oldest run, cities without a run first", () => {
    expect(pickCity(cities, {}).slug).toBe("seoul");
    const all = Object.fromEntries(Object.values(cities).map((c: { slug: string }) => [c.slug, "2026-11-01"]));
    expect(pickCity(cities, { ...all, osaka: "2026-10-01" }).slug).toBe("osaka");
    expect(pickCity(cities, { ...all, "chiang-mai": "2026-01-01" }).slug).toBe("seoul"); // not a watch city
  });

  it("keeps the crawl inside the charge and place caps", () => {
    const input = actorInput(cities.tokyo);
    expect(input.locationQuery).toBe("Tokyo, Japan");
    expect(input.maxCrawledPlacesPerSearch * input.searchStringsArray.length).toBeLessThanOrEqual(MAX_PLACES);
    expect(MAX_PLACES).toBeLessThanOrEqual(100); // D1 check on apify_spot_discovery_runs.max_places
    expect(MAX_CHARGE_USD).toBeLessThanOrEqual(0.5);
    expect(input.maxImages).toBe(0);
  });

  it("drops known and repeated place IDs", () => {
    const p = (placeId: string) => ({ placeId });
    expect(freshPlaces([p("a"), p("b"), p("a"), p("c")], ["b"]).map((x: { placeId: string }) => x.placeId)).toEqual(["a", "c"]);
  });

  it("writes a ledger line spend-guard can parse, rounded up", () => {
    const line = spendLine("2026-11-12", cities.tokyo, 7, "RUN1", 0.3712);
    expect(line).toMatch(/^2026-11-12 \| Apify \(Localley\) \| .*Tokyo.* \| \$0\.38$/);
  });
});
