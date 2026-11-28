import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), sessions: vi.fn(), expire: vi.fn() }));
vi.mock("stripe", () => { const S = vi.fn(function () { return { subscriptions: { list: m.list }, checkout: { sessions: { create: m.create, list: m.sessions, expire: m.expire } } }; }); return { default: Object.assign(S, { createFetchHttpClient: () => ({}) }) }; });
let create: typeof import("@/lib/stripe").createCheckoutSession;
const params = { customerId: "cus_owned", clerkUserId: "a", priceId: "price_owned", successUrl: "https://www.localley.io/settings", cancelUrl: "https://www.localley.io/pricing" };
beforeEach(async () => { vi.resetAllMocks(); vi.resetModules(); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_offline"); create = (await import("@/lib/stripe")).createCheckoutSession; m.list.mockResolvedValue({ data: [], has_more: false }); m.create.mockResolvedValue({ id: "cs_owned" }); m.sessions.mockResolvedValue({ data: [], has_more: false }); });
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
  it("keeps the funnel source only on the session metadata (Push BX1)", async () => {
    await create({ ...params, funnelSource: "preview" });
    expect(m.create.mock.calls[0][0].metadata).toEqual({ clerk_user_id: "a", funnel_source: "preview" });
    expect(m.create.mock.calls[0][0].subscription_data.metadata).toEqual({ clerk_user_id: "a" });
  });
  it("adds no funnel_source key without a source", async () => {
    await create(params);
    expect(m.create.mock.calls[0][0].metadata).toEqual({ clerk_user_id: "a" });
  });
  it("expires the customer's older open sessions before it opens a new one (Push DW5)", async () => {
    m.sessions.mockResolvedValue({ data: [{ id: "cs_old1" }, { id: "cs_old2" }], has_more: false });
    m.expire.mockResolvedValue({});
    await create(params);
    expect(m.sessions).toHaveBeenCalledWith({ customer: "cus_owned", status: "open", limit: 100 });
    expect(m.expire.mock.calls.map(c => c[0])).toEqual(["cs_old1", "cs_old2"]);
    expect(m.expire.mock.invocationCallOrder[1]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
  });
  it("opens no new session when an older one cannot be expired", async () => {
    m.sessions.mockResolvedValue({ data: [{ id: "cs_old" }], has_more: false });
    m.expire.mockRejectedValue(new Error("stripe down"));
    await expect(create(params)).rejects.toThrow("stripe down");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not list sessions for a customer with a live plan", async () => {
    m.list.mockResolvedValue({ data: [{ status: "active" }], has_more: false });
    await expect(create(params)).rejects.toThrow(/billing settings/);
    expect(m.sessions).not.toHaveBeenCalled();
  });
});
