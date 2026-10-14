import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { webcrypto } from "node:crypto";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Workers webhook crypto", () => {
  it("verifies a real HMAC through the asynchronous SubtleCrypto provider", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit_fixture"); vi.resetModules();
    const { constructWebhookEvent } = await import("@/lib/stripe");
    const payload = JSON.stringify({ id: "evt_offline", type: "ignored", data: { object: {} } });
    const secret = "whsec_offline_unit_fixture";
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await constructWebhookEvent(payload, signature, secret))?.id).toBe("evt_offline");
    expect(await constructWebhookEvent(payload + " ", signature, secret)).toBeNull();
  });
});
