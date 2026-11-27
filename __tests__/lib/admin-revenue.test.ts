import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { adminOwnerIds, summarizeRevenue, type SubscriptionRevenueRow } from "@/lib/admin/revenue";

const row = (over: Partial<SubscriptionRevenueRow>): SubscriptionRevenueRow =>
    ({ clerk_user_id: "u1", tier: "pro", status: "active", billing_cycle: "monthly", stripe_subscription_id: "sub_1", ...over });

describe("summarizeRevenue", () => {
    it("keeps a trialing Premium out of MRR and reports it apart (the 2026-11-27 admin bug)", () => {
        const s = summarizeRevenue([row({ tier: "premium", status: "trialing" }), row({ tier: "free", stripe_subscription_id: null })]);
        expect(s).toEqual({ mrr: 0, payingCount: 0, trialCount: 1, trialMrr: 19 });
    });

    it("uses tier prices, yearly as /12, and counts past_due", () => {
        const s = summarizeRevenue([row({}), row({ tier: "premium", billing_cycle: "yearly", status: "past_due" })]);
        expect(s.mrr).toBe(Math.round((9 + 159 / 12) * 100) / 100);
        expect(s.payingCount).toBe(2);
    });

    it("excludes owner accounts, rows without a Stripe subscription, and canceled rows", () => {
        const s = summarizeRevenue(
            [row({ clerk_user_id: "owner" }), row({ stripe_subscription_id: null }), row({ status: "canceled" })],
            adminOwnerIds(" owner , x"),
        );
        expect(s).toEqual({ mrr: 0, payingCount: 0, trialCount: 0, trialMrr: 0 });
    });

    it("property: MRR is never negative, ignores trials, and stays <= 19 per paying row", () => {
        const arb = fc.record({
            clerk_user_id: fc.constantFrom("a", "b", "owner", null),
            tier: fc.constantFrom("free", "pro", "premium", "odd"),
            status: fc.constantFrom("active", "past_due", "trialing", "canceled"),
            billing_cycle: fc.constantFrom("monthly", "yearly", null),
            stripe_subscription_id: fc.constantFrom("sub", null),
        });
        fc.assert(fc.property(fc.array(arb, { maxLength: 30 }), (rows) => {
            const owners = new Set(["owner"]);
            const s = summarizeRevenue(rows, owners);
            const withoutTrials = summarizeRevenue(rows.filter((r) => r.status !== "trialing"), owners);
            expect(s.mrr).toBeGreaterThanOrEqual(0);
            expect(s.mrr).toBe(withoutTrials.mrr);
            expect(s.mrr).toBeLessThanOrEqual(19 * s.payingCount + 1e-9);
        }));
    });
});
