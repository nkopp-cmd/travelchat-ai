import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase";
import { ENABLED_CITIES, CityConfig } from "@/lib/cities";
import {
  applyPublicSpotVisibilityFilters,
  PUBLIC_SPOT_VISIBILITY_CACHE_VERSION,
  shouldShowPublicSpot,
} from "@/lib/spots/public-quality";
import { runCityGeographyShadowComparison } from "@/lib/geography/city-shadow";

// Public city catalog with live spot counts: GET /api/cities and the planner's server render
// (app/itineraries/new) read the same cached result.

// Thresholds for city status
export const THRESHOLDS = {
  recommended: 150,  // Full experience
  available: 60,     // Good coverage
  beta: 1,           // Limited but available
};

export type CityStatus = "recommended" | "available" | "beta" | "hidden";

export interface CityWithCount extends CityConfig {
  spotCount: number;
  status: CityStatus;
}

export async function fetchCitiesWithCounts(): Promise<CityWithCount[]> {
  const supabase = createSupabaseClient();

  const cityPromises = ENABLED_CITIES.map(async (city) => {
    try {
      let cityQuery = supabase
        .from("spots")
        .select("name, address, location, photos, google_place_id");

      cityQuery = applyPublicSpotVisibilityFilters(cityQuery);

      const { data, error } = await cityQuery.ilike("address->>en", `%${city.name}%`);

      if (error) {
        console.error(`[api/cities] Supabase error for ${city.name}:`, error.message);
      }

      const spotCount = (data || []).filter((spot) => shouldShowPublicSpot(spot)).length;
      const status: CityStatus = spotCount >= THRESHOLDS.recommended ? "recommended"
                   : spotCount >= THRESHOLDS.available ? "available"
                   : spotCount >= THRESHOLDS.beta ? "beta"
                   : "hidden";

      return { ...city, spotCount, status };
    } catch (err) {
      console.error(`[api/cities] Failed to fetch count for ${city.name}:`, err);
      return { ...city, spotCount: 0, status: "hidden" as CityStatus };
    }
  });

  const results = await Promise.all(cityPromises);

  // Log summary for debugging
  const visibleCount = results.filter(c => c.status !== "hidden").length;
  const totalSpots = results.reduce((sum, c) => sum + c.spotCount, 0);
  console.log(`[api/cities] Fetched ${results.length} cities: ${visibleCount} visible, ${totalSpots} total spots`);

  if (visibleCount === 0 && ENABLED_CITIES.length > 0) {
    console.warn("[api/cities] WARNING: 0 visible cities! Possible Supabase connection issue or empty spots table.");
  }

  await runCityGeographyShadowComparison(
    results.map((city) => ({ slug: city.slug, spotCount: city.spotCount })),
  );

  return results;
}

export const getCachedCities = unstable_cache(
  fetchCitiesWithCounts,
  ["cities-with-counts", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION],
  { revalidate: 300, tags: ["spots", "cities"] }
);


/** Planner destination list: the same rows and order as GET /api/cities?minSpots=1. */
export interface PlannerCity {
  slug: string;
  name: string;
  emoji: string;
  vibe?: string;
  heroImage?: string;
  spotCount: number;
  status: "recommended" | "available" | "beta";
}

export function toPlannerCities(cities: CityWithCount[]): PlannerCity[] {
  return cities
    .filter((city) => city.spotCount >= 1 && city.status !== "hidden")
    .sort((a, b) => b.spotCount - a.spotCount)
    .map(({ slug, name, emoji, vibe, heroImage, spotCount, status }) => ({
      slug, name, emoji, ...(vibe ? { vibe } : {}), ...(heroImage ? { heroImage } : {}), spotCount,
      status: status as PlannerCity["status"],
    }));
}

export async function plannerCities(): Promise<PlannerCity[]> {
  return toPlannerCities(await getCachedCities());
}
