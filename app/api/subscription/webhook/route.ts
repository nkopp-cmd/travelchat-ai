import { recordFunnelSteps } from "@/lib/spot-event-store";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase";
import { stripe, getTierFromPriceId, constructWebhookEvent } from "@/lib/stripe";
import { sendSubscriptionMail, subscriptionMailEvent, type SubscriptionMailEvent } from "@/lib/subscription-mail";
import { invalidateUserCache } from "@/lib/cache";
import { isPreviewStripeWebhookCandidate, PreviewStripeEventRejected, PreviewStripeSecretMissing,
    recordPreviewStripeEvent, verifyPreviewStripeEvent, readPreviewStripeBody } from "@/lib/app-data/preview-stripe-events";

// Disable body parsing for webhook
export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    if (isPreviewStripeWebhookCandidate(req)) {
        try {
            const signature = req.headers.get("stripe-signature");
            if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
            const body = await readPreviewStripeBody(req);
            if(body===null)return NextResponse.json({error:"Invalid bounded webhook body"},{status:400});
            const event = verifyPreviewStripeEvent(body, signature);
            if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
            const result = await recordPreviewStripeEvent(event, body);
            return NextResponse.json({ received: true, ...result }, {
                headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
            });
        } catch (error) {
            if (error instanceof PreviewStripeSecretMissing) {
                return NextResponse.json({ error: "Preview webhook not configured" }, { status: 503 });
            }
            if (error instanceof PreviewStripeEventRejected) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            console.error("[STRIPE_PREVIEW] Event ledger write failed", error);
            return NextResponse.json({ error: "Preview webhook write failed" }, { status: 500 });
        }
    }
    if (!stripe || !webhookSecret) {
        console.error("Stripe or webhook secret not configured");
        return NextResponse.json(
            { error: "Webhook not configured" },
            { status: 503 }
        );
    }

    try {
        // Get the raw body
        const body = await req.text();
        const headersList = await headers();
        const signature = headersList.get("stripe-signature");

        if (!signature) {
            return NextResponse.json(
                { error: "Missing signature" },
                { status: 400 }
            );
        }

        // Verify webhook signature
        const event = await constructWebhookEvent(body, signature, webhookSecret);

        if (!event) {
            return NextResponse.json(
                { error: "Invalid signature" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // Handle different event types
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutComplete(supabase, session);
                // Trusted paid step (server only). Never throws; a Stripe retry may count twice.
                await recordFunnelSteps([{ step: "checkout_paid", source: "stripe", count: 1 }]);
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const envelope = event.data.object as Stripe.Subscription;
                // Reconcile current provider state rather than replaying an older snapshot.
                const subscription = await stripe.subscriptions.retrieve(envelope.id);
                if (subscription.id !== envelope.id) throw new Error("Subscription identity mismatch");
                if (subscription.status === "canceled") await handleSubscriptionDeleted(supabase, subscription);
                else await handleSubscriptionUpdate(supabase, subscription);
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(supabase, subscription);
                break;
            }

            case "invoice.payment_succeeded":
            case "invoice.paid": {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentSucceeded(supabase, invoice);
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(supabase, invoice);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store", "X-Localley-Billing-Contract": "2026-10-14" } });
    } catch (error) {
        console.error("Webhook error:", error);
        return NextResponse.json(
            { error: "Webhook handler failed" },
            { status: 500 }
        );
    }
}

/** Recover older app subscriptions through an exact trusted customer binding only. */
async function subscriptionOwner(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    record: { metadata?: Record<string, string> | null; customer: string | { id: string } | null }
): Promise<string | null> {
    const explicit = record.metadata?.clerk_user_id;
    if (explicit) return explicit;
    const customerId = typeof record.customer === "string" ? record.customer : record.customer?.id;
    if (!customerId) return null;
    const { data, error } = await supabase.from("subscriptions").select("clerk_user_id")
        .eq("stripe_customer_id", customerId).limit(2);
    if (error || !Array.isArray(data) || data.length > 1) throw new Error("Billing owner binding unavailable");
    const owner = data[0]?.clerk_user_id;
    if (owner !== undefined && (typeof owner !== "string" || !owner || owner.length > 256))
        throw new Error("Invalid billing owner binding");
    return owner ?? null;
}

// Handle checkout completion
async function handleCheckoutComplete(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    session: Stripe.Checkout.Session
) {
    const clerkUserId = session.metadata?.clerk_user_id;
    if (!clerkUserId) {
        console.error("No clerk_user_id in session metadata");
        return;
    }

    // Update subscription record
    const { error: writeError } = await supabase.from("subscriptions").upsert(
        {
            clerk_user_id: clerkUserId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: "clerk_user_id",
        }
    );

    if (writeError) throw new Error("Checkout subscription write failed");

    console.log(`Checkout completed for user ${clerkUserId}`);
}

// Extended Stripe types for properties that may vary by API version
type SubscriptionWithPeriods = Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
    trial_start?: number | null;
    trial_end?: number | null;
};

type InvoiceWithSubscription = Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
};

/** The application schema and entitlement reader support these four states. */
function appBillingStatus(status: string): "active" | "trialing" | "past_due" | "canceled" {
    return status === "active" || status === "trialing" || status === "past_due" ? status : "canceled";
}

