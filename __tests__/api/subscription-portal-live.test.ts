import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
// Push AL4: /api/subscription/portal is the only way a payer manages or cancels a plan; it had no route test.
const m = vi.hoisted(() => ({ auth: vi.fn(), single: vi.fn(), eq: vi.fn(), portal: vi.fn(), configured: vi.fn(), refusal: vi.fn() }));
vi.mock("@/lib/app-data/preview-billing-action", () => ({ previewBillingActionRefusal: m.refusal }));
vi.mock("@/lib/auth/server", () => ({ auth: m.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: async () => ({ from: () => ({ select: () => ({ eq: (col: string, val: string) => { m.eq(col, val); return { single: m.single }; } }) }) }) }));
vi.mock("@/lib/stripe", () => ({ isStripeConfigured: m.configured, createBillingPortalSession: m.portal }));
import { POST } from "@/app/api/subscription/portal/route";
const request = () => new NextRequest("https://www.localley.io/api/subscription/portal", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  m.refusal.mockResolvedValue(null);
  m.configured.mockReturnValue(true);
  m.auth.mockResolvedValue({ userId: "user_a" });
  m.single.mockResolvedValue({ data: { stripe_customer_id: "cus_a" }, error: null });
  m.portal.mockResolvedValue({ url: "https://billing.stripe.com/p/session/a" });
});
describe("billing portal route", () => {
  it("opens the portal for the signed-in user's own customer and returns to settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.localley.io");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.stripe.com/p/session/a" });
    expect(m.eq).toHaveBeenCalledWith("clerk_user_id", "user_a");
    expect(m.portal).toHaveBeenCalledWith("cus_a", "https://www.localley.io/settings");
  });
  it("falls back to the request origin for the return URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    await POST(request());
    expect(m.portal).toHaveBeenCalledWith("cus_a", "https://www.localley.io/settings");
  });
  it("refuses a signed-out request before any database or Stripe call", async () => {
    m.auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401);
    expect(m.single).not.toHaveBeenCalled();
    expect(m.portal).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: { stripe_customer_id: null }, error: null },
    { data: null, error: { message: "offline" } },
  ])("refuses a user without a linked Stripe customer %j", async (row) => {
    m.single.mockResolvedValue(row);
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(m.portal).not.toHaveBeenCalled();
  });
  it("reports a Stripe failure as an upstream error, never a portal URL", async () => {
    m.portal.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).not.toContain("billing.stripe.com");
  });
  it("refuses when Stripe is not configured, before auth", async () => {
    m.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBeGreaterThanOrEqual(500);
    expect(m.auth).not.toHaveBeenCalled();
  });
  it("returns the preview refusal unchanged and touches nothing else", async () => {
    m.refusal.mockResolvedValue(new Response("preview", { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(m.auth).not.toHaveBeenCalled();
    expect(m.portal).not.toHaveBeenCalled();
  });
});
