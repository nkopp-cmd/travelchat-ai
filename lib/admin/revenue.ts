import { TIER_CONFIGS } from "@/lib/subscription";

export interface SubscriptionRevenueRow {
    clerk_user_id?: string | null;
    tier: string;
    status: string;
    billing_cycle?: string | null;
    stripe_subscription_id?: string | null;
}

export interface RevenueSummary {
    /** Monthly recurring revenue in USD from paying Stripe subscriptions only. */
    mrr: number;
    payingCount: number;
    trialCount: number;
    /** MRR the current trials would add if every one converts. */
    trialMrr: number;
}

const PAID_STATUSES = new Set(["active", "past_due"]);
const PAID_TIERS = new Set(["pro", "premium"]);

function monthlyValue(row: SubscriptionRevenueRow): number {
    const config = TIER_CONFIGS[row.tier as "pro" | "premium"];
    return row.billing_cycle === "yearly" ? config.yearlyPrice / 12 : config.price;
}

/**
 * Admin MRR: counts only active/past_due Pro/Premium rows with a Stripe subscription, outside house/owner accounts.
 * Trials are reported apart and never enter MRR. Prices come from TIER_CONFIGS (yearly = yearlyPrice / 12).
 */
export function summarizeRevenue(
    rows: readonly SubscriptionRevenueRow[],
    excludedOwnerIds: ReadonlySet<string> = new Set(),
): RevenueSummary {
    let mrr = 0, payingCount = 0, trialCount = 0, trialMrr = 0;
    for (const row of rows) {
        if (!PAID_TIERS.has(row.tier) || !row.stripe_subscription_id) continue;
        if (row.clerk_user_id && excludedOwnerIds.has(row.clerk_user_id)) continue;
        if (PAID_STATUSES.has(row.status)) {
            mrr += monthlyValue(row);
            payingCount++;
        } else if (row.status === "trialing") {
            trialMrr += monthlyValue(row);
            trialCount++;
        }
    }
    return { mrr: Math.round(mrr * 100) / 100, payingCount, trialCount, trialMrr: Math.round(trialMrr * 100) / 100 };
}

export function adminOwnerIds(raw = process.env.ADMIN_USER_IDS || ""): Set<string> {
    return new Set(raw.split(",").map((id) => id.trim()).filter(Boolean));
}
