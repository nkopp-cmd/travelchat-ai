import "server-only";
import { appDataDb } from "@/lib/app-data/backend";
import { getCityBySlug } from "@/lib/cities";
import { ownSpotPhotoPath } from "./own-photo";
import { PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS } from "./public-quality";
import type { RawSpot } from "./transform";
import type { SpotsFilterState } from "./types";

/**
 * D1 versions of the public spot reads (Supabase exit step 3). `spots.visible` holds the public-quality
 * verdict computed at import with the same rules, so only the SQL-side filters, ordering and the
 * name/address dedupe are repeated here. Ordering mirrors Postgres (DESC sorts NULLs first).
 */

/** Columns the list needs before paging: dedupe keys, city/category/score counts. */
export type D1SpotKeyRow = Pick<RawSpot, "id" | "name" | "address" | "category" | "localley_score">;

const NAME_EN = "json_extract(CASE WHEN json_valid(s.name) THEN s.name END, '$.en')";
const DESCRIPTION_EN = "json_extract(CASE WHEN json_valid(s.description) THEN s.description END, '$.en')";

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  if (!/^\s*[[{"]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function visibilityWhere(): { sql: string[]; params: (string | number)[] } {
  return {
    sql: ["s.visible = 1", ...PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS.map(() => `NOT (${NAME_EN} LIKE ?)`)],
    params: [...PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS],
  };
}

function orderBy(sortBy: SpotsFilterState["sortBy"]): string {
  const column = sortBy === "trending" ? "trending_score" : sortBy === "local" ? "local_percentage" : "localley_score";
  return `s.${column} DESC NULLS FIRST, s.id ASC`;
}

/** Ordered key rows for one filter state (the Supabase list query without pagination). */
export async function d1FilteredSpotKeys(filters: SpotsFilterState): Promise<D1SpotKeyRow[]> {
  const where = visibilityWhere();
  const city = filters.city ? getCityBySlug(filters.city) : undefined;
  if (city) {
    where.sql.push("s.address LIKE ?");
    where.params.push(`%${city.name}%`);
  }
  if (filters.category) {
    where.sql.push("s.category = ?");
    where.params.push(filters.category);
  }
  if (filters.score) {
    where.sql.push("s.localley_score >= ?");
    where.params.push(filters.score);
  }
  if (filters.search) {
    const term = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
    where.sql.push(`(${NAME_EN} LIKE ? ESCAPE '\\' OR ${DESCRIPTION_EN} LIKE ? ESCAPE '\\' OR s.address LIKE ? ESCAPE '\\')`);
    where.params.push(term, term, term);
  }
  return keyRows(`SELECT s.id, s.name, s.address, s.category, s.localley_score FROM spots s
    WHERE ${where.sql.join(" AND ")} ORDER BY ${orderBy(filters.sortBy)}`, where.params);
}

/** Every public candidate row, for the filter counts. */
export async function d1PublicSpotKeys(): Promise<D1SpotKeyRow[]> {
  const where = visibilityWhere();
  return keyRows(`SELECT s.id, s.name, s.address, s.category, s.localley_score FROM spots s
    WHERE ${where.sql.join(" AND ")} ORDER BY s.id ASC`, where.params);
}

async function keyRows(sql: string, params: (string | number)[]): Promise<D1SpotKeyRow[]> {
  const { results } = await appDataDb().prepare(sql).bind(...params).all<Record<string, unknown>>();
  return results.map((row) => ({
    id: String(row.id),
    name: parseJson(row.name) as RawSpot["name"],
    address: (row.address ?? "") as RawSpot["address"],
    category: (row.category ?? null) as string | null,
    localley_score: typeof row.localley_score === "number" ? row.localley_score : null,
  }));
}

/** Full card rows for the given ids, in the given order. Hidden spots are never returned. */
export async function d1SpotCardsByIds(ids: string[]): Promise<RawSpot[]> {
  if (ids.length === 0) return [];
  const { results } = await appDataDb().prepare(`SELECT s.*,
      (SELECT p.place_id FROM spot_listing_places p WHERE p.spot_id = s.id AND p.provider = 'google' LIMIT 1) AS google_place_id,
      (SELECT ph.r2_key FROM spot_photos ph WHERE ph.spot_id = s.id) AS own_photo_key,
      d.name AS destination_name, d.slug AS destination_slug, a.name AS local_area_name
    FROM spots s
    LEFT JOIN geo_destinations d ON d.id = s.destination_id
    LEFT JOIN geo_local_areas a ON a.id = s.local_area_id
    WHERE s.visible = 1 AND s.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string, unknown>>();
  const byId = new Map(results.map((row) => [String(row.id), toRawSpot(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export function toRawSpot(row: Record<string, unknown>): RawSpot {
  const lat = typeof row.latitude === "number" ? row.latitude : null;
  const lng = typeof row.longitude === "number" ? row.longitude : null;
  const photos = parseJson(row.photos);
  const subcategories = parseJson(row.subcategories);
  return {
    id: String(row.id),
    name: parseJson(row.name) as RawSpot["name"],
    description: parseJson(row.description) as RawSpot["description"],
    address: (row.address ?? "") as RawSpot["address"],
    category: (row.category ?? null) as string | null,
    subcategories: Array.isArray(subcategories) ? subcategories.map(String) : null,
    location: lat !== null && lng !== null ? { type: "Point", coordinates: [lng, lat] } : null,
    localley_score: typeof row.localley_score === "number" ? row.localley_score : null,
    local_percentage: typeof row.local_percentage === "number" ? row.local_percentage : null,
    best_times: parseJson(row.best_times) as RawSpot["best_times"],
    photos: Array.isArray(photos) ? photos.map(String) : null,
    google_place_id: typeof row.google_place_id === "string" ? row.google_place_id : null,
    own_photo: ownSpotPhotoPath(row.own_photo_key),
    tips: parseJson(row.tips),
    verified: row.verified === 1,
    trending_score: typeof row.trending_score === "number" ? row.trending_score : 0,
    destination: row.destination_name == null ? null : {
      name: parseJson(row.destination_name) as RawSpot["name"],
      slug: typeof row.destination_slug === "string" ? row.destination_slug : undefined,
    },
    localArea: row.local_area_name == null ? null : { name: parseJson(row.local_area_name) as RawSpot["name"] },
  };
}

/** Spots that came in through a social submission (direct link or a created candidate). */
export async function d1CommunitySpotIds(spotIds: string[]): Promise<Set<string>> {
  if (spotIds.length === 0) return new Set();
  const { results } = await appDataDb().prepare(`SELECT spot_id FROM social_spot_submissions WHERE spot_id IN (SELECT value FROM json_each(?1))
    UNION SELECT spot_id FROM social_spot_submission_candidates WHERE spot_id IN (SELECT value FROM json_each(?1))`)
    .bind(JSON.stringify(spotIds)).all<{ spot_id: string }>();
  return new Set(results.map((row) => row.spot_id));
}

export type D1WeeklyRanking = { city_slug: string; spot_id: string; rank: number; score: number; post_count: number; platform_count: number };

/** Weekly rankings: one city by rank, or all cities by score; top 10. */
export async function d1WeeklyRankings(weekStart: string, citySlug: string | null): Promise<D1WeeklyRanking[]> {
  const { results } = await appDataDb().prepare(`SELECT city_slug, spot_id, rank, score, post_count, platform_count
    FROM weekly_city_spot_rankings WHERE week_start = ?${citySlug ? " AND city_slug = ?" : ""}
    ORDER BY ${citySlug ? "rank ASC" : "score DESC NULLS FIRST"} LIMIT 10`)
    .bind(...(citySlug ? [weekStart, citySlug] : [weekStart])).all<D1WeeklyRanking>();
  return results;
}

/**
 * The exact imported Supabase row (legacy_spot_source.payload), so detail and photo reads apply the same
 * public-quality rules to the same fields. Callers still run shouldShowPublicSpot on it.
 */
export async function d1SpotSource(id: string): Promise<(RawSpot & Record<string, unknown>) | null> {
  const row = await appDataDb().prepare(`SELECT l.payload, (SELECT ph.r2_key FROM spot_photos ph WHERE ph.spot_id = l.spotId) AS own_photo_key
    FROM legacy_spot_source l WHERE l.spotId = ?`).bind(id.toLowerCase()).first<{ payload: string; own_photo_key: string | null }>();
  if (!row) return null;
  const spot: unknown = JSON.parse(row.payload);
  if (!spot || typeof spot !== "object" || Array.isArray(spot) || (spot as { id?: unknown }).id !== id.toLowerCase()) {
    throw new Error("Invalid D1 spot source");
  }
  return { ...(spot as RawSpot & Record<string, unknown>), own_photo: ownSpotPhotoPath(row.own_photo_key) };
}

export type D1CommunitySubmission = {
  contributor_credit: string; platform: string; status: string; created_at: string;
  research_summary: string | null; canonical_url: string; research: { createdCandidates?: { spotId?: string | null; status?: string }[] } | null;
};

/** Oldest submission that created the spot, directly or as one of its research candidates. */
export async function d1CommunitySubmission(spotId: string): Promise<D1CommunitySubmission | null> {
  const columns = "contributor_credit, platform, status, created_at, research_summary, canonical_url, research";
  const db = appDataDb();
  const row = await db.prepare(`SELECT ${columns} FROM social_spot_submissions WHERE spot_id = ? ORDER BY created_at ASC LIMIT 1`)
    .bind(spotId).first<Record<string, unknown>>()
    ?? await db.prepare(`SELECT ${columns} FROM social_spot_submissions WHERE json_valid(research) AND EXISTS (
        SELECT 1 FROM json_each(research, '$.createdCandidates') c WHERE json_extract(c.value, '$.spotId') = ?)
      ORDER BY created_at ASC LIMIT 1`).bind(spotId).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...row, research: parseJson(row.research) } as D1CommunitySubmission;
}

// Same order as the Supabase query (DESC NULLS FIRST; localley_score >= ? excludes NULL scores), written to match the
// spots_related_order index (migration 0046) so SQLite reads in index order and stops at LIMIT.
export const RELATED_ORDER = "s.localley_score DESC, (s.local_percentage IS NULL) DESC, s.local_percentage DESC, s.id ASC";

/** Related-spot candidates in one city (the Supabase related query), as source rows. */
export async function d1RelatedSpotSources(city: string, excludeId: string, minimumScore: number, limit: number): Promise<RawSpot[]> {
  const where = visibilityWhere();
  // Related spots filter on the source photos, not the import verdict, exactly like the Supabase query.
  where.sql[0] = "json_array_length(l.payload, '$.photos') > 0";
  const { results } = await appDataDb().prepare(`SELECT l.payload,
      (SELECT ph.r2_key FROM spot_photos ph WHERE ph.spot_id = s.id) AS own_photo_key
    FROM spots s JOIN legacy_spot_source l ON l.spotId = s.id
    WHERE ${where.sql.join(" AND ")} AND s.address LIKE ? AND s.id != ? AND s.localley_score >= ?
    ORDER BY ${RELATED_ORDER} LIMIT ?`)
    .bind(...where.params, `%${city}%`, excludeId.toLowerCase(), minimumScore, limit).all<{ payload: string; own_photo_key: string | null }>();
  return results.map((row) => ({ ...(JSON.parse(row.payload) as RawSpot), own_photo: ownSpotPhotoPath(row.own_photo_key) }));
}
