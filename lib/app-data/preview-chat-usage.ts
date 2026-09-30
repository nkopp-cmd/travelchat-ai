import "server-only";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { TIER_CONFIGS } from "@/lib/subscription";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface CountRow { count: number }
const dailyLimit = TIER_CONFIGS.free.limits.chatMessagesPerDay;

export function isPreviewChatUsageCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Keep historical owners out until their billing and usage history is reconciled. */
async function previewChatOwner(userId: string): Promise<string> {
  const user = await currentUser();
  if (user?.id !== userId || !user.emailVerified
    || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
    throw new Error("Preview chat counter requires a verified test account");
  }
  const owners = await ownerIds(userId);
  if (owners.legacy) throw new Error("Historical chat usage unavailable");
  const ownerId = owners.fresh ?? await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw new Error("Invalid preview chat owner");
  return ownerId;
}

/** Atomic bounded increment; no paid model or Supabase call occurs here. */
export async function incrementPreviewChatUsage(userId: string, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid chat counter time");
  const ownerId = await previewChatOwner(userId);
  const day = now.toISOString().slice(0, 10);
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  const db = previewAppDataReader();
  await db.prepare(`INSERT OR IGNORE INTO preview_chat_usage(ownerId, periodStart, count)
    SELECT ?, ?, 0 WHERE EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
    .bind(ownerId, day, ownerId).run();
  const updated = await db.prepare(`UPDATE preview_chat_usage SET count = count + 1
    WHERE ownerId = ? AND periodStart = ? AND count < ?
      AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')
    RETURNING count`).bind(ownerId, day, dailyLimit, ownerId).first<CountRow>();
  const row = updated ?? await db.prepare(`SELECT count FROM preview_chat_usage
    WHERE ownerId = ? AND periodStart = ?`).bind(ownerId, day).first<CountRow>();
  if (!row || !Number.isSafeInteger(row.count) || row.count < 0 || row.count > dailyLimit) {
    throw new Error("Preview chat counter unavailable");
  }
  return { allowed: !!updated, currentUsage: row.count, limit: dailyLimit,
    remaining: dailyLimit - row.count, periodResetAt: reset.toISOString() };
}
