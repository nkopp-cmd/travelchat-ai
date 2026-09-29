import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_preview_unit_test";
  return { headers: vi.fn(), verify: vi.fn(), previewVerify: vi.fn(), record: vi.fn(), supabase: vi.fn(), resend: vi.fn() };
});
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/stripe", () => ({ stripe: {}, constructWebhookEvent: mocks.verify,
  getTierFromPriceId: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.resend } }, FROM_EMAIL: "preview@example.test" }));
vi.mock("@/lib/app-data/preview-stripe-events", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-stripe-events")>(),
  recordPreviewStripeEvent: mocks.record, verifyPreviewStripeEvent: mocks.previewVerify,
}));

import { POST } from "@/app/api/subscription/webhook/route";

const originalEnvironment = process.env;
const preview = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, candidate = true, signature: string | null = "signed") => new NextRequest(
  `https://${host}/api/subscription/webhook${candidate ? "?data_candidate=d1" : ""}`,
  { method: "POST", body: "signed payload", headers: signature ? { "stripe-signature": signature } : {} },
);
const event = { id: "evt_preview_123", type: "customer.subscription.updated", livemode: false,
  created: 1780170000, data: { object: { id: "sub_preview_123" } } };
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

describe("subscription webhook candidate route", () => {
  it("rejects missing and invalid signatures before D1", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.previewVerify.mockReturnValue(null);
    expect((await POST(request(preview, true, null))).status).toBe(400);
    expect((await POST(request(preview))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("records the verified preview event without Supabase, email, or Stripe API calls", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.previewVerify.mockReturnValue(event);
    mocks.record.mockResolvedValue({ recorded: true });
    const response = await POST(request(preview));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await response.json()).toEqual({ received: true, recorded: true });
    expect(mocks.record).toHaveBeenCalledWith(event, "signed payload");
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("returns 400 for live events and 500 when D1 cannot record a verified event", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.previewVerify.mockReturnValue(event);
    const { PreviewStripeEventRejected } = await import("@/lib/app-data/preview-stripe-events");
    mocks.record.mockRejectedValueOnce(new PreviewStripeEventRejected("Live Stripe events are not accepted on preview"))
      .mockRejectedValueOnce(new Error("D1 unavailable"));
    expect((await POST(request(preview))).status).toBe(400);
    expect((await POST(request(preview))).status).toBe(500);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("returns 503 while the isolated preview signing secret is absent", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const { PreviewStripeSecretMissing } = await import("@/lib/app-data/preview-stripe-events");
    mocks.previewVerify.mockImplementation(() => { throw new PreviewStripeSecretMissing("missing"); });
    expect((await POST(request(preview))).status).toBe(503);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www outside the D1 branch", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.headers.mockResolvedValue(new Headers({ "stripe-signature": "signed" }));
    mocks.verify.mockReturnValue({ ...event, type: "ignored.event" });
    mocks.supabase.mockReturnValue({});
    expect((await POST(request(preview, false))).status).toBe(200);
    expect((await POST(request("www.localley.io"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