// Handle subscription updates
async function handleSubscriptionUpdate(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    subscription: Stripe.Subscription
) {
    const clerkUserId = await subscriptionOwner(supabase, subscription);
    if (!clerkUserId) {
        console.error("No clerk_user_id in subscription metadata");
        return;
    }

    if (subscription.items.data.length !== 1) throw new Error("Subscription price is ambiguous");
    const priceId = subscription.items.data[0]?.price.id || "";
    const tier = getTierFromPriceId(priceId);
    if (tier === "free") throw new Error("Subscription price is not configured");

    // Cast to extended type for period properties
    const legacy = subscription as SubscriptionWithPeriods;
    const item = subscription.items.data[0];
    const sub = { ...legacy, current_period_start: legacy.current_period_start ?? item?.current_period_start,
        current_period_end: legacy.current_period_end ?? item?.current_period_end };

    const status = appBillingStatus(subscription.status);
    const { data: previous } = await supabase.from("subscriptions").select("tier, status")
        .eq("clerk_user_id", clerkUserId).maybeSingle();

    const { error: writeError } = await supabase.from("subscriptions").upsert(
        {
            clerk_user_id: clerkUserId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            tier,
            status,
            billing_cycle: subscription.items.data[0]?.price.recurring?.interval === "year"
                ? "yearly"
                : "monthly",
            current_period_start: sub.current_period_start
                ? new Date(sub.current_period_start * 1000).toISOString()
                : null,
            current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            cancel_at_period_end: subscription.cancel_at_period_end,
            trial_start: sub.trial_start
                ? new Date(sub.trial_start * 1000).toISOString()
                : null,
            trial_end: sub.trial_end
                ? new Date(sub.trial_end * 1000).toISOString()
                : null,
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: "clerk_user_id",
        }
    );

    if (writeError) throw new Error("Subscription update failed");

    console.log(`Subscription updated for user ${clerkUserId}: ${tier} (${status})`);

    // Invalidate user tier cache so changes take effect immediately
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    // Contract confirmation only when the user enters a paid plan (not on renewals or Stripe retries)
    await sendSubscriptionEmail(clerkUserId, subscriptionMailEvent(previous, { tier, status }), tier);
}

// Handle subscription deletion
async function handleSubscriptionDeleted(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    subscription: Stripe.Subscription
) {
    const clerkUserId = await subscriptionOwner(supabase, subscription);
    if (!clerkUserId) {
        console.error("No clerk_user_id in subscription metadata");
        return;
    }

    const { data: previous } = await supabase.from("subscriptions").select("tier, status")
        .eq("clerk_user_id", clerkUserId).eq("stripe_subscription_id", subscription.id).maybeSingle();

    // Downgrade to free tier
    const { error: writeError } = await supabase.from("subscriptions").update(
        {
            tier: "free",
            status: "canceled",
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
        }
    ).eq("clerk_user_id", clerkUserId).eq("stripe_subscription_id", subscription.id);

    if (writeError) throw new Error("Subscription deletion write failed");

    console.log(`Subscription deleted for user ${clerkUserId}`);

    // Invalidate user tier cache so changes take effect immediately
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    // Cancellation confirmation once (a Stripe retry sees the row already canceled)
    await sendSubscriptionEmail(clerkUserId, subscriptionMailEvent(previous, { tier: "free", status: "canceled" }));
}

// Handle successful payment
async function handlePaymentSucceeded(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    invoice: Stripe.Invoice
) {
    const inv = invoice as InvoiceWithSubscription;
    const reference = inv.subscription ?? inv.parent?.subscription_details?.subscription;
    const subscriptionId = typeof reference === "string" ? reference : reference?.id;
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = await subscriptionOwner(supabase, subscription);
    if (!clerkUserId) return;

    // Update status to active
    const { error: writeError } = await supabase.from("subscriptions").update({
        status: appBillingStatus(subscription.status),
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId).eq("stripe_subscription_id", subscriptionId);

    if (writeError) throw new Error("Invoice subscription write failed");

    // Invalidate user tier cache
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    console.log(`Payment succeeded for user ${clerkUserId}`);
}

// Handle failed payment
async function handlePaymentFailed(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    invoice: Stripe.Invoice
) {
    const inv = invoice as InvoiceWithSubscription;
    const reference = inv.subscription ?? inv.parent?.subscription_details?.subscription;
    const subscriptionId = typeof reference === "string" ? reference : reference?.id;
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = await subscriptionOwner(supabase, subscription);
    if (!clerkUserId) return;

    // Update status to past_due
    const { error: writeError } = await supabase.from("subscriptions").update({
        status: appBillingStatus(subscription.status),
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId).eq("stripe_subscription_id", subscriptionId);

    if (writeError) throw new Error("Invoice subscription write failed");

    // Invalidate user tier cache
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    // Stripe sends the failed-payment email (NEEDS 902).
    console.log(`Payment failed for user ${clerkUserId}`);
}

// Confirmation mail never fails the webhook: the subscription write is already done.
async function sendSubscriptionEmail(userId: string, event: SubscriptionMailEvent | null, tier?: string) {
    if (!event) return;
    try {
        const result = await sendSubscriptionMail(userId, event, tier);
        console.log(`[subscription-mail] ${event} ${result.sent ? "sent" : result.reason}`);
    } catch (error) {
        console.error(`[subscription-mail] ${event} failed:`, error instanceof Error ? error.message : "unknown");
    }
}
