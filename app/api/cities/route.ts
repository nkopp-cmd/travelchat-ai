import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase";
import { ENABLED_CITIES, CityConfig } from "@/lib/cities";

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
  const supabase = createSupabaseAdmin();

  const cityPromises = ENABLED_CITIES.map(async (city) => {
    const { count } = await supabase
      .from("spots")
      .select("*", { count: "exact", head: true })
      .ilike("address->>en", `%${city.name}%`);

    const spotCount = count || 0;
    const status: CityStatus = spotCount >= THRESHOLDS.recommended ? "recommended"
                 : spotCount >= THRESHOLDS.available ? "available"
                 : spotCount >= THRESHOLDS.beta ? "beta"
                 : "hidden";

    return { ...city, spotCount, status };
  });

  return Promise.all(cityPromises);
}

const getCachedCities = unstable_cache(
  fetchCitiesWithCounts,
  ["cities-with-counts"],
  { revalidate: 600, tags: ["spots", "cities"] }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minSpots = parseInt(searchParams.get("minSpots") || "0");
    const includeHidden = searchParams.get("includeHidden") === "true";

    const cities = await getCachedCities();

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
      { success: false, error: "Failed to fetch cities" },
      { status: 500 }
    );
  }
}
