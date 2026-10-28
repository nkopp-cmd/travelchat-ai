import "server-only";
import type { CommunityDb } from "./qa";
import { DAILY_LIMITS, type ReportReason } from "./rules";

/** Spot tips on the application D1 (migrations/app-preview/0042_spot_tips.sql). Same conventions as ./qa.ts. */
export type TipRow = {
  id: string; spot_id: string; user_id: string; author_name: string; body: string; visited_on: string | null;
  status: "visible" | "hidden"; created_at: string; open_reports: number; photo_key: string | null; photo_spot_consent: number;
  ai_verdict?: string | null; ai_reason?: string | null;
};

/** The tip that owns a stored photo, for the media route's access check. */
export async function tipByPhoto(db: CommunityDb, key: string): Promise<{ status: string } | null> {
  return db.prepare("SELECT status FROM spot_tips WHERE photo_key = ?").bind(key).first<{ status: string }>();
}

/** Newest first. Hidden tips and report counts only for admins. */
export async function listTips(db: CommunityDb, spotId: string, admin = false, limit = 50): Promise<TipRow[]> {
  const { results } = await db.prepare(
    `SELECT t.*, ${admin ? "(SELECT count(*) FROM spot_tip_reports r WHERE r.tip_id = t.id AND r.resolved_at IS NULL)" : "0"} AS open_reports
     FROM spot_tips t WHERE t.spot_id = ?${admin ? "" : " AND t.status = 'visible'"}
     ORDER BY coalesce(t.visited_on, substr(t.created_at, 1, 10)) DESC, t.created_at DESC LIMIT ?`,
  ).bind(spotId, Math.min(Math.max(limit, 1), 100)).all<TipRow>();
  return results;
}

export async function createTip(db: CommunityDb, author: { userId: string; name: string }, spotId: string,
  input: { body: string; visitedOn: string | null; photoKey?: string | null; photoConsent?: boolean }, id: string = crypto.randomUUID()):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const spot = await db.prepare("SELECT id FROM spots WHERE id = ? AND visible = 1").bind(spotId).first();
  if (!spot) return { ok: false, error: "This place is not available." };
  const today = await db.prepare("SELECT count(*) AS n FROM spot_tips WHERE user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')")
    .bind(author.userId).first<{ n: number }>();
  if (Number(today?.n ?? 0) >= DAILY_LIMITS.tip) return { ok: false, error: "You reached today's limit for tips. Try again tomorrow." };
  await db.prepare("INSERT INTO spot_tips (id, spot_id, user_id, author_name, body, visited_on, photo_key, photo_spot_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, spotId, author.userId, author.name, input.body, input.visitedOn, input.photoKey ?? null, input.photoKey && input.photoConsent ? 1 : 0).run();
  return { ok: true, id };
}

/** Own tips cannot be reported; one report per user and tip. */
export async function reportTip(db: CommunityDb, userId: string, tipId: string, reason: ReportReason): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO spot_tip_reports (tip_id, user_id, reason) SELECT id, ?, ? FROM spot_tips WHERE id = ? AND user_id <> ?")
    .bind(userId, reason, tipId, userId).run();
}

export async function setTipStatus(db: CommunityDb, tipId: string, status: "visible" | "hidden"): Promise<void> {
  await db.batch([
    db.prepare("UPDATE spot_tips SET status = ? WHERE id = ?").bind(status, tipId),
    db.prepare("UPDATE spot_tip_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tip_id = ? AND resolved_at IS NULL").bind(tipId),
  ]);
}
