// Push EB3: property test for checkoutTrialDays (lib/subscription.ts), the number of free days Stripe checkout gets.
// Invariants: the trial is a one-time Pro offer. Premium never gets one, a customer with any earlier Stripe
// subscription id never gets one, and a new Pro customer gets exactly PRO_TRIAL_DAYS (a positive whole number).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkoutTrialDays, PRO_TRIAL_DAYS } from "@/lib/subscription";

const tier = fc.constantFrom("pro" as const, "premium" as const);
const subId = fc.string({ minLength: 1, maxLength: 40 });
const noSub = fc.constantFrom(null, undefined, {}, { stripe_subscription_id: null }, { stripe_subscription_id: undefined }, { stripe_subscription_id: "" });
const existing = fc.oneof(noSub, subId.map((id) => ({ stripe_subscription_id: id })));

describe("checkoutTrialDays properties (Push EB3)", () => {
    it("always returns 0 or PRO_TRIAL_DAYS, and PRO_TRIAL_DAYS is a positive whole number", () => {
        expect(Number.isInteger(PRO_TRIAL_DAYS) && PRO_TRIAL_DAYS > 0).toBe(true);
        fc.assert(fc.property(tier, existing, (t, e) => [0, PRO_TRIAL_DAYS].includes(checkoutTrialDays(t, e))));
    });

    it("Premium never gets a trial", () => {
        fc.assert(fc.property(existing, (e) => checkoutTrialDays("premium", e) === 0));
    });

    it("a customer with any earlier Stripe subscription id never gets a second trial", () => {
        fc.assert(fc.property(tier, subId, (t, id) => checkoutTrialDays(t, { stripe_subscription_id: id }) === 0));
    });

    it("a new Pro customer gets exactly PRO_TRIAL_DAYS", () => {
        fc.assert(fc.property(noSub, (e) => checkoutTrialDays("pro", e) === PRO_TRIAL_DAYS));
    });

    it("a trial is given only when the tier is Pro and no subscription id exists", () => {
        fc.assert(
            fc.property(tier, existing, (t, e) => {
                const gotTrial = checkoutTrialDays(t, e) > 0;
                return gotTrial === (t === "pro" && !e?.stripe_subscription_id);
            }),
        );
    });
});
