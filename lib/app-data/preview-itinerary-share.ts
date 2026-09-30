import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const codePattern = /^[a-z0-9]{8}$/;
const ownerClause = `ownerId IN (SELECT o.id FROM owners o LEFT JOIN legacy_owners l ON l.ownerId = o.id
  WHERE (o.source = 'legacy-fixture' AND l.clerkUserId = ? AND o.id = l.clerkUserId)
    OR (o.source = 'new' AND o.id = ? AND l.ownerId IS NULL))`;

export function isPreviewItineraryShareCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

type ShareResult = { state: "missing" } | { state: "forbidden" } | { state: "found"; code: string | null };

async function lookup(id: string, userId: string): Promise<ShareResult> {
  const row = await previewAppDataReader().prepare(`SELECT i.shared, i.share_code,
    CASE WHEN ${ownerClause} THEN 1 ELSE 0 END AS owned FROM itineraries i WHERE i.id = ?`)
    .bind(userId, `auth:${userId}`, id).first<{ shared: number; share_code: string | null; owned: number }>();
  if (!row) return { state: "missing" };
  if (row.owned !== 1) return { state: "forbidden" };
  if (![0, 1].includes(row.shared) || (row.share_code !== null && !codePattern.test(row.share_code))) {
    throw new Error("Invalid preview share state");
  }
  return { state: "found", code: row.shared === 1 ? row.share_code : null };
}

export async function setPreviewItineraryShare(id: string, userId: string, enabled: boolean): Promise<ShareResult> {
  if (!idPattern.test(id)) return { state: "missing" };
  const normalizedId = id.toLowerCase();
  const prior = await lookup(normalizedId, userId);
  if (prior.state !== "found") return prior;
  const db = previewAppDataReader();
  if (!enabled) {
    await db.prepare(`UPDATE itineraries SET shared = 0, share_code = NULL
      WHERE id = ? AND ${ownerClause}`).bind(normalizedId, userId, `auth:${userId}`).run();
    return { state: "found", code: null };
  }
  if (prior.code) return prior;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomBytes(4).toString("hex");
    try {
      const result = await db.prepare(`UPDATE itineraries SET shared = 1, share_code = ?
        WHERE id = ? AND shared = 0 AND ${ownerClause}`)
        .bind(code, normalizedId, userId, `auth:${userId}`).run();
      if (result.meta.changes === 1) return { state: "found", code };
    } catch (error) {
      if (!(error instanceof Error) || !/unique constraint failed.*share_code/i.test(error.message)) throw error;
    }
    const current = await lookup(normalizedId, userId);
    if (current.state !== "found" || current.code) return current;
  }
  throw new Error("Preview share code unavailable");
}

export async function getPreviewSharedItinerary(code: string) {
  if (!codePattern.test(code)) return null;
  const row = await previewAppDataReader().prepare(`SELECT i.id, i.title, i.city, i.days,
    i.activities, i.highlights, i.estimated_cost, i.local_score, i.created_at,
    m.storySlides FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE i.share_code = ? AND i.shared = 1`).bind(code).first<{
    id: string; title: string; city: string; days: number; activities: string;
    highlights: string | null; estimated_cost: string | null; local_score: number | null;
    created_at: string; storySlides: string | null;
  }>();
  if (!row) return null;
  const activities: unknown = JSON.parse(row.activities);
  const highlights: unknown = row.highlights === null ? null : JSON.parse(row.highlights);
  if (!activities || typeof activities !== "object" || (highlights !== null
    && (!Array.isArray(highlights) || highlights.some(item => typeof item !== "string")))) {
    throw new Error("Invalid preview shared itinerary");
  }
  let storySlides: Record<string, string> | null = null;
  if (row.storySlides) {
    const meta: unknown = JSON.parse(row.storySlides);
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const story = meta as { slides?: unknown; expires_at?: unknown };
      if (story.slides && typeof story.slides === "object" && !Array.isArray(story.slides)
        && typeof story.expires_at === "string" && new Date(story.expires_at) > new Date()) {
        storySlides = story.slides as Record<string, string>;
      }
    }
  }
  return { id: row.id, title: row.title, city: row.city, days: row.days,
    activities, highlights: highlights as string[] | null, estimatedCost: row.estimated_cost,
    localScore: row.local_score, createdAt: row.created_at, storySlides };
}
