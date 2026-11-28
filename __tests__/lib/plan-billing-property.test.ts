import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planBillingDisplay, TIER_CONFIGS, type SubscriptionTier } from "@/lib/subscription";

const tier = fc.constantFrom<SubscriptionTier>("free", "pro", "premium");
const status = fc.oneof(
  fc.constantFrom("active", "trialing", "past_due", "canceled", "incomplete", "none", "lifetime_premium"),
  fc.string(),
);
const cycle = fc.option(fc.oneof(fc.constantFrom("monthly", "yearly"), fc.string()), { nil: undefined });
const trialEnd = fc.option(
  fc.oneof(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2035-12-31"), noInvalidDate: true }).map((d) => d.toISOString()),
    fc.string(),
  ),
  { nil: null },
);
const input = fc.record({ tier, status, billingCycle: cycle, trialEnd });

describe("planBillingDisplay invariants", () => {
  it("a paid, non-lifetime plan always shows the TIER_CONFIGS price for its cycle", () => {
    fc.assert(
      fc.property(input, (sub) => {
        fc.pre(sub.tier !== "free" && sub.status !== "lifetime_premium");
        const config = TIER_CONFIGS[sub.tier];
        const yearly = sub.billingCycle === "yearly";
        const d = planBillingDisplay(sub);
        expect(d.priceLabel).toBe(yearly ? `$${config.yearlyPrice}/year` : `$${config.price}/month`);
      }),
    );
  });

  it("a trial line appears only for a trialing plan with a valid trial end, and names the same amount", () => {
    fc.assert(
      fc.property(input, (sub) => {
        const d = planBillingDisplay(sub);
        const validDate = typeof sub.trialEnd === "string" && !Number.isNaN(new Date(sub.trialEnd).getTime());
        const expected = sub.tier !== "free" && sub.status === "trialing" && validDate;
        expect(d.trialLine !== null).toBe(expected);
        if (d.trialLine) {
          const amount = d.priceLabel?.split("/")[0];
          expect(d.trialLine).toContain(`Stripe then bills ${amount} unless you cancel.`);
        }
      }),
    );
  });

  it("lifetime never shows a price or a trial; free never shows a price or badge", () => {
    fc.assert(
      fc.property(input, (sub) => {
        const d = planBillingDisplay(sub);
        if (sub.status === "lifetime_premium") {
          expect(d).toEqual({ priceLabel: "Included", badge: "Active", trialLine: null });
        } else if (sub.tier === "free") {
          expect(d).toEqual({ priceLabel: null, badge: null, trialLine: null });
        }
      }),
    );
  });

  it("the badge is one of the known labels, and 'Active' only for active or lifetime plans", () => {
    fc.assert(
      fc.property(input, (sub) => {
        const { badge } = planBillingDisplay(sub);
        expect([null, "Active", "Free trial", "Past due"]).toContain(badge);
        if (badge === "Active") expect(["active", "lifetime_premium"]).toContain(sub.status);
      }),
    );
  });
});
