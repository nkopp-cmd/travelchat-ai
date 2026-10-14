import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("stripe", () => { const S = vi.fn(function () { return { subscriptions: { list: m.list }, checkout: { sessions: { create: m.create } } }; }); return { default: Object.assign(S, { createFetchHttpClient: () => ({}) }) }; });
let create: typeof import("@/lib/stripe").createCheckoutSession;
const params = { customerId: "cus_owned", clerkUserId: "a", priceId: "price_owned", successUrl: "https://www.localley.io/settings", cancelUrl: "https://www.localley.io/pricing" };
beforeEach(async () => { vi.resetAllMocks(); vi.resetModules(); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_offline"); create = (await import("@/lib/stripe")).createCheckoutSession; m.list.mockResolvedValue({ data: [], has_more: false }); m.create.mockResolvedValue({ id: "cs_owned" }); });
afterEach(() => vi.unstubAllEnvs());
describe("live checkout provider subscription guard", () => {
  it.each(["active", "trialing", "past_due", "incomplete", "paused", "unpaid"])("does not create another session for %s", async status => {
    m.list.mockResolvedValue({ data: [{ status }], has_more: false }); await expect(create(params)).rejects.toThrow(/billing settings/); expect(m.create).not.toHaveBeenCalled();
  });
  it("refuses an incomplete subscription listing", async () => {
    m.list.mockResolvedValue({ data: [], has_more: true }); await expect(create(params)).rejects.toThrow(/billing settings/); expect(m.create).not.toHaveBeenCalled();
  });
  it("opens checkout only when all prior subscriptions are terminal", async () => {
    m.list.mockResolvedValue({ data: [{ status: "canceled" }, { status: "incomplete_expired" }], has_more: false }); await create(params);
    expect(m.list).toHaveBeenCalledWith({ customer: "cus_owned", status: "all", limit: 100 });
    expect(m.create.mock.calls[0][0]).toMatchObject({ customer: "cus_owned", mode: "subscription", line_items: [{ price: "price_owned", quantity: 1 }], metadata: { clerk_user_id: "a" } });
  });
});
