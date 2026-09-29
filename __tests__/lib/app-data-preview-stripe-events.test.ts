import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));

import Stripe from "stripe";
import { isPreviewStripeWebhookCandidate, PreviewStripeEventRejected, PreviewStripeSecretMissing,
  recordPreviewStripeEvent, verifyPreviewStripeEvent } from "@/lib/app-data/preview-stripe-events";

const originalEnvironment = process.env;
const event = { id: "evt_preview_123", type: "customer.subscription.updated", created: 1780170000,
  livemode: false, data: { object: { id: "sub_preview_123" } } } as Stripe.Event;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function setup(changes: number, existing: unknown = null) {
  const run = vi.fn().mockResolvedValue({ meta: { changes } });
  const first = vi.fn().mockResolvedValue(existing);
  const bind = vi.fn().mockReturnValue({ run, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  mocks.reader.mockReturnValue({ prepare });
  return { run, first, bind, prepare };
}

describe("preview Stripe event ledger", () => {
  it("verifies a test signature without a Stripe API key", () => {
    process.env = { ...originalEnvironment, PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_localley_unit_test" };
    const payload = JSON.stringify(event);
    const stripe = new Stripe("sk_test_localley_unit_test");
    const signature = stripe.webhooks.generateTestHeaderString({ payload,
      secret: process.env.PREVIEW_STRIPE_WEBHOOK_SECRET });
    expect(verifyPreviewStripeEvent(payload, signature)?.id).toBe(event.id);
    expect(verifyPreviewStripeEvent(payload, "invalid")).toBeNull();
    process.env = { ...originalEnvironment, PREVIEW_STRIPE_WEBHOOK_SECRET: "" };
    expect(() => verifyPreviewStripeEvent(payload, signature)).toThrow(PreviewStripeSecretMissing);
  });
  it("inserts only signed test-mode metadata through the exact preview candidate", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/subscription/webhook${flag ? "?data_candidate=d1" : ""}`,
    );
    expect(isPreviewStripeWebhookCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewStripeWebhookCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewStripeWebhookCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    const { prepare, bind } = setup(1);
    expect(await recordPreviewStripeEvent(event, "signed payload")).toEqual({ recorded: true });
    expect(prepare.mock.calls[0][0]).toContain("INSERT OR IGNORE INTO preview_stripe_events");
    expect(bind.mock.calls[0].slice(0, 5)).toEqual([event.id, event.type, event.created, 0, "sub_preview_123"]);
    expect(bind.mock.calls[0][5]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recognizes exact retries and rejects an ID with a changed payload", async () => {
    const { bind } = setup(0, { eventType: event.type, stripeCreated: event.created,
      objectId: "sub_preview_123", payloadSha256: "0".repeat(64) });
    await expect(recordPreviewStripeEvent(event, "signed payload")).rejects.toThrow(PreviewStripeEventRejected);
    const hash = bind.mock.calls[0][5];
    setup(0, { eventType: event.type, stripeCreated: event.created,
      objectId: "sub_preview_123", payloadSha256: hash });
    expect(await recordPreviewStripeEvent(event, "signed payload")).toEqual({ recorded: false });
  });

  it("rejects live-mode data and propagates D1 write failure", async () => {
    const { run } = setup(1);
    await expect(recordPreviewStripeEvent({ ...event, livemode: true }, "signed payload"))
      .rejects.toThrow(PreviewStripeEventRejected);
    expect(run).not.toHaveBeenCalled();
    run.mockRejectedValue(new Error("D1 unavailable"));
    await expect(recordPreviewStripeEvent(event, "signed payload")).rejects.toThrow("D1 unavailable");
  });
});
