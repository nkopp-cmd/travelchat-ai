import "server-only";
import { isBetaMode } from "@/lib/early-adopters";
import { isLifetimePremiumEmail } from "@/lib/lifetime-premium";
import type { SubscriptionTier } from "@/lib/subscription";
import { previewAppDataReader } from "./preview-db";
import { previewSubscriptionRows, previewSubscriptionTier } from "./preview-subscription-read";

/** Match getUserTier's source-profile email and active-subscription rules. No auth-email fallback. */
export async function previewUserTier(userId: string): Promise<SubscriptionTier> {
  if (!userId || userId.length > 100) throw new Error("Invalid preview tier owner");
  const db = previewAppDataReader();
  const [batches, counts] = await Promise.all([
    db.prepare("SELECT counts FROM legacy_import_batches LIMIT 2").all<{ counts: string }>(),
    db.prepare(`SELECT (SELECT count(*) FROM profiles) AS profiles,
      (SELECT count(*) FROM legacy_profile_emails) AS emails,
      (SELECT count(*) FROM profiles p LEFT JOIN legacy_profile_emails e ON e.profileId=p.id
        WHERE e.profileId IS NULL) AS missing,
      (SELECT count(*) FROM legacy_subscriptions) AS subscriptions`).first<{
        profiles: number; emails: number; missing: number; subscriptions: number;
      }>(),
  ]);
  if (!Array.isArray(batches.results) || batches.results.length !== 1 || !counts) {
    throw new Error("Preview tier import unavailable");
  }
  const expected: unknown = JSON.parse(batches.results[0].counts);
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || (expected as Record<string, unknown>).profiles !== counts.profiles
    || (expected as Record<string, unknown>).legacy_subscriptions !== counts.subscriptions
    || counts.emails !== counts.profiles || counts.missing !== 0) {
    throw new Error("Preview tier import incomplete");
  }
  const [profiles, subscriptions] = await Promise.all([
    db.prepare(`SELECT e.email FROM legacy_profile_emails e JOIN profiles p ON p.id=e.profileId
      JOIN legacy_owners o ON o.ownerId=p.ownerId WHERE o.clerkUserId=? LIMIT 2`)
      .bind(userId).all<{ email: string | null }>(),
    previewSubscriptionRows(userId),
  ]);
  if (!Array.isArray(profiles.results) || profiles.results.length > 1
    || !Array.isArray(subscriptions.results) || subscriptions.results.length > 1) {
    throw new Error("Ambiguous preview tier owner");
  }
  const email = profiles.results[0]?.email;
  if (email != null && typeof email !== "string") throw new Error("Invalid source profile email");
  if (isBetaMode() || isLifetimePremiumEmail(email)) return "premium";
  return previewSubscriptionTier(subscriptions.results[0]);
}
