import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase";
import { ENABLED_CITIES, CityConfig } from "@/lib/cities";
import {
  applyPublicSpotVisibilityFilters,
  PUBLIC_SPOT_VISIBILITY_CACHE_VERSION,
  shouldShowPublicSpot,
} from "@/lib/spots/public-quality";

// Thresholds for city status
const THRESHOLDS = {
  recommended: 150,  // Full experience
  available: 60,     // Good coverage
  beta: 1,           // Limited but available
};

type CityStatus = "recommended" | "available" | "beta" | "hidden";

interface CityWithCount extends CityConfig {
  spotCount: number;
  status: CityStatus;
}

async function fetchCitiesWithCounts(): Promise<CityWithCount[]> {
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

  return results;
}

const getCachedCities = unstable_cache(
  fetchCitiesWithCounts,
  ["cities-with-counts", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION],
  { revalidate: 300, tags: ["spots", "cities"] }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minSpots = parseInt(searchParams.get("minSpots") || "0");
    const includeHidden = searchParams.get("includeHidden") === "true";
    const noCache = searchParams.get("noCache") === "true";

    // Allow bypassing cache for debugging
    const cities = noCache
      ? await fetchCitiesWithCounts()
      : await getCachedCities();

    const filtered = cities
      .filter(c => c.spotCount >= minSpots)
      .filter(c => includeHidden || c.status !== "hidden")
      .sort((a, b) => b.spotCount - a.spotCount);

    return NextResponse.json({
      success: true,
      cities: filtered,
      total: filtered.length,
      thresholds: THRESHOLDS,
    });
  } catch (error) {
    console.error("[api/cities] Error fetching cities:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch cities", cities: [], total: 0 },
      { status: 500 }
    );
  }
}
