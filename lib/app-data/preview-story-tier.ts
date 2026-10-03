import "server-only";
import { isBetaMode } from "@/lib/early-adopters";
import { isLifetimePremiumEmail } from "@/lib/lifetime-premium";
import type { SubscriptionTier } from "@/lib/subscription";
import { previewSubscriptionRows, previewSubscriptionTier } from "./preview-subscription-read";

/** Resolve story retention from isolated candidate data and the authenticated email. */
export async function previewStoryTier(userId: string, email: string | null): Promise<SubscriptionTier> {
  if (isBetaMode() || isLifetimePremiumEmail(email)) return "premium";
  const { results } = await previewSubscriptionRows(userId);
  if (!Array.isArray(results) || results.length > 1) throw new Error("Ambiguous preview subscription");
  return previewSubscriptionTier(results[0]);
}
