import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), user: vi.fn(), configured: vi.fn(), admin: vi.fn(), source: vi.fn(),
  customer: vi.fn(), checkout: vi.fn(), portal: vi.fn(), price: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.source }));
vi.mock("@/lib/stripe", () => ({
  stripe: {}, isStripeConfigured: mocks.configured, getOrCreateStripeCustomer: mocks.customer,
  createCheckoutSession: mocks.checkout, createBillingPortalSession: mocks.portal, getPriceId: mocks.price,
}));
import { POST as checkout } from "@/app/api/subscription/checkout/route";
import { POST as portal } from "@/app/api/subscription/portal/route";
const preview = "localley-next-preview.nkopp.workers.dev";
const originalEnv = process.env;
function request(action: string, host = preview, query = "?data_candidate=d1", body = '{"tier":"pro"}') {
  return new NextRequest(`https://${host}/api/subscription/${action}${query}`, { method: "POST", body });
}
beforeEach(() => {
  vi.resetAllMocks(); process.env = { ...originalEnv, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "owner" }); mocks.configured.mockReturnValue(true);
  mocks.user.mockResolvedValue({ emailAddresses: [{ emailAddress: "owner@example.test" }], firstName: "Owner" });
  mocks.price.mockReturnValue("price_test"); mocks.customer.mockResolvedValue("cus_test");
  mocks.admin.mockReturnValue({ from: () => ({ upsert: async () => ({ error: null }) }) });
  mocks.source.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { stripe_customer_id: "cus_test" } }) }) }) }) });
  mocks.checkout.mockResolvedValue({ url: "https://checkout.stripe.test/session", id: "cs_test" });
  mocks.portal.mockResolvedValue({ url: "https://billing.stripe.test/session" });
});
afterEach(() => { process.env = originalEnv; });
function noBillingCalls() {
  for (const spy of [mocks.configured, mocks.user, mocks.admin, mocks.source, mocks.customer, mocks.checkout, mocks.portal, mocks.price]) expect(spy).not.toHaveBeenCalled();
}
describe("explicit candidate payment boundary", () => {
  for (const [action, handler] of [["checkout", checkout], ["portal", portal]] as const) {
    it(`${action} refuses before parsing or source/provider configuration`, async () => {
      const req = request(action, preview, "?data_candidate=d1", "invalid-json"); const json = vi.spyOn(req, "json");
      const response = await handler(req);
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { code: "feature_disabled", message: "Billing changes are unavailable in this preview." } });
      expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
      expect(json).not.toHaveBeenCalled(); expect(mocks.auth).toHaveBeenCalledTimes(1); noBillingCalls();
    });
    it(`${action} preserves refusal if safety vars are absent or wrong`, async () => {
      for (const vars of [{}, { AUTH_MAIL_MODE: "send", SUPABASE_READ_ONLY: "false" }]) {
        process.env = { ...originalEnv, AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined, ...vars };
        expect((await handler(request(action))).status).toBe(503);
      }
      noBillingCalls();
    });
    it(`${action} requires a session before exposing the candidate reply`, async () => {
      mocks.auth.mockResolvedValue({ userId: null }); const response = await handler(request(action));
      expect(response.status).toBe(401); expect(response.headers.get("X-Localley-Data-Source")).toBeNull(); noBillingCalls();
    });
    it(`${action} keeps normal preview, flagged www and lookalikes on their source path`, async () => {
      for (const [host, query] of [[preview, ""], [preview, "?data_candidate=other"], ["www.localley.io", "?data_candidate=d1"], ["localley-next-preview.nkopp.workers.dev.example.test", "?data_candidate=d1"]]) {
        const response = await handler(request(action, host, query));
        expect(response.status).toBe(200); expect(response.headers.get("X-Localley-Data-Source")).toBeNull();
        expect((await response.json()).url).toMatch(/^https:\/\/(checkout|billing)\.stripe\.test/);
      }
      expect(mocks.configured).toHaveBeenCalledTimes(4); expect(mocks.auth).toHaveBeenCalledTimes(4);
      expect(action === "checkout" ? mocks.customer : mocks.source).toHaveBeenCalledTimes(4);
      expect(action === "checkout" ? mocks.checkout : mocks.portal).toHaveBeenCalledTimes(4);
    });
  }
});
