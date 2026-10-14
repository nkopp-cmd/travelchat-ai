import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), read: vi.fn(), update: vi.fn(), upsert: vi.fn(), customer: vi.fn(), checkout: vi.fn(), price: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: m.auth, currentUser: m.user }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.read }) }), update: (data: unknown) => { m.update(data); return { eq: async () => ({ error: null }) }; }, upsert: m.upsert }) }) }));
vi.mock("@/lib/stripe", () => ({ stripe: {}, isStripeConfigured: () => true, getPriceId: m.price, getOrCreateStripeCustomer: m.customer, createCheckoutSession: m.checkout }));
import { POST } from "@/app/api/subscription/checkout/route";
const request = () => new NextRequest("https://www.localley.io/api/subscription/checkout", { method: "POST", body: JSON.stringify({ tier: "pro", billingCycle: "monthly" }) });
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ userId: "a" }); m.user.mockResolvedValue({ id: "a", emailVerified: true, emailAddresses: [{ emailAddress: "a@preview.localley.test" }] }); m.read.mockResolvedValue({ data: null, error: null }); m.upsert.mockResolvedValue({ error: null }); m.price.mockReturnValue("price_live"); m.customer.mockResolvedValue("cus_owned"); m.checkout.mockResolvedValue({ id: "cs_live", url: "https://checkout.stripe.com/pay/owned" }); });
describe("live checkout preserves billing state", () => {
  it("updates only the customer association on an existing free row", async () => {
    m.read.mockResolvedValue({ data: { tier: "free", status: "canceled", stripe_customer_id: "cus_owned" }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get("X-Localley-Billing-Contract")).toBe("2026-10-14");
    expect(m.update).toHaveBeenCalledWith({ stripe_customer_id: "cus_owned", updated_at: expect.any(String) });
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.customer.mock.calls[0][3]).toBe("cus_owned");
    expect(m.checkout.mock.calls[0][0]).toMatchObject({ customerId: "cus_owned", priceId: "price_live", clerkUserId: "a" });
  });
  it.each(["active", "trialing", "past_due"])("refuses a new checkout for an existing paid %s plan", async status => {
    m.read.mockResolvedValue({ data: { tier: "premium", status }, error: null });
    expect((await POST(request())).status).toBe(409); expect(m.customer).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("initializes only an absent row with ignoreDuplicates", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ clerk_user_id: "a", tier: "free", status: "active" }), { onConflict: "clerk_user_id", ignoreDuplicates: true });
  });
  it("refuses an unreadable existing subscription before any provider request", async () => {
    m.read.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect((await POST(request())).status).toBe(500); expect(m.customer).not.toHaveBeenCalled(); expect(m.checkout).not.toHaveBeenCalled();
  });
  it("does not open checkout after a failed customer binding write", async () => {
    m.upsert.mockResolvedValue({ error: { message: "offline" } });
    expect((await POST(request())).status).toBe(500); expect(m.checkout).not.toHaveBeenCalled();
  });
  it("rejects a product ID in a price field before billing writes", async () => {
    m.price.mockReturnValue("prod_wrong"); expect((await POST(request())).status).toBe(400); expect(m.read).not.toHaveBeenCalled(); expect(m.customer).not.toHaveBeenCalled();
  });
  it.each([{ id: "a", emailVerified: false }, { id: "b", emailVerified: true }])("refuses an unverified or changed actor %j", async user => {
    m.user.mockResolvedValue(user); expect((await POST(request())).status).toBe(403); expect(m.customer).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
});
