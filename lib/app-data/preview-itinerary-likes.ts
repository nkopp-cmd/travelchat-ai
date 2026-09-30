import "server-only";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function isPreviewItineraryLikeCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Historical saves are not imported. Admit verified, isolated preview owners only. */
export async function assertPreviewLikeUser(userId: string): Promise<void> {
  const user = await currentUser();
  if (user?.id !== userId || !user.emailVerified
    || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
    throw new Error("Historical itinerary likes unavailable");
  }
  if ((await ownerIds(userId)).legacy) throw new Error("Historical itinerary likes unavailable");
}

async function countLikes(id: string): Promise<number> {
  const row = await previewAppDataReader().prepare(`SELECT count(*) AS n FROM preview_itinerary_likes
    WHERE itineraryId = ?`).bind(id).first<{ n: number }>();
  if (!row || !Number.isSafeInteger(row.n) || row.n < 0) throw new Error("Invalid preview like count");
  return row.n;
}

export async function previewLikeStatus(userId: string, id: string) {
  if (!idPattern.test(id)) return { liked: false, likeCount: 0 };
  const normalized = id.toLowerCase();
  const ownerId = newOwnerId(userId);
  const [like, count] = await Promise.all([
    previewAppDataReader().prepare(`SELECT 1 AS liked FROM preview_itinerary_likes l
      JOIN owners o ON o.id = l.ownerId AND o.source = 'new'
      WHERE l.ownerId = ? AND l.itineraryId = ? LIMIT 1`).bind(ownerId, normalized).first<{ liked: number }>(),
    countLikes(normalized),
  ]);
  return { liked: !!like, likeCount: count };
}

type LikeWrite = { state: "missing" } | { state: "own" } | { state: "private" } |
  { state: "found"; liked: boolean; likeCount: number; duplicate?: boolean };

export async function addPreviewItineraryLike(userId: string, id: string): Promise<LikeWrite> {
  if (!idPattern.test(id)) return { state: "missing" };
  const normalized = id.toLowerCase();
  const db = previewAppDataReader();
  const row = await db.prepare(`SELECT i.ownerId, i.shared, COALESCE(m.isPublic, 0) AS isPublic,
    o.source AS ownerSource, l.clerkUserId AS legacyUserId
    FROM itineraries i JOIN owners o ON o.id = i.ownerId
    LEFT JOIN legacy_owners l ON l.ownerId = o.id
    LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id WHERE i.id = ?`)
    .bind(normalized).first<{ ownerId: string; shared: number; isPublic: number;
      ownerSource: string; legacyUserId: string | null }>();
  if (!row) return { state: "missing" };
  const creator = row.ownerSource === "new" && row.ownerId.startsWith("auth:") && row.legacyUserId === null
    ? row.ownerId.slice(5) : row.ownerSource === "legacy-fixture" && row.ownerId === row.legacyUserId
      ? row.legacyUserId : null;
  if (!creator || ![0, 1].includes(row.shared) || ![0, 1].includes(row.isPublic)) {
    throw new Error("Invalid preview itinerary owner or visibility");
  }
  if (creator === userId) return { state: "own" };
  if (row.shared !== 1 && row.isPublic !== 1) return { state: "private" };
  const ownerId = await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw new Error("Historical itinerary likes unavailable");
  const result = await db.prepare(`INSERT OR IGNORE INTO preview_itinerary_likes(ownerId, itineraryId, createdAt)
    SELECT ?, i.id, ? FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE i.id = ? AND (i.shared = 1 OR m.isPublic = 1)
      AND i.ownerId <> ? AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(ownerId, new Date().toISOString(), normalized, ownerId, ownerId).run();
  const status = await previewLikeStatus(userId, normalized);
  if (!status.liked) return { state: "private" };
  return { state: "found", ...status, duplicate: result.meta.changes === 0 };
}

export async function removePreviewItineraryLike(userId: string, id: string) {
  if (!idPattern.test(id)) return { liked: false, likeCount: 0 };
  const normalized = id.toLowerCase();
  const ownerId = newOwnerId(userId);
  await previewAppDataReader().prepare(`DELETE FROM preview_itinerary_likes WHERE ownerId = ?
    AND itineraryId = ? AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(ownerId, normalized, ownerId).run();
  return { liked: false, likeCount: await countLikes(normalized) };
}

interface SavedRow { id: string; title: string | null; city: string | null; days: number;
  localScore: number | null; shareCode: string | null; viewCount: number | null;
  likeCount: number; createdAt: string; savedAt: string }

export async function previewSavedItineraries(userId: string) {
  const rows = await previewAppDataReader().prepare(`SELECT i.id, i.title, i.city, i.days,
    i.local_score AS localScore, i.share_code AS shareCode, m.viewCount,
    (SELECT count(*) FROM preview_itinerary_likes x WHERE x.itineraryId = i.id) AS likeCount,
    i.created_at AS createdAt, l.createdAt AS savedAt
    FROM preview_itinerary_likes l JOIN owners o ON o.id = l.ownerId AND o.source = 'new'
    JOIN itineraries i ON i.id = l.itineraryId
    LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE l.ownerId = ? AND i.shared = 1 ORDER BY l.createdAt DESC, i.id DESC LIMIT 1001`)
    .bind(newOwnerId(userId)).all<SavedRow>();
  if (!Array.isArray(rows.results) || rows.results.length > 1000) throw new Error("Preview saves exceed limit");
  return { itineraries: rows.results.map(row => {
    if (!idPattern.test(row.id) || typeof row.title !== "string" || typeof row.city !== "string"
      || !Number.isSafeInteger(row.days) || row.days < 1 || !Number.isSafeInteger(row.likeCount)
      || row.likeCount < 0 || !Number.isFinite(Date.parse(row.savedAt))) {
      throw new Error("Invalid preview saved itinerary");
    }
    return { id: row.id, title: row.title, city: row.city, days: row.days,
      localScore: row.localScore ?? 0, shareCode: row.shareCode,
      viewCount: row.viewCount ?? 0, likeCount: row.likeCount,
      createdAt: row.createdAt, savedAt: row.savedAt,
      creatorName: null, creatorAvatar: null };
  }) };
}
