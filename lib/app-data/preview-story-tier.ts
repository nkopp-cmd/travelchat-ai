import "server-only";
import { isBetaMode } from "@/lib/early-adopters";
import { isLifetimePremiumEmail } from "@/lib/lifetime-premium";
import type { SubscriptionTier } from "@/lib/subscription";
import { previewAppDataReader } from "./preview-db";

/** Resolve story retention from isolated candidate data and the authenticated email. */
export async function previewStoryTier(userId: string, email: string | null): Promise<SubscriptionTier> {
  if (isBetaMode() || isLifetimePremiumEmail(email)) return "premium";
  const { results } = await previewAppDataReader().prepare(`SELECT s.tier AS tier, s.status AS status
    FROM legacy_subscriptions s JOIN legacy_owners o ON o.ownerId = s.ownerId
    WHERE o.clerkUserId = ? LIMIT 2`).bind(userId).all<{ tier: string | null; status: string | null }>();
  if (!Array.isArray(results) || results.length > 1) throw new Error("Ambiguous preview subscription");
  const subscription = results[0];
  if (!subscription || !["active", "trialing"].includes(subscription.status ?? "")) return "free";
  if (subscription.tier === "pro" || subscription.tier === "premium") return subscription.tier;
  if (subscription.tier === "free") return "free";
  throw new Error("Invalid preview subscription tier");
}
