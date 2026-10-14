import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ verify: vi.fn(), upsert: vi.fn(), update: vi.fn(), write: vi.fn(), retrieve: vi.fn(), tier: vi.fn(), eq: vi.fn(), owner: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: m.retrieve } }, constructWebhookEvent: m.verify, getTierFromPriceId: m.tier }));
vi.mock("@/lib/resend", () => ({ resend: null, FROM_EMAIL: "Localley <hello@localley.io>" }));
vi.mock("@/lib/cache", () => ({ invalidateUserCache: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: m.source }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "stripe-signature": "signature" }) }));
let post: typeof import("@/app/api/subscription/webhook/route").POST;
const event = (type: string, object: unknown) => ({ id: "evt_offline", type, livemode: true, data: { object } });
const sub = { id: "sub_owned", customer: "cus_owned", metadata: { clerk_user_id: "a" }, status: "active", cancel_at_period_end: false, items: { data: [{ price: { id: "price_pro", recurring: { interval: "month" } }, current_period_start: 1770000000, current_period_end: 1772400000 }] } };
const request = () => new NextRequest("https://www.localley.io/api/subscription/webhook", { method: "POST", body: "raw-signed-body" });
beforeEach(async () => {
  vi.resetAllMocks(); vi.resetModules(); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_offline");
  const q = { eq: (key: string, value: string) => { m.eq(key, value); return q; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve(m.write()).then(resolve) };
  m.source.mockReturnValue({ from: () => ({ select: () => ({ eq: (key: string, value: string) => { m.eq(key, value); return { limit: m.owner }; } }), upsert: m.upsert, update: (data: unknown) => { m.update(data); return q; } }) });
  m.owner.mockResolvedValue({ data: [{ clerk_user_id: "a" }], error: null }); m.upsert.mockResolvedValue({ error: null }); m.write.mockReturnValue({ error: null }); m.retrieve.mockResolvedValue(sub); m.tier.mockReturnValue("pro");
  post = (await import("@/app/api/subscription/webhook/route")).POST;
});
afterEach(() => vi.unstubAllEnvs());
describe("live subscription webhook compatibility", () => {
  it("awaits signature verification before touching Source", async () => {
    m.verify.mockResolvedValue(null); expect((await post(request())).status).toBe(400); expect(m.source).not.toHaveBeenCalled();
  });
  it("uses current item-level period fields", async () => {
    m.verify.mockResolvedValue(event("customer.subscription.updated", sub)); expect((await post(request())).status).toBe(200);
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ tier: "pro", current_period_start: new Date(1770000000000).toISOString(), current_period_end: new Date(1772400000000).toISOString() });
  });
  it("keeps legacy period fields when present", async () => {
    m.retrieve.mockResolvedValue({ ...sub, current_period_start: 100, current_period_end: 200 });
    m.verify.mockResolvedValue(event("customer.subscription.created", { ...sub, current_period_start: 100, current_period_end: 200 }));
    expect((await post(request())).status).toBe(200); expect(m.upsert.mock.calls[0][0].current_period_end).toBe(new Date(200000).toISOString());
  });
  it.each(["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"])("handles current invoice parent references for %s", async type => {
    m.verify.mockResolvedValue(event(type, { parent: { subscription_details: { subscription: "sub_owned" } } }));
    expect((await post(request())).status).toBe(200); expect(m.retrieve).toHaveBeenCalledWith("sub_owned");
    expect(m.eq).toHaveBeenCalledWith("clerk_user_id", "a"); expect(m.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_owned");
  });
  it("reconciles an old failed invoice to current active status", async () => {
    m.verify.mockResolvedValue(event("invoice.payment_failed", { subscription: "sub_owned" }));
    expect((await post(request())).status).toBe(200); expect(m.update.mock.calls[0][0].status).toBe("active");
  });
  it("uses canonical subscription state instead of an old paid snapshot", async () => {
    m.retrieve.mockResolvedValue({ ...sub, status: "canceled" });
    m.verify.mockResolvedValue(event("customer.subscription.updated", sub));
    expect((await post(request())).status).toBe(200); expect(m.upsert).not.toHaveBeenCalled();
    expect(m.update.mock.calls[0][0].status).toBe("canceled");
  });
  it("recovers absent metadata through one exact stored customer association", async () => {
    m.retrieve.mockResolvedValue({ ...sub, metadata: {} });
    m.verify.mockResolvedValue(event("customer.subscription.updated", { ...sub, metadata: {} }));
    expect((await post(request())).status).toBe(200);
    expect(m.eq).toHaveBeenCalledWith("stripe_customer_id", "cus_owned");
    expect(m.owner).toHaveBeenCalledWith(2); expect(m.upsert.mock.calls[0][0].clerk_user_id).toBe("a");
  });
  it("refuses ambiguous customer associations without an email lookup or entitlement write", async () => {
    m.retrieve.mockResolvedValue({ ...sub, metadata: {} }); m.owner.mockResolvedValue({ data: [{ clerk_user_id: "a" }, { clerk_user_id: "b" }], error: null });
    m.verify.mockResolvedValue(event("customer.subscription.updated", sub));
    expect((await post(request())).status).toBe(500); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("leaves an unknown customer unclaimed", async () => {
    m.retrieve.mockResolvedValue({ ...sub, metadata: {} }); m.owner.mockResolvedValue({ data: [], error: null });
    m.verify.mockResolvedValue(event("customer.subscription.updated", sub));
    expect((await post(request())).status).toBe(200); expect(m.upsert).not.toHaveBeenCalled();
  });
  it.each(["incomplete", "incomplete_expired", "paused"])("maps non-serving Stripe status %s to a supported inactive state", async status => {
    m.retrieve.mockResolvedValue({ ...sub, status }); m.verify.mockResolvedValue(event("customer.subscription.updated", sub));
    expect((await post(request())).status).toBe(200); expect(m.upsert.mock.calls[0][0].status).toBe("canceled");
  });
  it("does not promote payment status from a checkout completion alone", async () => {
    m.verify.mockResolvedValue(event("checkout.session.completed", { metadata: { clerk_user_id: "a" }, customer: "cus_owned", subscription: "sub_owned" }));
    expect((await post(request())).status).toBe(200); expect(m.upsert.mock.calls[0][0]).not.toHaveProperty("status"); expect(m.upsert.mock.calls[0][0]).not.toHaveProperty("tier");
  });
  it("restricts a deletion to its exact subscription", async () => {
    m.verify.mockResolvedValue(event("customer.subscription.deleted", sub)); expect((await post(request())).status).toBe(200);
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_owned");
  });
  it.each(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed"])("returns500 on a %s database failure", async type => {
    m.upsert.mockResolvedValue({ error: { message: "offline" } }); m.write.mockReturnValue({ error: { message: "offline" } });
    const object = type.startsWith("invoice") ? { subscription: "sub_owned" } : type.startsWith("checkout") ? { metadata: { clerk_user_id: "a" }, customer: "cus_owned", subscription: "sub_owned" } : sub;
    m.verify.mockResolvedValue(event(type, object)); expect((await post(request())).status).toBe(500);
  });
  it("refuses an unknown price before changing entitlements", async () => {
    m.tier.mockReturnValue("free"); m.verify.mockResolvedValue(event("customer.subscription.updated", sub));
    expect((await post(request())).status).toBe(500); expect(m.upsert).not.toHaveBeenCalled();
  });
});
