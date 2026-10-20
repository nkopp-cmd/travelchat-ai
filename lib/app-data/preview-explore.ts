import "server-only";
import { previewAppDataReader } from "./preview-db";

export interface PreviewPublicItinerary {
  id: string; title: string; city: string; days: number; localScore: number; highlights: string[];
  shareCode: string; createdAt: string; viewCount: number; likeCount: number;
  // The D1 archive holds no public creator profile; candidate cards show none.
  creatorName: null; creatorAvatar: null;
}

interface Row {
  id: string; title: string | null; city: string | null; days: number; local_score: number | null;
  highlights: string | null; share_code: string; created_at: string; view_count: number; like_count: number;
}

const DAY_RANGES: Record<string, [number, number]> = { "1": [1, 1], "2-3": [2, 3], "4-7": [4, 7], "8+": [8, 100000] };
const ORDER: Record<string, string> = {
  popular: "view_count DESC", likes: "like_count DESC", score: "coalesce(i.local_score, 0) DESC", recent: "i.created_at DESC",
};
// Same share-code shape the /shared/[code] D1 reader accepts; other codes would link nowhere.
const codePattern = /^[a-z0-9]{8}$/;
const shared = "i.shared = 1 AND i.share_code IS NOT NULL";

/** Shared (public) itineraries for /explore, with the same filters and sorts as the Supabase page. */
export async function previewPublicItineraries(city?: string, duration?: string, sortBy = "recent"): Promise<PreviewPublicItinerary[]> {
  const where = [shared];
  const binds: (string | number)[] = [];
  if (city && city !== "all") {
    if (city.length > 80) return [];
    // instr, not LIKE: the visitor's text never acts as a wildcard pattern.
    where.push("instr(lower(i.city), lower(?)) > 0");
    binds.push(city);
  }
  const range = duration && duration !== "all" ? DAY_RANGES[duration] : undefined;
  if (range) {
    where.push("i.days BETWEEN ? AND ?");
    binds.push(range[0], range[1]);
  }
  const order = ORDER[sortBy] ?? ORDER.recent;
  const { results } = await previewAppDataReader().prepare(`SELECT i.id, i.title, i.city, i.days, i.local_score,
    i.highlights, i.share_code, i.created_at, coalesce(m.viewCount, 0) AS view_count,
    (SELECT count(*) FROM preview_itinerary_likes x WHERE x.itineraryId = i.id) AS like_count
    FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE ${where.join(" AND ")} ORDER BY ${order}, i.id DESC LIMIT 30`).bind(...binds).all<Row>();
  if (!Array.isArray(results) || results.length > 30) throw new Error("Preview explore unavailable");
  return results.filter((row) => typeof row.share_code === "string" && codePattern.test(row.share_code)).map((row) => {
    const highlights: unknown = row.highlights === null ? [] : JSON.parse(row.highlights);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id) || typeof row.title !== "string"
      || typeof row.city !== "string" || !Number.isSafeInteger(row.days)
      || !Array.isArray(highlights) || highlights.some((item) => typeof item !== "string")
      || !Number.isSafeInteger(row.view_count) || !Number.isSafeInteger(row.like_count)) {
      throw new Error("Invalid preview explore row");
    }
    return {
      id: row.id, title: row.title, city: row.city, days: row.days, localScore: row.local_score ?? 0,
      highlights: highlights as string[], shareCode: row.share_code, createdAt: row.created_at,
      viewCount: row.view_count, likeCount: row.like_count, creatorName: null, creatorAvatar: null,
    };
  });
}

/** Top 10 cities among shared itineraries, most shared first. */
export async function previewPopularCities(): Promise<string[]> {
  const { results } = await previewAppDataReader().prepare(`SELECT i.city AS city, count(*) AS n FROM itineraries i
    WHERE ${shared} AND i.city IS NOT NULL GROUP BY i.city ORDER BY n DESC, i.city ASC LIMIT 10`).all<{ city: string; n: number }>();
  if (!Array.isArray(results)) throw new Error("Preview explore cities unavailable");
  return results.map((row) => row.city);
}
