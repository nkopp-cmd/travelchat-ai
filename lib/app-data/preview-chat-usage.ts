import "server-only";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { TIER_CONFIGS } from "@/lib/subscription";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface CountRow { count: number; baselineCount: number }
import { previewUserTier } from "./preview-user-tier";

export function isPreviewChatUsageCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Only reserved verified proof accounts may exercise candidate writes. */
async function previewChatOwner(userId: string): Promise<string> {
  const user = await currentUser();
  if (user?.id !== userId || !user.emailVerified
    || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
    throw new Error("Preview chat counter requires a verified test account");
  }
  const owners = await ownerIds(userId);
  if (owners.legacy && owners.fresh) throw new Error("Conflicting preview chat owner");
  if (owners.legacy) return owners.legacy;
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
  const tier = await previewUserTier(userId);
  const dailyLimit = TIER_CONFIGS[tier].limits.chatMessagesPerDay;
  const batches = await db.prepare("SELECT counts FROM legacy_import_batches LIMIT 2").all<{ counts: string }>();
  const total = await db.prepare("SELECT count(*) AS n FROM legacy_usage").first<{ n: number }>();
  if (batches.results?.length !== 1 || !total
    || JSON.parse(batches.results[0].counts).legacy_usage !== total.n) {
    throw new Error("Historical chat usage import incomplete");
  }
  const baseline = await db.prepare(`SELECT count FROM legacy_usage
    WHERE ownerId = ? AND usageType = 'chat_messages' AND periodType = 'daily'
      AND periodStart = ? LIMIT 2`).bind(ownerId, day).all<{ count: number }>();
  if (!Array.isArray(baseline.results) || baseline.results.length > 1) {
    throw new Error("Ambiguous historical chat usage");
  }
  const initial = baseline.results[0]?.count ?? 0;
  if (!Number.isSafeInteger(initial) || initial < 0 || initial >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid historical chat usage");
  }
  await db.prepare(`INSERT OR IGNORE INTO preview_chat_usage(ownerId, periodStart, count, baselineCount)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM owners WHERE id = ?)`)
    .bind(ownerId, day, initial, initial, ownerId).run();
  const updated = await db.prepare(`UPDATE preview_chat_usage SET count = count + 1
    WHERE ownerId = ? AND periodStart = ? AND count < ?
      AND baselineCount = ?
      AND EXISTS (SELECT 1 FROM owners WHERE id = ?)
    RETURNING count, baselineCount`).bind(ownerId, day, dailyLimit, initial, ownerId).first<CountRow>();
  const row = updated ?? await db.prepare(`SELECT count, baselineCount FROM preview_chat_usage
    WHERE ownerId = ? AND periodStart = ?`).bind(ownerId, day).first<CountRow>();
  if (!row || !Number.isSafeInteger(row.count) || row.count < initial || row.baselineCount !== initial) {
    throw new Error("Preview chat counter unavailable");
  }
  return { allowed: !!updated, currentUsage: row.count, limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - row.count), periodResetAt: reset.toISOString() };
}
