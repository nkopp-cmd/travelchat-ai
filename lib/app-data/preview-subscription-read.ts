import "server-only";
import { previewAppDataReader } from "./preview-db";
export interface PreviewSubscriptionRow {
  tier: string | null;
  status: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: number | null;
  trialEnd: string | null;
}
/** One overlay per exact owner; immutable imported rows are used only without an overlay. */
export async function previewSubscriptionRows(userId: string) {
  return previewAppDataReader()
    .prepare(
      `SELECT s.tier,s.status,s.stripeCustomerId,s.currentPeriodEnd,s.cancelAtPeriodEnd,s.trialEnd
    FROM preview_subscription_effective s JOIN owners own ON own.id=s.ownerId
    LEFT JOIN legacy_owners o ON o.ownerId=own.id
    WHERE o.clerkUserId = ? OR (own.id=? AND own.source='new' AND o.clerkUserId IS NULL) LIMIT 2`,
    )
    .bind(userId, `auth:${userId}`)
    .all<PreviewSubscriptionRow>();
}

export function previewSubscriptionTier(
  row: Pick<PreviewSubscriptionRow, "tier" | "status"> | undefined,
): "free" | "pro" | "premium" {
  if (!row || !["active", "trialing"].includes(row.status ?? "")) return "free";
  if (row.tier === "free" || row.tier === "pro" || row.tier === "premium")
    return row.tier;
  throw new Error("Invalid preview subscription tier");
}
