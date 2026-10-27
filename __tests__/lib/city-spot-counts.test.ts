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
import { fetchCitiesWithCounts } from "@/lib/cities-catalog";
import { countSpotsByCity } from "@/lib/city-spot-counts";

const spot = (name: string, address: unknown) => ({
  name: { en: name }, address, photos: ["https://example.com/p.jpg"], location: [127, 37.5], google_place_id: "g1",
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

  it("fetchCitiesWithCounts reads spots ONCE for all cities (was one full scan per city)", async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "not", "neq", "is", "ilike", "or", "filter"]) chain[method] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [spot("Gwangjang Market", { en: "Jongno-gu, Seoul" })], error: null });
    mocks.from.mockReturnValue(chain);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const cities = await fetchCitiesWithCounts();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(chain.ilike).not.toHaveBeenCalled();
    expect(cities.find((city) => city.slug === "seoul")).toMatchObject({ spotCount: 1, status: "beta" });
    expect(cities.find((city) => city.slug === "tokyo")).toMatchObject({ spotCount: 0, status: "hidden" });
  });
});
