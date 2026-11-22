import type { createSupabaseAdmin } from "@/lib/supabase";
import { applyPublicSpotVisibilityFilters } from "@/lib/spots/public-quality";

/** Rows sent to rankItineraryGroundingSpots per city. */
export const ITINERARY_SPOT_POOL_LIMIT = 80;

type SpotPoolRow = {
  id?: string | null;
  verified?: boolean | number | null;
  localley_score?: number | null;
  local_percentage?: number | null;
};

/** Verified first, then score DESC, then local_percentage DESC (NULLs last): the order of each query. */
function byPoolOrder(a: SpotPoolRow, b: SpotPoolRow): number {
  return Number(Boolean(b.verified)) - Number(Boolean(a.verified))
    || (b.localley_score ?? -Infinity) - (a.localley_score ?? -Infinity)
    || (b.local_percentage ?? -Infinity) - (a.local_percentage ?? -Infinity);
}

/**
 * Candidate spots for a grounded itinerary: every PUBLIC spot of the city (photo, visible, score >= 3). `verified` is
 * only a seed flag (12 of 15 cities had too few verified spots and every default plan there returned 422), so it is a
 * sort key, not a filter: verified spots come first BEFORE the limit (an old filter-after-limit bug kept 7 of 25
 * verified Seoul spots), unverified public spots fill the rest. Ranking still drops rows without a 60-char
 * description, a real photo or coordinates.
 *
 * City match = the /spots list rule (lib/spots/d1-queries.ts, lib/city-spot-counts.ts spotMatchesCity):
 * `city = name OR (city IS NULL AND address->>en ILIKE '%name%')`. The facade has no or(), so two queries, each
 * limited, merged and cut to the limit. Address-only found 3 Hanoi/HCMC spots while /spots listed 50+.
 *
 * `spotId` (the "Plan a trip" button on a spot page) is loaded by id with the same public filters and joins the pool
 * even outside the top rows, so pinSelectedSpot can find it. A spot of another city is not added.
 */
export async function itinerarySpotPoolQuery(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  cityName: string,
  spotId?: string,
) {
  const base = () => supabase.from("spots").select("*");
  const ranked = <Q extends ReturnType<typeof base>>(query: Q) =>
    applyPublicSpotVisibilityFilters(query.gte("localley_score", 3))
      .order("verified", { ascending: false, nullsFirst: false })
      .order("localley_score", { ascending: false })
      .order("local_percentage", { ascending: false })
      .limit(ITINERARY_SPOT_POOL_LIMIT);

  const [byColumn, byAddress, byId] = await Promise.all([
    ranked(base().eq("city", cityName)),
    ranked(base().is("city", null).ilike("address->>en", `%${cityName}%`)),
    spotId
      ? applyPublicSpotVisibilityFilters(base().eq("id", spotId).gte("localley_score", 3)).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = byColumn.error ?? byAddress.error;
  if (error) return { data: null, error };
  // Rows keep the query's own row type (select("*")); only the sort reads the score fields.
  const rows = [...(byColumn.data ?? []), ...(byAddress.data ?? [])].sort(byPoolOrder).slice(0, ITINERARY_SPOT_POOL_LIMIT);
  // A failed pin lookup only loses the pin, never the plan.
  const pinned = (byId.error ? [] : byId.data ?? []).find((spot) => pinnedSpotInCity(spot, cityName));
  if (pinned && !rows.some((spot) => (spot as SpotPoolRow).id === (pinned as SpotPoolRow).id)) rows.push(pinned);
  return { data: rows, error: null };
}

type CityRow = { city?: string | null; address?: unknown };

function pinnedSpotInCity(spot: unknown, cityName: string): boolean {
  const { city, address } = spot as CityRow;
  if (city) return city === cityName;
  const en = typeof address === "object" && address ? (address as { en?: unknown }).en : address;
  return typeof en === "string" && en.toLowerCase().includes(cityName.toLowerCase());
}
