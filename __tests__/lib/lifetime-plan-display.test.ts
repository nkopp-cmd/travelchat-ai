import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isActivePlanStatus, withLifetimePremium } from "@/lib/lifetime-premium";

const none = { tier: "free", status: "none", currentPeriodEnd: null, billingCycle: "monthly" };

describe("lifetime premium plan display", () => {
  it("shows lifetime accounts as active premium, case-insensitively, keeping other fields", () => {
    expect(withLifetimePremium(none, "Hello@Localley.io")).toEqual({ ...none, tier: "premium", status: "lifetime_premium" });
    expect(isActivePlanStatus("lifetime_premium")).toBe(true);
  });

  it("leaves every other account on its stored row", () => {
    expect(withLifetimePremium(none, "someone@example.com")).toBe(none);
    expect(withLifetimePremium(none, null)).toBe(none);
    expect(isActivePlanStatus("none")).toBe(false);
    expect(isActivePlanStatus("trialing")).toBe(true);
  });

  it("is applied by the settings and profile pages that read the subscriptions table directly", () => {
    for (const page of ["app/settings/page.tsx", "app/profile/page.tsx"]) {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/withLifetimePremium\(\w+\.subscription, user\.emailAddresses\[0\]\?\.emailAddress\)/);
      expect(source).not.toMatch(/\["active", "trialing"\]\.includes/);
    }
  });
});
