import type { createSupabaseAdmin } from "@/lib/supabase";
import { applyPublicSpotVisibilityFilters } from "@/lib/spots/public-quality";

/** Rows sent to rankItineraryGroundingSpots per city. */
export const ITINERARY_SPOT_POOL_LIMIT = 80;

/**
 * Candidate spots for a grounded itinerary. Ranking accepts verified spots only, so the verified filter must run in
 * the query BEFORE the limit: filtered after it, the top 80 Seoul rows held 7 verified spots (of 25), every
 * "Generate trip" with 3 days failed coverage (422) or grounding after the paid model call (500).
 */
export function itinerarySpotPoolQuery(supabase: ReturnType<typeof createSupabaseAdmin>, cityName: string) {
  const filtered = supabase
    .from("spots")
    .select("*")
    .ilike("address->>en", `%${cityName}%`)
    .gte("localley_score", 3)
    .eq("verified", true);
  return applyPublicSpotVisibilityFilters(filtered)
    .order("localley_score", { ascending: false })
    .order("local_percentage", { ascending: false })
    .limit(ITINERARY_SPOT_POOL_LIMIT);
}
