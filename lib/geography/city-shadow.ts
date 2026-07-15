import "server-only";
import { createSupabaseClient } from "../supabase";
import {
  applyPublicSpotVisibilityFilters,
  shouldShowPublicSpot,
} from "../spots/public-quality";

export type CityCountSnapshot = { slug: string; spotCount: number };

export type CityShadowComparison = {
  equivalent: boolean;
  legacyTotal: number;
  databaseTotal: number;
  missingInDatabase: string[];
  unexpectedInDatabase: string[];
  countMismatches: Array<{ slug: string; legacy: number; database: number }>;
};

export function compareCityCountSnapshots(
  legacy: CityCountSnapshot[],
  database: CityCountSnapshot[],
): CityShadowComparison {
  const legacyBySlug = new Map(legacy.map((city) => [city.slug, city.spotCount]));
  const databaseBySlug = new Map(database.map((city) => [city.slug, city.spotCount]));
  const missingInDatabase = [...legacyBySlug.keys()]
    .filter((slug) => !databaseBySlug.has(slug))
    .sort();
  const unexpectedInDatabase = [...databaseBySlug.keys()]
    .filter((slug) => !legacyBySlug.has(slug))
    .sort();
  const countMismatches = [...legacyBySlug]
    .flatMap(([slug, legacyCount]) => {
      const databaseCount = databaseBySlug.get(slug);
      return databaseCount !== undefined && databaseCount !== legacyCount
        ? [{ slug, legacy: legacyCount, database: databaseCount }]
        : [];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
  return {
    equivalent: missingInDatabase.length === 0 &&
      unexpectedInDatabase.length === 0 && countMismatches.length === 0,
    legacyTotal: legacy.reduce((total, city) => total + city.spotCount, 0),
    databaseTotal: database.reduce((total, city) => total + city.spotCount, 0),
    missingInDatabase,
    unexpectedInDatabase,
    countMismatches,
  };
}

function joinedDestinationSlug(value: unknown): string | null {
  const destination = Array.isArray(value) ? value[0] : value;
  if (!destination || typeof destination !== "object") return null;
  const slug = (destination as Record<string, unknown>).slug;
  return typeof slug === "string" ? slug : null;
}

export async function fetchDatabaseCityCountSnapshot(): Promise<CityCountSnapshot[]> {
  const supabase = createSupabaseClient();
  const { data: destinations, error: destinationError } = await supabase
    .from("geo_destinations")
    .select("slug")
    .eq("is_enabled", true);
  if (destinationError) throw new Error(`Geography destinations unavailable: ${destinationError.message}`);
  const counts = new Map((destinations || []).map((row) => [row.slug as string, 0]));

  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("spots")
      .select("name,address,location,photos,google_place_id,destination:geo_destinations!spots_destination_id_fk(slug)")
      .not("destination_id", "is", null)
      .range(from, from + pageSize - 1);
    query = applyPublicSpotVisibilityFilters(query);
    const { data, error } = await query;
    if (error) throw new Error(`FK-backed city counts unavailable: ${error.message}`);
    for (const spot of data || []) {
      if (!shouldShowPublicSpot(spot)) continue;
      const slug = joinedDestinationSlug(spot.destination);
      if (slug) counts.set(slug, (counts.get(slug) || 0) + 1);
    }
    if ((data || []).length < pageSize) break;
  }
  return [...counts].map(([slug, spotCount]) => ({ slug, spotCount }));
}

export async function runCityGeographyShadowComparison(
  legacy: CityCountSnapshot[],
): Promise<CityShadowComparison | null> {
  if (process.env.MULTI_CITY_GEO_DB !== "shadow") return null;
  try {
    const comparison = compareCityCountSnapshots(
      legacy,
      await fetchDatabaseCityCountSnapshot(),
    );
    if (comparison.equivalent) {
      console.info("[api/cities][geo-shadow] FK-backed counts match legacy counts.");
    } else {
      console.warn("[api/cities][geo-shadow] Count differences detected:", comparison);
    }
    return comparison;
  } catch (error) {
    console.error(
      "[api/cities][geo-shadow] Comparison unavailable; legacy response retained:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}
