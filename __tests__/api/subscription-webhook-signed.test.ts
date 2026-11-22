import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";

// Push CK4: the first payment must turn into Pro/Premium access with no manual fix.
// Real Stripe signature check (no mock of lib/stripe), an in-memory subscriptions table with Postgres upsert
// semantics (only the given columns change), and both Stripe event orders plus a full replay.
const SECRET = "whsec_offline_ck4";
const m = vi.hoisted(() => ({ signature: "", mail: vi.fn(), funnel: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "stripe-signature": m.signature }) }));
vi.mock("@/lib/spot-event-store", () => ({ recordFunnelSteps: m.funnel }));
vi.mock("@/lib/cache", () => ({ invalidateUserCache: vi.fn() }));
vi.mock("@/lib/subscription-mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription-mail")>()), sendSubscriptionMail: m.mail,
}));
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "subscriptions") throw new Error(`unexpected table ${table}`);
      const filters: [string, unknown][] = [];
      const hits = () => m.rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      let patch: Record<string, unknown> | null = null;
      const query = {
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        limit: async (n: number) => ({ data: hits().slice(0, n).map((row) => ({ ...row })), error: null }),
        maybeSingle: async () => ({ data: hits()[0] ? { ...hits()[0] } : null, error: null }), // copies, as Supabase returns
        then(resolve: (value: unknown) => unknown) { if (patch) for (const row of hits()) Object.assign(row, patch); return Promise.resolve({ error: null }).then(resolve); },
      };
      return {
        select: () => query,
        update: (data: Record<string, unknown>) => { patch = data; return query; },
        upsert: async (data: Record<string, unknown>, options: { onConflict: string }) => {
          const key = options.onConflict;
          const existing = m.rows.find((row) => row[key] === data[key]);
          if (existing) Object.assign(existing, data); else m.rows.push({ ...data });
          return { error: null };
        },
      };
    },
  }),
}));

const subscription = (price: string) => ({
  id: "sub_ck4", object: "subscription", customer: "cus_ck4", metadata: { clerk_user_id: "user_ck4" }, status: "active",
  cancel_at_period_end: false, items: { data: [{ price: { id: price, recurring: { interval: "month" } }, current_period_start: 1770000000, current_period_end: 1772400000 }] },
});
const checkout = { id: "cs_ck4", object: "checkout.session", customer: "cus_ck4", subscription: "sub_ck4", metadata: { clerk_user_id: "user_ck4", funnel_source: "pricing" } };
const payload = (id: string, type: string, object: unknown) => JSON.stringify({ id, object: "event", type, livemode: true, created: 1770000000, data: { object } });

let post: typeof import("@/app/api/subscription/webhook/route").POST;
let retrieve: ReturnType<typeof vi.fn>;
async function send(body: string, sign: { secret?: string; timestamp?: number } = {}) {
  m.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: sign.secret ?? SECRET, timestamp: sign.timestamp });
  return post(new NextRequest("https://www.localley.io/api/subscription/webhook", { method: "POST", body }));
}
const row = () => Object.fromEntries(Object.entries(m.rows[0] ?? {}).filter(([key]) => key !== "updated_at"));

beforeEach(async () => {
  vi.resetModules(); m.rows.length = 0; m.mail.mockReset().mockResolvedValue({ sent: true, emailId: "msg" }); m.funnel.mockReset();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_offline_ck4"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro_ck4"); vi.stubEnv("STRIPE_PREMIUM_MONTHLY_PRICE_ID", "price_premium_ck4");
  const { stripe } = await import("@/lib/stripe");
  retrieve = vi.fn(); stripe!.subscriptions.retrieve = retrieve as never;
  post = (await import("@/app/api/subscription/webhook/route")).POST;
});
afterEach(() => vi.unstubAllEnvs());

describe("signed Stripe webhook -> paid access (Push CK4)", () => {
  it.each([["price_premium_ck4", "premium"], ["price_pro_ck4", "pro"]])("checkout then subscription.created gives %s -> tier %s", async (price, tier) => {
    retrieve.mockResolvedValue(subscription(price));
    expect((await send(payload("evt_1", "checkout.session.completed", checkout))).status).toBe(200);
    expect((await send(payload("evt_2", "customer.subscription.created", subscription(price)))).status).toBe(200);
    expect(m.rows).toHaveLength(1);
    expect(row()).toMatchObject({ clerk_user_id: "user_ck4", stripe_customer_id: "cus_ck4", stripe_subscription_id: "sub_ck4", stripe_price_id: price, tier, status: "active", billing_cycle: "monthly" });
    expect(m.mail).toHaveBeenCalledTimes(1);
  });

  it("gives the same access when Stripe sends subscription.created before checkout.session.completed", async () => {
    retrieve.mockResolvedValue(subscription("price_premium_ck4"));
    expect((await send(payload("evt_2", "customer.subscription.created", subscription("price_premium_ck4")))).status).toBe(200);
    expect((await send(payload("evt_1", "checkout.session.completed", checkout))).status).toBe(200);
    expect(row()).toMatchObject({ tier: "premium", status: "active", stripe_subscription_id: "sub_ck4" });
  });

  it("is idempotent on a full replay: same row, no second upgrade mail", async () => {
    retrieve.mockResolvedValue(subscription("price_premium_ck4"));
    const events = [payload("evt_1", "checkout.session.completed", checkout), payload("evt_2", "customer.subscription.created", subscription("price_premium_ck4"))];
    for (const body of events) expect((await send(body)).status).toBe(200);
    const first = row();
    for (const body of events) expect((await send(body)).status).toBe(200);
    expect(m.rows).toHaveLength(1);
    expect(row()).toEqual(first);
    expect(m.mail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a tampered body", (body: string) => ({ body: body.replace("user_ck4", "user_evil"), sign: { body } })],
    ["a wrong secret", (body: string) => ({ body, sign: { body, secret: "whsec_wrong" } })],
    ["a stale timestamp (> 5 min)", (body: string) => ({ body, sign: { body, timestamp: Math.floor(Date.now() / 1000) - 600 } })],
  ])("refuses %s with 400 and writes nothing", async (_name, make) => {
    const { body, sign } = make(payload("evt_1", "checkout.session.completed", checkout));
    m.signature = Stripe.webhooks.generateTestHeaderString({ payload: sign.body, secret: sign.secret ?? SECRET, timestamp: sign.timestamp });
    const response = await post(new NextRequest("https://www.localley.io/api/subscription/webhook", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(m.rows).toHaveLength(0); expect(m.funnel).not.toHaveBeenCalled(); expect(m.mail).not.toHaveBeenCalled();
  });
});
