// Push AR1: property tests for the Stripe price -> tier map (lib/stripe.ts). The webhook and the status route
// trust getTierFromPriceId to decide what a customer paid for; an empty price id must never match an unset env.
import fc from "fast-check";
import type Stripe from "stripe";
import { afterEach, describe, expect, it } from "vitest";

import { STRIPE_PRICE_IDS, getTierFromPriceId, parseSubscriptionStatus } from "@/lib/stripe";

const original = structuredClone(STRIPE_PRICE_IDS);
afterEach(() => {
    Object.assign(STRIPE_PRICE_IDS.pro, original.pro);
    Object.assign(STRIPE_PRICE_IDS.premium, original.premium);
});

const priceLike = fc.stringMatching(/^price_[A-Za-z0-9]{1,6}$/);
// Configured ids: unset (""), a small pool so duplicates and collisions with the input happen often.
const configured = fc.oneof(fc.constant(""), fc.constantFrom("price_a", "price_b", "price_c"), priceLike);
const config = fc.record({
    proMonthly: configured,
    proYearly: configured,
    premiumMonthly: configured,
    premiumYearly: configured,
});
const input = fc.oneof(fc.constant(""), fc.constantFrom("price_a", "price_b", "price_c"), priceLike, fc.string());

function apply(c: { proMonthly: string; proYearly: string; premiumMonthly: string; premiumYearly: string }) {
    STRIPE_PRICE_IDS.pro.monthly = c.proMonthly;
    STRIPE_PRICE_IDS.pro.yearly = c.proYearly;
    STRIPE_PRICE_IDS.premium.monthly = c.premiumMonthly;
    STRIPE_PRICE_IDS.premium.yearly = c.premiumYearly;
}

function sub(status: Stripe.Subscription.Status, priceId: string | null): Stripe.Subscription {
    return {
        status,
        cancel_at_period_end: false,
        items: { data: priceId === null ? [] : [{ price: { id: priceId } }] },
    } as unknown as Stripe.Subscription;
}

describe("getTierFromPriceId", () => {
    it("returns premium only for a non-empty premium id, pro only for a non-empty pro id, else free", () => {
        fc.assert(
            fc.property(config, input, (c, id) => {
                apply(c);
                const premium = id !== "" && (id === c.premiumMonthly || id === c.premiumYearly);
                const pro = id !== "" && (id === c.proMonthly || id === c.proYearly);
                expect(getTierFromPriceId(id)).toBe(premium ? "premium" : pro ? "pro" : "free");
            }),
            { numRuns: 500 }
        );
    });

    it("never grants a paid tier to an empty price id, whatever env is unset", () => {
        fc.assert(
            fc.property(config, (c) => {
                apply(c);
                expect(getTierFromPriceId("")).toBe("free");
            })
        );
    });

    it("an unknown price id is free even when every env is set", () => {
        apply({ proMonthly: "price_pm", proYearly: "price_py", premiumMonthly: "price_xm", premiumYearly: "price_xy" });
        fc.assert(
            fc.property(input.filter((id) => !["price_pm", "price_py", "price_xm", "price_xy"].includes(id)), (id) => {
                expect(getTierFromPriceId(id)).toBe("free");
            })
        );
    });
});

describe("parseSubscriptionStatus", () => {
    const statuses: Stripe.Subscription.Status[] = [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
    ];

    it("null is free, inactive, status none", () => {
        expect(parseSubscriptionStatus(null)).toMatchObject({ isActive: false, tier: "free", status: "none" });
    });

    it("isActive only for active or trialing; no price line or empty price is free", () => {
        fc.assert(
            fc.property(config, fc.constantFrom(...statuses), fc.oneof(fc.constant(null), input), (c, status, id) => {
                apply(c);
                const parsed = parseSubscriptionStatus(sub(status, id));
                expect(parsed.isActive).toBe(status === "active" || status === "trialing");
                if (!id) expect(parsed.tier).toBe("free");
                else expect(parsed.tier).toBe(getTierFromPriceId(id));
            }),
            { numRuns: 300 }
        );
    });
});
