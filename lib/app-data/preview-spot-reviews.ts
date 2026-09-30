import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type ReviewInput = { rating: number; comment: string | null; visitDate: string | null };
type ReviewRow = { id: string; spotId: string; ownerId: string; rating: number; comment: string | null;
  visitDate: string | null; createdAt: string; updatedAt: string; helpfulCount: number; userVoted: number };

export function isPreviewSpotReviewCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export async function assertPreviewReviewUser(userId: string): Promise<void> {
  const user = await currentUser();
  if (user?.id !== userId || !user.emailVerified
    || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")
    || (await ownerIds(userId)).legacy) throw new Error("Historical reviews unavailable");
}

export function parseReviewInput(body: unknown, partial = false): Partial<ReviewInput> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (!partial || value.rating !== undefined) {
    if (!Number.isInteger(value.rating) || (value.rating as number) < 1 || (value.rating as number) > 5) return null;
  }
  if (value.comment !== undefined && value.comment !== null
    && (typeof value.comment !== "string" || value.comment.length > 1000)) return null;
  if (value.visitDate !== undefined && value.visitDate !== null
    && (typeof value.visitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.visitDate)
      || Number.isNaN(Date.parse(value.visitDate)))) return null;
  if (!partial) return { rating: value.rating as number,
    comment: (value.comment as string | null | undefined) ?? null,
    visitDate: (value.visitDate as string | null | undefined) ?? null };
  return { ...(value.rating !== undefined ? { rating: value.rating as number } : {}),
    ...(value.comment !== undefined ? { comment: value.comment as string | null } : {}),
    ...(value.visitDate !== undefined ? { visitDate: value.visitDate as string | null } : {}) };
}

function format(row: ReviewRow, userId: string | null) {
  if (!uuid.test(row.id) || !uuid.test(row.spotId) || !row.ownerId.startsWith("auth:")
    || row.ownerId.length <= 5 || !Number.isInteger(row.rating)
    || row.rating < 1 || row.rating > 5 || !Number.isSafeInteger(row.helpfulCount)
    || row.helpfulCount < 0 || ![0, 1].includes(row.userVoted)) throw new Error("Invalid preview review");
  return { id: row.id, spot_id: row.spotId, clerk_user_id: row.ownerId.slice(5), rating: row.rating,
    comment: row.comment, visit_date: row.visitDate, helpful_count: row.helpfulCount,
    created_at: row.createdAt, updated_at: row.updatedAt, user: null, user_voted: !!userId && row.userVoted === 1 };
}

const selectReview = `SELECT r.id, r.spotId, r.ownerId, r.rating, r.comment, r.visitDate, r.createdAt,
  r.updatedAt, (SELECT count(*) FROM preview_review_votes v WHERE v.reviewId = r.id) AS helpfulCount,
  EXISTS(SELECT 1 FROM preview_review_votes v WHERE v.reviewId = r.id AND v.ownerId = ?) AS userVoted
  FROM preview_spot_reviews r JOIN owners o ON o.id = r.ownerId AND o.source = 'new'`;

export async function previewSpotReviews(spotId: string, userId: string | null, sort: string, limit: number, offset: number) {
  if (!uuid.test(spotId) || !["recent", "helpful", "highest", "lowest"].includes(sort)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new Error("Invalid review query");
  const order = { recent: "r.createdAt DESC", helpful: "helpfulCount DESC", highest: "r.rating DESC",
    lowest: "r.rating ASC" }[sort];
  const db = previewAppDataReader();
  const [page, counts, ratings] = await Promise.all([
    db.prepare(`${selectReview} WHERE r.spotId = ? ORDER BY ${order}, r.id DESC LIMIT ? OFFSET ?`)
      .bind(userId ? newOwnerId(userId) : "", spotId.toLowerCase(), limit, offset).all<ReviewRow>(),
    db.prepare("SELECT count(*) AS n FROM preview_spot_reviews WHERE spotId = ?")
      .bind(spotId.toLowerCase()).first<{ n: number }>(),
    db.prepare("SELECT rating, count(*) AS n FROM preview_spot_reviews WHERE spotId = ? GROUP BY rating")
      .bind(spotId.toLowerCase()).all<{ rating: number; n: number }>(),
  ]);
  if (!Array.isArray(page.results) || page.results.length > limit || !counts
    || !Number.isSafeInteger(counts.n) || counts.n < 0 || !Array.isArray(ratings.results)) {
    throw new Error("Invalid preview review count");
  }
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const row of ratings.results) {
    if (!Number.isInteger(row.rating) || row.rating < 1 || row.rating > 5
      || !Number.isSafeInteger(row.n) || row.n < 0) throw new Error("Invalid preview rating");
    distribution[row.rating - 1] = row.n;
    sum += row.rating * row.n;
  }
  if (distribution.reduce((a, b) => a + b, 0) !== counts.n) throw new Error("Review count mismatch");
  return { reviews: page.results.map(row => format(row, userId)), total: counts.n,
    averageRating: counts.n ? Math.round(sum / counts.n * 10) / 10 : 0,
    ratingDistribution: distribution };
}

