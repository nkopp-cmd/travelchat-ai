import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planBillingDisplay, TIER_CONFIGS } from "@/lib/subscription";

describe("planBillingDisplay", () => {
  it("shows the yearly price to a yearly customer", () => {
    const d = planBillingDisplay({ tier: "pro", status: "active", billingCycle: "yearly" });
    expect(d.priceLabel).toBe(`$${TIER_CONFIGS.pro.yearlyPrice}/year`);
    expect(d.badge).toBe("Active");
    expect(d.trialLine).toBeNull();
  });

  it("shows the monthly price to a monthly customer", () => {
    const d = planBillingDisplay({ tier: "premium", status: "active", billingCycle: "monthly" });
    expect(d.priceLabel).toBe(`$${TIER_CONFIGS.premium.price}/month`);
  });

  it("tells a trial customer the trial end date and the first charge", () => {
    const d = planBillingDisplay({
      tier: "pro",
      status: "trialing",
      billingCycle: "monthly",
      trialEnd: "2026-12-05T23:30:00Z",
    });
    expect(d.badge).toBe("Free trial");
    expect(d.trialLine).toBe(
      `Free trial ends December 5, 2026. Stripe then bills $${TIER_CONFIGS.pro.price} unless you cancel.`,
    );
  });

  it("omits the trial line when the trial end is missing or invalid", () => {
    expect(planBillingDisplay({ tier: "pro", status: "trialing" }).trialLine).toBeNull();
    expect(planBillingDisplay({ tier: "pro", status: "trialing", trialEnd: "nope" }).trialLine).toBeNull();
  });

  it("flags a past-due plan and gives no badge for unknown statuses", () => {
    expect(planBillingDisplay({ tier: "pro", status: "past_due" }).badge).toBe("Past due");
    expect(planBillingDisplay({ tier: "pro", status: "canceled" }).badge).toBeNull();
  });

  it("keeps lifetime premium included and free plans unpriced", () => {
    expect(planBillingDisplay({ tier: "premium", status: "lifetime_premium" })).toEqual({
      priceLabel: "Included",
      badge: "Active",
      trialLine: null,
    });
    expect(planBillingDisplay({ tier: "free", status: "none" })).toEqual({
      priceLabel: null,
      badge: null,
      trialLine: null,
    });
  });

  it("is used by both account pages, which pass the billing cycle and trial end", () => {
    for (const page of ["app/settings/page.tsx", "app/profile/page.tsx"]) {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/planBillingDisplay\(subscription\)/);
      expect(source).toMatch(/trialEnd: \(subscription\.trial_end/);
      expect(source).toMatch(/billing_cycle/);
      expect(source).not.toMatch(/\$\$\{tierConfig\.price\}\/month/);
    }
  });
});
