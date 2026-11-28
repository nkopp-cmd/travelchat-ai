import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { checkoutTrialDays, PRO_TRIAL_DAYS } from "@/lib/subscription";

// Push DW4: the Pro trial is 7 days, Pro only, once per customer. Invariants over tier x interval x history.
const m = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), sessions: vi.fn(), expire: vi.fn() }));
vi.mock("stripe", () => { const S = vi.fn(function () { return { subscriptions: { list: m.list }, checkout: { sessions: { create: m.create, list: m.sessions, expire: m.expire } } }; }); return { default: Object.assign(S, { createFetchHttpClient: () => ({}) }) }; });
let create: typeof import("@/lib/stripe").createCheckoutSession;
beforeEach(async () => { vi.resetAllMocks(); vi.resetModules(); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_offline"); create = (await import("@/lib/stripe")).createCheckoutSession; m.create.mockResolvedValue({ id: "cs" }); m.sessions.mockResolvedValue({ data: [], has_more: false }); });
afterEach(() => vi.unstubAllEnvs());

const tier = fc.constantFrom("pro" as const, "premium" as const);
const interval = fc.constantFrom("monthly", "yearly");
const row = fc.option(fc.record({ stripe_subscription_id: fc.option(fc.stringMatching(/^sub_[a-z0-9]{1,8}$/), { nil: null }) }), { nil: null });
const terminal = fc.array(fc.constantFrom("canceled", "incomplete_expired"), { maxLength: 4 });

describe("checkout trial days (property)", () => {
  it("is 7 only for Pro with no past subscription id, else 0", () => {
    fc.assert(fc.property(tier, interval, row, (t, _interval, existing) => {
      const days = checkoutTrialDays(t, existing);
      expect([0, PRO_TRIAL_DAYS]).toContain(days);
      if (t === "premium" || existing?.stripe_subscription_id) expect(days).toBe(0);
      else expect(days).toBe(PRO_TRIAL_DAYS);
    }));
  });

  it("the Stripe session carries a trial only when the tier allows it and Stripe shows no canceled plan", async () => {
    await fc.assert(fc.asyncProperty(tier, interval, row, terminal, async (t, cycle, existing, history) => {
      m.create.mockClear();
      m.list.mockResolvedValue({ data: history.map(status => ({ status })), has_more: false });
      await create({ customerId: "cus", clerkUserId: "u", priceId: `price_${t}_${cycle}`, successUrl: "https://www.localley.io/s",
        cancelUrl: "https://www.localley.io/p", trialDays: checkoutTrialDays(t, existing) });
      const trial = m.create.mock.calls[0][0].subscription_data.trial_period_days;
      const allowed = t === "pro" && !existing?.stripe_subscription_id && !history.includes("canceled");
      expect(trial).toBe(allowed ? PRO_TRIAL_DAYS : undefined);
    }), { numRuns: 200 });
  });
});
