// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rows: [] as unknown[] }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/geography/city-shadow", () => ({ runCityGeographyShadowComparison: async () => {} }));
vi.mock("@/lib/supabase", () => ({ createSupabaseClient: () => ({ from: mocks.from }) }));
// The quality rules have their own tests; here a spot named "Hidden ..." stands for any rejected spot.
vi.mock("@/lib/spots/public-quality", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spots/public-quality")>()),
  shouldShowPublicSpot: (spot: { name: { en: string } }) => !spot.name.en.startsWith("Hidden"),
}));
import fc from "fast-check";
import { ENABLED_CITIES } from "@/lib/cities";
import { fetchCitiesWithCounts } from "@/lib/cities-catalog";
import { countSpotsByCity, spotMatchesCity } from "@/lib/city-spot-counts";

const spot = (name: string, address: unknown, city?: string | null) => ({
  name: { en: name }, address, city, photos: ["https://example.com/p.jpg"], location: [127, 37.5], google_place_id: "g1",
});

describe("city spot counts", () => {
  it("matches address->>en ILIKE '%city%': case-insensitive, object en only, hidden spots excluded", () => {
    const counts = countSpotsByCity([
      spot("Gwangjang Market", { en: "88 Changgyeonggung-ro, Jongno-gu, Seoul" }),
      spot("Mangwon Market", { en: "MAPO-GU, SEOUL" }),
      spot("Plain string address", "Seoul"),
      spot("No English", { ko: "서울" }),
      spot("Hidden Seongsu", { en: "Seongdong-gu, Seoul" }), // rejected by shouldShowPublicSpot
      spot("Haeundae Beach", { en: "Haeundae-gu, Busan" }),
    ]);
    expect(counts.get("seoul")).toBe(2);
    expect(counts.get("busan")).toBe(1);
    expect(counts.get("tokyo")).toBe(0);
  });

  it("the city column wins over the address (the /spots list rule): district-only HCMC rows count", () => {
    const counts = countSpotsByCity([
      spot("Ben Thanh Market", { en: "Le Loi, District 1" }, "Ho Chi Minh City"),
      spot("Bui Vien", { en: "Pham Ngu Lao, Quan 1" }, "Ho Chi Minh City"),
      spot("Hoan Kiem Lake", { en: "Hoan Kiem District" }, "Hanoi"),
      spot("Seoul Restaurant in Hanoi", { en: "Seoul Restaurant, Ba Dinh" }, "Hanoi"), // address names Seoul
      spot("Old row", { en: "Jongno-gu, Seoul" }, null), // no city column -> address match
    ]);
    expect(counts.get("ho-chi-minh")).toBe(2);
    expect(counts.get("hanoi")).toBe(2);
    expect(counts.get("seoul")).toBe(1);
  });

  it("property: a row with a city counts for exactly that city; a row without one counts by its address", () => {
    const names = ENABLED_CITIES.map((city) => city.name);
    fc.assert(fc.property(
      fc.option(fc.constantFrom(...names), { nil: null }),
      fc.constantFrom(...names),
      fc.string({ maxLength: 12 }),
      (column, inAddress, noise) => {
        const row = spot("Some place", { en: `${noise}, ${inAddress}` }, column);
        const counts = countSpotsByCity([row]);
        for (const city of ENABLED_CITIES) {
          const expected = column ? column === city.name : `${noise}, ${inAddress}`.toLowerCase().includes(city.name.toLowerCase());
          expect(counts.get(city.slug)).toBe(expected ? 1 : 0);
          expect(spotMatchesCity(row, city.name)).toBe(expected);
        }
      },
    ));
  });

  it("fetchCitiesWithCounts reads spots ONCE for all cities (was one full scan per city)", async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "not", "neq", "is", "ilike", "or", "filter"]) chain[method] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [spot("Gwangjang Market", { en: "Jongno-gu, Seoul" })], error: null });
    mocks.from.mockReturnValue(chain);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cities = await fetchCitiesWithCounts();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(chain.ilike).not.toHaveBeenCalled();
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining("city"));
    expect(cities.find((city) => city.slug === "seoul")).toMatchObject({ spotCount: 1, status: "beta" });
    expect(cities.find((city) => city.slug === "tokyo")).toMatchObject({ spotCount: 0, status: "hidden" });
  });
});
