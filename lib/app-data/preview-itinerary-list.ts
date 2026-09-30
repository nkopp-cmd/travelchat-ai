import "server-only";
import { newOwnerId } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface ListRow {
  id: string; title: string | null; subtitle: string | null; city: string | null;
  days: number; local_score: number | null; created_at: string;
  status: string | null; is_favorite: number;
}

export interface PreviewItineraryListItem {
  id: string; title: string; subtitle?: string; city: string; days: number;
  local_score: number; created_at: string; status?: "draft" | "completed";
  is_favorite?: boolean;
}

export function isPreviewItineraryListCandidate(host: string | null, flag: unknown): boolean {
  return host === "localley-next-preview.nkopp.workers.dev" && flag === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true";
}

/** Read only exact signed-in owner rows; reject incomplete or oversized history. */
export async function previewItineraryList(userId: string): Promise<PreviewItineraryListItem[]> {
  const freshId = newOwnerId(userId);
  const { results } = await previewAppDataReader().prepare(`SELECT i.id, i.title, i.subtitle,
    i.city, i.days, i.local_score, i.created_at, i.status, i.is_favorite
    FROM itineraries i JOIN owners o ON o.id = i.ownerId
    LEFT JOIN legacy_owners l ON l.ownerId = o.id
    WHERE (o.source = 'legacy-fixture' AND o.id = l.clerkUserId AND l.clerkUserId = ?)
      OR (o.source = 'new' AND o.id = ? AND l.ownerId IS NULL)
    ORDER BY i.created_at DESC, i.id DESC LIMIT 101`)
    .bind(userId, freshId).all<ListRow>();
  if (!Array.isArray(results) || results.length > 100) throw new Error("Preview itinerary list unavailable");
  return results.map(row => {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id)
      || typeof row.title !== "string" || !row.title || typeof row.city !== "string"
      || !Number.isSafeInteger(row.days) || row.days < 1
      || (row.local_score !== null && (!Number.isFinite(row.local_score) || row.local_score < 0))
      || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))
      || (row.subtitle !== null && typeof row.subtitle !== "string")
      || (row.status !== null && typeof row.status !== "string")
      || ![0, 1].includes(row.is_favorite)) throw new Error("Invalid preview itinerary list row");
    return {
      id: row.id, title: row.title, subtitle: row.subtitle ?? undefined, city: row.city,
      days: row.days, local_score: row.local_score ?? 0, created_at: row.created_at,
      status: (row.status as "draft" | "completed" | null) ?? undefined,
      is_favorite: row.is_favorite === 1,
    };
  });
}
