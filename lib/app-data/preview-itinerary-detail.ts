import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

interface DetailRow {
  id: string; ownerId: string; ownerSource: string; legacyUserId: string | null;
  title: string | null; city: string | null; days: number; activities: string;
  highlights: string | null; estimated_cost: string | null; subtitle: string | null;
  local_score: number | null; created_at: string; status: string | null;
  is_favorite: number; shared: number; share_code: string | null;
  is_public: number | null; like_count: number | null; view_count: number | null;
  source_profile_id: string | null; ai_backgrounds: string | null; story_slides: string | null;
}

export function isPreviewItineraryDetailCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

function parseObject(value: string | null): unknown {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid preview itinerary JSON");
  return parsed;
}

export async function previewItineraryDetail(id: string, userId: string): Promise<
  { state: "missing" } | { state: "forbidden" } | { state: "found"; itinerary: Record<string, unknown> }
> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return { state: "missing" };
  const row = await previewAppDataReader().prepare(`SELECT i.*, o.source AS ownerSource,
    l.clerkUserId AS legacyUserId, m.isPublic AS is_public, m.likeCount AS like_count,
    m.viewCount AS view_count, m.sourceProfileId AS source_profile_id,
    m.aiBackgrounds AS ai_backgrounds, m.storySlides AS story_slides
    FROM itineraries i JOIN owners o ON o.id = i.ownerId
    LEFT JOIN legacy_owners l ON l.ownerId = o.id
    LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id WHERE i.id = ?`)
    .bind(id.toLowerCase()).first<DetailRow>();
  if (!row) return { state: "missing" };
  const ownerUserId = row.ownerSource === "legacy-fixture" && row.legacyUserId === row.ownerId
    ? row.legacyUserId
    : row.ownerSource === "new" && row.legacyUserId === null && row.ownerId.startsWith("auth:")
      ? row.ownerId.slice(5) : null;
  if (!ownerUserId || ![0, 1].includes(row.is_public ?? 0) || ![0, 1].includes(row.shared)
    || ![0, 1].includes(row.is_favorite)) throw new Error("Invalid preview itinerary owner or flags");
  if (ownerUserId !== userId && row.is_public !== 1) return { state: "forbidden" };
  const activities: unknown = JSON.parse(row.activities);
  const highlights: unknown = row.highlights === null ? null : JSON.parse(row.highlights);
  if (!activities || typeof activities !== "object" || (highlights !== null
    && (!Array.isArray(highlights) || highlights.some(item => typeof item !== "string")))) {
    throw new Error("Invalid preview itinerary content");
  }
  if (typeof row.title !== "string" || typeof row.city !== "string" || !Number.isSafeInteger(row.days)
    || row.days < 1 || typeof row.created_at !== "string") throw new Error("Invalid preview itinerary fields");
  return { state: "found", itinerary: {
    id: row.id, clerk_user_id: ownerUserId, title: row.title, city: row.city, days: row.days,
    activities, highlights, estimated_cost: row.estimated_cost, subtitle: row.subtitle,
    local_score: row.local_score, created_at: row.created_at, status: row.status,
    is_favorite: row.is_favorite === 1, shared: row.shared === 1, share_code: row.share_code,
    is_public: row.is_public === 1, like_count: row.like_count ?? 0,
    view_count: row.view_count ?? 0, source_profile_id: row.source_profile_id,
    ai_backgrounds: parseObject(row.ai_backgrounds), story_slides: parseObject(row.story_slides),
  } };
}
