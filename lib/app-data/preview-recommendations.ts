import "server-only";
import type { NextRequest } from "next/server";
import { ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { rankRecommendationRows, type RawRecommendationSpot, type UserItinerary } from "@/lib/recommendations";

interface TripRow { id: string; city: string; activities: string; created_at: string }
interface SpotRow {
  id: string; name: string; description: string; address: string; category: string;
  localley_score: number | null; photos: string | null; latitude: number | null;
  longitude: number | null;
}

export function isPreviewRecommendationsCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

function localized(value: string): string | Record<string, string> {
  if (!value.trim().startsWith("{")) return value;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || !Object.values(parsed).every(part => typeof part === "string")) {
    throw new Error("Invalid recommendation text");
  }
  return parsed as Record<string, string>;
}

function spotFromRow(row: SpotRow): RawRecommendationSpot {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const photos: unknown = row.photos === null ? [] : JSON.parse(row.photos);
  if (!uuid.test(row.id) || typeof row.category !== "string" || !row.category
    || !Number.isSafeInteger(row.localley_score) || row.localley_score! < 3 || row.localley_score! > 6
    || !Array.isArray(photos) || photos.length > 20
    || photos.some(photo => typeof photo !== "string" || photo.length > 2048)
    || (row.latitude !== null && (!Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90))
    || (row.longitude !== null && (!Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180))) {
    throw new Error("Invalid recommendation spot");
  }
  return {
    id: row.id, name: localized(row.name), description: localized(row.description),
    address: localized(row.address), category: row.category, subcategories: [],
    localley_score: row.localley_score, photos: photos as string[],
    location: { type: "Point", coordinates: [row.longitude ?? 0, row.latitude ?? 0] },
    google_place_id: null, verified: false, trending_score: 0,
  };
}

/** Bounded, owner-scoped recommendations from the normalized preview catalog. */
export async function previewRecommendations(userId: string, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new RangeError("Invalid limit");
  const db = previewAppDataReader();
  const owners = await ownerIds(userId);
  let itineraries: UserItinerary[] = [];
  if (owners.legacy || owners.fresh) {
    const { results } = await db.prepare(`SELECT id, city, activities, created_at FROM itineraries
      WHERE ownerId IN (?, ?) ORDER BY created_at DESC, id DESC LIMIT 10`)
      .bind(owners.legacy ?? "", owners.fresh ?? "").all<TripRow>();
    if (!Array.isArray(results)) throw new Error("Recommendation history unavailable");
    itineraries = results.map(row => {
      const activities: unknown = JSON.parse(row.activities);
      if (typeof row.id !== "string" || typeof row.city !== "string" || !row.city
        || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))
        || !Array.isArray(activities)) throw new Error("Invalid recommendation history");
      return { id: row.id, city: row.city, activities, created_at: row.created_at };
    });
  }
  const { results } = await db.prepare(`SELECT id, name, description, address, category,
    localley_score, photos, latitude, longitude FROM spots
    WHERE visible = 1 AND localley_score >= ? ORDER BY id LIMIT 200`)
    .bind(itineraries.length ? 3 : 5).all<SpotRow>();
  if (!Array.isArray(results)) throw new Error("Recommendation catalog unavailable");
  return rankRecommendationRows(itineraries, results.map(spotFromRow), limit);
}
