import "server-only";
import type { NextRequest } from "next/server";
import { getRankTitle } from "@/lib/gamification";
import { previewAppDataReader } from "./preview-db";

interface ProfileRow { id: string; clerkId: string; username: string | null; xp: number | null; level: number | null }
interface BatchRow { id: string; counts: string }

export function isPreviewLeaderboardCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export function parseLeaderboardLimit(value: string | null): number | null {
  if (value === null) return 50;
  if (!/^[1-9][0-9]{0,2}$/.test(value)) return null;
  const limit = Number(value);
  return limit <= 100 ? limit : null;
}

function validProfile(row: ProfileRow): boolean {
  return !!row && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id)
    && typeof row.clerkId === "string" && row.clerkId.length > 0 && row.clerkId.length <= 64
    && (row.username === null || (typeof row.username === "string" && row.username.length <= 256))
    && (row.xp === null || (Number.isSafeInteger(row.xp) && row.xp >= 0))
    && (row.level === null || (Number.isSafeInteger(row.level) && row.level >= 1));
}

const sourceJoin = `FROM legacy_profile_stats s JOIN profiles p ON p.id = s.profileId
  JOIN owners o ON o.id = p.ownerId JOIN legacy_owners l ON l.ownerId = o.id
  WHERE o.source = 'legacy-fixture' AND l.hasSourceProfile = 1 AND l.batchId = ?`;

/** Counted historical profile view. Unclaimed owners remain visible but never gain a session. */
export async function previewLeaderboard(userId: string | null, limit: number) {
  const db = previewAppDataReader();
  const batch = await db.prepare("SELECT id, counts FROM legacy_import_batches ORDER BY importedAt DESC, id DESC LIMIT 1")
    .first<BatchRow>();
  if (!batch || !/^[a-f0-9]{64}$/.test(batch.id)) throw new Error("Leaderboard archive unavailable");
  const counts: unknown = JSON.parse(batch.counts);
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) throw new Error("Invalid leaderboard batch");
  const expected = (counts as Record<string, unknown>).legacy_profile_stats;
  if (!Number.isSafeInteger(expected) || (expected as number) < 0 || (expected as number) > 100000
    || (counts as Record<string, unknown>).profiles !== expected) throw new Error("Invalid leaderboard counts");

  const [owners, joined] = await Promise.all([
    db.prepare("SELECT count(*) AS n FROM legacy_owners WHERE batchId = ? AND hasSourceProfile = 1")
      .bind(batch.id).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n ${sourceJoin}`).bind(batch.id).first<{ n: number }>(),
  ]);
  if (!owners || !joined || owners.n !== expected || joined.n !== expected) {
    throw new Error("Leaderboard archive count mismatch");
  }

  const { results } = await db.prepare(`SELECT p.id AS id, l.clerkUserId AS clerkId,
    s.username, s.xp, s.level ${sourceJoin}
    ORDER BY coalesce(s.xp, 0) DESC, p.id ASC LIMIT ?`).bind(batch.id, limit).all<ProfileRow>();
  if (!Array.isArray(results) || results.length > limit || results.some(row => !validProfile(row))) {
    throw new Error("Invalid leaderboard profile");
  }
  const leaderboard = results.map((row, index) => ({
    rank: index + 1, id: row.id, clerkId: row.clerkId,
    username: row.username || `Explorer${index + 1}`, xp: row.xp ?? 0,
    level: row.level ?? 1, title: getRankTitle(row.level ?? 1),
    isCurrentUser: row.clerkId === userId,
  }));
  let currentUserRank = null;
  if (userId && !leaderboard.some(row => row.isCurrentUser)) {
    const current = await db.prepare(`SELECT p.id AS id, l.clerkUserId AS clerkId,
      s.username, s.xp, s.level ${sourceJoin} AND l.clerkUserId = ? LIMIT 2`)
      .bind(batch.id, userId).all<ProfileRow>();
    if (!Array.isArray(current.results) || current.results.length > 1) throw new Error("Invalid leaderboard owner");
    const row = current.results[0];
    if (row) {
      if (!validProfile(row)) throw new Error("Invalid leaderboard owner");
      const higher = await db.prepare(`SELECT count(*) AS n ${sourceJoin} AND coalesce(s.xp, 0) > ?`)
        .bind(batch.id, row.xp ?? 0).first<{ n: number }>();
      if (!higher || !Number.isSafeInteger(higher.n) || higher.n < 0 || higher.n >= joined.n) {
        throw new Error("Invalid leaderboard rank");
      }
      currentUserRank = {
        rank: higher.n + 1, id: row.id, clerkId: row.clerkId,
        username: row.username || "You", xp: row.xp ?? 0, level: row.level ?? 1,
        title: getRankTitle(row.level ?? 1), isCurrentUser: true,
      };
    }
  }
  return { leaderboard, currentUserRank };
}