export async function createPreviewSpotReview(spotId: string, userId: string, input: ReviewInput) {
  if (!uuid.test(spotId)) return { state: "missing" as const };
  const db = previewAppDataReader();
  const id = randomUUID(), now = new Date().toISOString(), ownerId = await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw new Error("Historical reviews unavailable");
  const result = await db.prepare(`INSERT OR IGNORE INTO preview_spot_reviews
    (id, spotId, ownerId, rating, comment, visitDate, createdAt, updatedAt)
    SELECT ?, s.id, ?, ?, ?, ?, ?, ? FROM spots s WHERE s.id = ? AND s.visible = 1
      AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(id, ownerId, input.rating, input.comment, input.visitDate, now, now, spotId.toLowerCase(), ownerId).run();
  if (result.meta.changes === 1) return { state: "created" as const,
    review: format({ id, spotId: spotId.toLowerCase(), ownerId, ...input, createdAt: now, updatedAt: now,
      helpfulCount: 0, userVoted: 0 }, userId) };
  if (result.meta.changes !== 0) throw new Error("Invalid preview review insert");
  const existing = await db.prepare("SELECT id FROM preview_spot_reviews WHERE spotId = ? AND ownerId = ?")
    .bind(spotId.toLowerCase(), ownerId).first<{ id: string }>();
  return { state: existing ? "duplicate" as const : "missing" as const };
}

export async function updatePreviewSpotReview(spotId: string, reviewId: string, userId: string,
  changes: Partial<ReviewInput>) {
  if (!uuid.test(spotId) || !uuid.test(reviewId)) return { state: "missing" as const };
  const db = previewAppDataReader();
  const existing = await db.prepare("SELECT ownerId FROM preview_spot_reviews WHERE id = ? AND spotId = ?")
    .bind(reviewId.toLowerCase(), spotId.toLowerCase()).first<{ ownerId: string }>();
  if (!existing) return { state: "missing" as const };
  if (existing.ownerId !== newOwnerId(userId)) return { state: "forbidden" as const };
  await db.prepare(`UPDATE preview_spot_reviews SET rating = coalesce(?, rating),
    comment = CASE WHEN ? THEN ? ELSE comment END,
    visitDate = CASE WHEN ? THEN ? ELSE visitDate END, updatedAt = ?
    WHERE id = ? AND spotId = ? AND ownerId = ?`)
    .bind(changes.rating ?? null, changes.comment !== undefined ? 1 : 0, changes.comment ?? null,
      changes.visitDate !== undefined ? 1 : 0, changes.visitDate ?? null, new Date().toISOString(),
      reviewId.toLowerCase(), spotId.toLowerCase(), existing.ownerId).run();
  const row = await db.prepare(`${selectReview} WHERE r.id = ? AND r.spotId = ?`)
    .bind(newOwnerId(userId), reviewId.toLowerCase(), spotId.toLowerCase()).first<ReviewRow>();
  if (!row) throw new Error("Preview review update unavailable");
  return { state: "updated" as const, review: format(row, userId) };
}

export async function deletePreviewSpotReview(spotId: string, reviewId: string, userId: string) {
  if (!uuid.test(spotId) || !uuid.test(reviewId)) return "missing" as const;
  const db = previewAppDataReader();
  const row = await db.prepare("SELECT ownerId FROM preview_spot_reviews WHERE id = ? AND spotId = ?")
    .bind(reviewId.toLowerCase(), spotId.toLowerCase()).first<{ ownerId: string }>();
  if (!row) return "missing" as const;
  if (row.ownerId !== newOwnerId(userId)) return "forbidden" as const;
  const result = await db.prepare("DELETE FROM preview_spot_reviews WHERE id = ? AND spotId = ? AND ownerId = ?")
    .bind(reviewId.toLowerCase(), spotId.toLowerCase(), row.ownerId).run();
  return result.meta.changes === 1 ? "deleted" as const : "missing" as const;
}

export async function votePreviewSpotReview(spotId: string, reviewId: string, userId: string, add: boolean) {
  if (!uuid.test(spotId) || !uuid.test(reviewId)) return { state: "missing" as const };
  const db = previewAppDataReader();
  const row = await db.prepare("SELECT ownerId FROM preview_spot_reviews WHERE id = ? AND spotId = ?")
    .bind(reviewId.toLowerCase(), spotId.toLowerCase()).first<{ ownerId: string }>();
  if (!row) return { state: "missing" as const };
  if (add && row.ownerId === newOwnerId(userId)) return { state: "own" as const };
  const ownerId = await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw new Error("Historical reviews unavailable");
  const result = add ? await db.prepare(`INSERT OR IGNORE INTO preview_review_votes(reviewId, ownerId, createdAt)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM preview_spot_reviews WHERE id = ? AND spotId = ?)
      AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(reviewId.toLowerCase(), ownerId, new Date().toISOString(), reviewId.toLowerCase(),
      spotId.toLowerCase(), ownerId).run()
    : await db.prepare("DELETE FROM preview_review_votes WHERE reviewId = ? AND ownerId = ?")
      .bind(reviewId.toLowerCase(), ownerId).run();
  const count = await db.prepare("SELECT count(*) AS n FROM preview_review_votes WHERE reviewId = ?")
    .bind(reviewId.toLowerCase()).first<{ n: number }>();
  if (!count || !Number.isSafeInteger(count.n) || count.n < 0) throw new Error("Invalid preview vote count");
  return { state: add && result.meta.changes === 0 ? "duplicate" as const : "voted" as const,
    helpful_count: count.n, voted: add };
}
