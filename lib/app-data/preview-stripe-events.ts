import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { previewAppDataReader } from "./preview-db";

interface StoredEvent {
  eventType: string;
  stripeCreated: number;
  objectId: string;
  payloadSha256: string;
}

export class PreviewStripeEventRejected extends Error {}
export class PreviewStripeSecretMissing extends Error {}

// This client verifies signatures only. It never makes a Stripe API request.
const verifier = new Stripe("sk_test_localley_preview_signature_only", {
  typescript: true,
  httpClient: Stripe.createFetchHttpClient(),
});

export function verifyPreviewStripeEvent(payload: string, signature: string): Stripe.Event | null {
  const secret = process.env.PREVIEW_STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PreviewStripeSecretMissing("Preview Stripe signing secret is not configured");
  try { return verifier.webhooks.constructEvent(payload, signature, secret); }
  catch { return null; }
}

export function isPreviewStripeWebhookCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Store only signed, test-mode event metadata. No billing state or external effects. */
export async function recordPreviewStripeEvent(event: Stripe.Event, payload: string): Promise<{ recorded: boolean }> {
  if (event.livemode !== false) throw new PreviewStripeEventRejected("Live Stripe events are not accepted on preview");
  const objectId = (event.data?.object as { id?: unknown } | undefined)?.id;
  if (typeof event.id !== "string" || !/^evt_[A-Za-z0-9_]{1,196}$/.test(event.id)
    || typeof event.type !== "string" || !event.type || event.type.length > 128
    || !Number.isSafeInteger(event.created) || event.created <= 0
    || typeof objectId !== "string" || !objectId || objectId.length > 200
    || Buffer.byteLength(payload, "utf8") > 256 * 1024) {
    throw new PreviewStripeEventRejected("Invalid preview Stripe event");
  }
  const payloadSha256 = createHash("sha256").update(payload).digest("hex");
  const db = previewAppDataReader();
  const result = await db.prepare(`INSERT OR IGNORE INTO preview_stripe_events
    (id,eventType,stripeCreated,livemode,objectId,payloadSha256) VALUES (?,?,?,?,?,?)`)
    .bind(event.id, event.type, event.created, 0, objectId, payloadSha256).run();
  if (result.meta.changes === 1) return { recorded: true };
  if (result.meta.changes !== 0) throw new Error("Unexpected preview Stripe write count");
  const existing = await db.prepare(`SELECT eventType,stripeCreated,objectId,payloadSha256
    FROM preview_stripe_events WHERE id = ?`).bind(event.id).first<StoredEvent>();
  if (!existing || existing.eventType !== event.type || existing.stripeCreated !== event.created
    || existing.objectId !== objectId || existing.payloadSha256 !== payloadSha256) {
    throw new PreviewStripeEventRejected("Stripe event ID conflicts with a different payload");
  }
  return { recorded: false };
}
