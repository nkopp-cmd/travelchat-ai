import type { createSupabaseAdmin } from "@/lib/supabase";
import { applyPublicSpotVisibilityFilters } from "@/lib/spots/public-quality";

/** Rows sent to rankItineraryGroundingSpots per city. */
export const ITINERARY_SPOT_POOL_LIMIT = 80;

type SpotPoolRow = { localley_score?: number | null; local_percentage?: number | null };

/** Score DESC, then local_percentage DESC (NULLs last), as the old single query ordered. */
function byPoolOrder(a: SpotPoolRow, b: SpotPoolRow): number {
  return (b.localley_score ?? -Infinity) - (a.localley_score ?? -Infinity)
    || (b.local_percentage ?? -Infinity) - (a.local_percentage ?? -Infinity);
}

/**
 * Candidate spots for a grounded itinerary. Ranking accepts verified spots only, so the verified filter must run in
 * the query BEFORE the limit: filtered after it, the top 80 Seoul rows held 7 verified spots (of 25), every
 * "Generate trip" with 3 days failed coverage (422) or grounding after the paid model call (500).
 *
 * City match = the /spots list rule (lib/spots/d1-queries.ts, lib/city-spot-counts.ts spotMatchesCity):
 * `city = name OR (city IS NULL AND address->>en ILIKE '%name%')`. The facade has no or(), so two queries, each
 * limited, merged and cut to the limit. Address-only found 3 Hanoi/HCMC spots while /spots listed 50+.
 */
export async function itinerarySpotPoolQuery(supabase: ReturnType<typeof createSupabaseAdmin>, cityName: string) {
  const base = () => supabase.from("spots").select("*");
  const ranked = <Q extends ReturnType<typeof base>>(query: Q) =>
    applyPublicSpotVisibilityFilters(query.gte("localley_score", 3).eq("verified", true))
      .order("localley_score", { ascending: false })
      .order("local_percentage", { ascending: false })
      .limit(ITINERARY_SPOT_POOL_LIMIT);

  const [byColumn, byAddress] = await Promise.all([
    ranked(base().eq("city", cityName)),
    ranked(base().is("city", null).ilike("address->>en", `%${cityName}%`)),
  ]);
  const error = byColumn.error ?? byAddress.error;
  if (error) return { data: null, error };
  // Rows keep the query's own row type (select("*")); only the sort reads the two score fields.
  const rows = [...(byColumn.data ?? []), ...(byAddress.data ?? [])];
  return { data: rows.sort(byPoolOrder).slice(0, ITINERARY_SPOT_POOL_LIMIT), error: null };
}
