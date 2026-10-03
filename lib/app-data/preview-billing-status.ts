import "server-only";
import type { NextRequest } from "next/server";
import { isBetaMode, getEarlyAdopterStatus } from "@/lib/early-adopters";
import { isLifetimePremiumEmail } from "@/lib/lifetime-premium";
import { TIER_CONFIGS, type SubscriptionTier } from "@/lib/subscription";
import type { SubscriptionStatusResponse } from "@/app/api/subscription/status/route";
import { previewAppDataReader } from "./preview-db";
import { previewSubscriptionRows, previewSubscriptionTier } from "./preview-subscription-read";

interface UsageRow { usageType: string; periodType: string; periodStart: string; count: number }

export function isPreviewBillingStatusCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Read the effective candidate billing view without crossing owner IDs or touching Stripe. */
export async function previewBillingStatus(userId: string, email: string | null, now = new Date()): Promise<SubscriptionStatusResponse> {
  const db = previewAppDataReader();
  const today = now.toISOString().slice(0, 10);
  const week = new Date(now);
  const day = week.getUTCDay();
  week.setUTCDate(week.getUTCDate() - day + (day === 0 ? -6 : 1));
  const weekStart = week.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7)+"-01";

  const [subscriptions, usage, saved] = await Promise.all([
    previewSubscriptionRows(userId),
    db.prepare(`SELECT u.usageType, u.periodType, u.periodStart, u.count FROM preview_usage_effective u
      JOIN owners own ON own.id=u.ownerId LEFT JOIN legacy_owners o ON o.ownerId = own.id
      WHERE (o.clerkUserId = ? OR (own.id=? AND own.source='new' AND o.clerkUserId IS NULL)) AND ((u.periodType = 'monthly' AND u.periodStart = ?)
        OR (u.periodType = 'daily' AND u.periodStart = ?)
        OR (u.periodType = 'weekly' AND u.periodStart = ?)) LIMIT 65`)
      .bind(userId, `auth:${userId}`, monthStart, today, weekStart).all<UsageRow>(),
    db.prepare(`SELECT count(*) AS n FROM saved_spots s
      JOIN owners own ON own.id=s.ownerId LEFT JOIN legacy_owners o ON o.ownerId = own.id
      WHERE o.clerkUserId = ? OR (own.id=? AND own.source='new' AND o.clerkUserId IS NULL)`)
      .bind(userId, `auth:${userId}`).first<{ n: number }>(),
  ]);

  if (!Array.isArray(subscriptions.results) || subscriptions.results.length > 1
    || !Array.isArray(usage.results) || usage.results.length > 64
    || !saved || !Number.isSafeInteger(saved.n) || saved.n < 0) {
    throw new Error("Preview billing data unavailable");
  }
  const subscription = subscriptions.results[0];
  const baseTier = subscription?.tier || "free";
  if (baseTier !== "free" && baseTier !== "pro" && baseTier !== "premium") {
    throw new Error("Invalid preview billing tier");
  }
  const status = subscription?.status || "none";
  const betaMode = isBetaMode();
  const earlyAdopter = await getEarlyAdopterStatus(userId);
  const lifetimePremium = isLifetimePremiumEmail(email);
  const tier: SubscriptionTier = betaMode || lifetimePremium || earlyAdopter.isEarlyAdopter
    ? "premium" : previewSubscriptionTier(subscription);

  const counts = new Map<string, number>();
  for (const row of usage.results) {
    if (!Number.isSafeInteger(row.count) || row.count < 0
      || !["daily", "weekly", "monthly"].includes(row.periodType)
      || typeof row.usageType !== "string") throw new Error("Invalid preview usage record");
    const key = `${row.periodType}:${row.usageType}`;
    if (counts.has(key)) throw new Error("Duplicate preview usage record");
    counts.set(key, row.count);
  }
  const count = (period: string, type: string) => counts.get(`${period}:${type}`) ?? 0;

  return {
    tier,
    status: betaMode ? "beta" : lifetimePremium ? "lifetime_premium"
      : earlyAdopter.isEarlyAdopter ? "early_adopter" : status,
    isActive: betaMode || lifetimePremium || earlyAdopter.isEarlyAdopter || ["active", "trialing"].includes(status),
    hasBillingPortal: !!subscription?.stripeCustomerId,
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd === 1,
    trialEnd: subscription?.trialEnd || null,
    limits: TIER_CONFIGS[tier].limits,
    usage: {
      itinerariesThisMonth: count("monthly", "itineraries_created"),
      chatMessagesToday: count("daily", "chat_messages"),
      storiesThisWeek: count("weekly", "stories_created"),
      aiImagesThisMonth: count("monthly", "ai_images_generated"),
      savedSpots: saved.n,
    },
    isBetaMode: betaMode,
    isEarlyAdopter: earlyAdopter.isEarlyAdopter,
    earlyAdopterPosition: earlyAdopter.position,
    earlyAdopterSlotsRemaining: earlyAdopter.slotsRemaining,
  };
}
