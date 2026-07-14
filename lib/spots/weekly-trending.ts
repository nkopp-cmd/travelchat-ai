import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase";
import type { Spot } from "@/types";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { transformSpot, type RawSpot } from "@/lib/spots/transform";
import { getWeekStart } from "@/lib/weekly-social-trends";

export type WeeklyTrendingSpot = {
  spot: Spot;
  citySlug: string;
  rank: number;
  score: number;
  postCount: number;
  platformCount: number;
};

async function fetchWeeklyTrendingSpotsInternal(
  citySlug: string | null,
): Promise<WeeklyTrendingSpot[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const supabase = createSupabaseAdmin();
  let rankingQuery = supabase
    .from("weekly_city_spot_rankings")
    .select("city_slug, spot_id, rank, score, post_count, platform_count")
    .eq("week_start", getWeekStart())
    .order(citySlug ? "rank" : "score", { ascending: Boolean(citySlug) })
    .limit(5);
  if (citySlug) rankingQuery = rankingQuery.eq("city_slug", citySlug);

  const { data: rankings, error: rankingError } = await rankingQuery;
  if (rankingError) {
    const schemaUnavailable = ["42P01", "PGRST205"].includes(rankingError.code || "") ||
      /does not exist|schema cache/i.test(rankingError.message || "");
    if (!schemaUnavailable) {
      console.error("[weekly-trending] Rankings unavailable:", rankingError.message);
    }
    return [];
  }
  const spotIds = (rankings || []).map((ranking) => ranking.spot_id as string);
  if (spotIds.length === 0) return [];
  const { data: spotRows, error: spotError } = await supabase
    .from("spots")
    .select("*")
    .in("id", spotIds);
  if (spotError) {
    console.error("[weekly-trending] Spots unavailable:", spotError.message);
    return [];
  }
  const spotsById = new Map(
    ((spotRows || []) as RawSpot[])
      .filter(shouldShowPublicSpot)
      .map((spot) => [spot.id, transformSpot(spot)]),
  );
  return (rankings || []).flatMap((ranking) => {
    const spot = spotsById.get(ranking.spot_id as string);
    if (!spot) return [];
    return [{
      spot,
      citySlug: ranking.city_slug as string,
      rank: Number(ranking.rank),
      score: Number(ranking.score),
      postCount: Number(ranking.post_count),
      platformCount: Number(ranking.platform_count),
    }];
  });
}

export async function fetchWeeklyTrendingSpots(
  citySlug: string | null,
): Promise<WeeklyTrendingSpot[]> {
  if (process.env.WEEKLY_SOCIAL_TRENDS_ENABLED !== "true") return [];
  const cached = unstable_cache(
    () => fetchWeeklyTrendingSpotsInternal(citySlug),
    [`weekly-social-trends-${getWeekStart()}-${citySlug || "all"}`],
    { revalidate: 900, tags: ["weekly-social-trends"] },
  );
  return cached();
}
