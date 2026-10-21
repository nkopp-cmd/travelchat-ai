import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { AffiliateClick } from "@/lib/affiliate-click";
import { ensureOwnerId } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

export function isPreviewAffiliateClickCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Appends one click for the signed-in owner. Each event is its own row, like the Source table. */
export async function recordPreviewAffiliateClick(userId: string, click: AffiliateClick,
  meta: { userAgent: string | null; ipHash: string }): Promise<void> {
  const ownerId = await ensureOwnerId(userId);
  const result = await previewAppDataReader().prepare(`INSERT INTO preview_affiliate_clicks(id, ownerId,
    partner, trackingId, eventType, activityName, affiliateUrl, userAgent, ipHash, createdAtMs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomUUID(), ownerId, click.partner, click.trackingId, click.eventType, click.activityName,
      click.affiliateUrl, meta.userAgent, meta.ipHash.slice(0, 16), Date.now()).run();
  if (result.meta.changes !== 1) throw new Error("Unexpected preview affiliate click count");
}
