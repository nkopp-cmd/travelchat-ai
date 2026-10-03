import "server-only";
import { applyPreviewSubscriptionEvent } from "./preview-subscription-state";
import { PreviewStripeEventRejected, PreviewStripeSecretMissing } from "./preview-stripe-errors";
export { PreviewStripeEventRejected, PreviewStripeSecretMissing } from "./preview-stripe-errors";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

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

/** Apply only signed test-mode candidate state; never source or external effects. */
export async function recordPreviewStripeEvent(event: Stripe.Event, payload: string): Promise<{ recorded: boolean; applied: boolean }> {
  if (event.livemode !== false) throw new PreviewStripeEventRejected("Live Stripe events are not accepted on preview");
  const objectId = (event.data?.object as { id?: unknown } | undefined)?.id;
  if (typeof event.id !== "string" || !/^evt_[A-Za-z0-9_]{1,196}$/.test(event.id)
    || typeof event.type !== "string" || !event.type || event.type.length > 128
    || !Number.isSafeInteger(event.created) || event.created <= 0
    || typeof objectId !== "string" || !objectId || objectId.length > 200
    || Buffer.byteLength(payload, "utf8") > 256 * 1024) {
    throw new PreviewStripeEventRejected("Invalid preview Stripe event");
  }
  return applyPreviewSubscriptionEvent(event, payload);
}

/** Keep the exact decoded raw body for signature verification, bounded before allocation. */
export async function readPreviewStripeBody(req:Request):Promise<string|null>{
  const reader=req.body?.getReader();if(!reader)return null;
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return null;}chunks.push(value);}
    return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));
  }catch{return null;}finally{reader.releaseLock();}
}
