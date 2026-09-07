import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase";
import { stripe, getTierFromPriceId, constructWebhookEvent } from "@/lib/stripe";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { SubscriptionEmail } from "@/emails/subscription-email";
import { invalidateUserCache } from "@/lib/cache";

// Disable body parsing for webhook
export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
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
        const event = constructWebhookEvent(body, signature, webhookSecret);

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
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdate(supabase, subscription);
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

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Webhook error:", error);
        return NextResponse.json(
            { error: "Webhook handler failed" },
            { status: 500 }
        );
    }
}

// Replay ordering, concurrency serialization, and email deduplication remain unresolved.
// A retry after a successful write can still send duplicate emails.
function referenceId(reference: string | { id: string } | null | undefined) {
    return typeof reference === "string" ? reference : reference?.id;
}

function subscriptionStatus(status: Stripe.Subscription.Status) {
    // Only active/trialing grant access in get_user_tier and lib/usage-tracking.ts.
    switch (status) {
        case "active":
        case "trialing":
        case "past_due":
            return status;
        case "canceled":
        case "unpaid":
        case "incomplete":
        case "incomplete_expired":
        case "paused":
        default:
            return "canceled";
    }
}

// Handle checkout completion
async function handleCheckoutComplete(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    session: Stripe.Checkout.Session
) {
    const clerkUserId = session.metadata?.clerk_user_id;
    if (session.mode !== "subscription") return;
    const customerId = referenceId(session.customer);
    const subscriptionId = referenceId(session.subscription);
    if (!clerkUserId || !customerId || !subscriptionId || !stripe) {
        throw new Error("Missing checkout ownership identifiers");
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customer = await stripe.customers.retrieve(customerId);
    if (subscription.id !== subscriptionId ||
        referenceId(subscription.customer) !== customerId ||
        subscription.metadata.clerk_user_id !== clerkUserId ||
        customer.deleted || customer.id !== customerId ||
        customer.metadata.clerk_user_id !== clerkUserId) {
        throw new Error("Checkout ownership mismatch");
    }
    await handleSubscriptionUpdate(supabase, subscription);

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

// Handle subscription updates
async function handleSubscriptionUpdate(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    subscription: Stripe.Subscription
) {
    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) {
        console.error("No clerk_user_id in subscription metadata");
        return;
    }

    const priceId = subscription.items.data[0]?.price.id || "";
    const tier = priceId ? getTierFromPriceId(priceId) : "free";

    // Cast to extended type for period properties
    const sub = subscription as SubscriptionWithPeriods;

    if (subscription.status === "canceled") {
        await handleSubscriptionDeleted(supabase, subscription);
        return;
    }
    const status = subscriptionStatus(subscription.status);
    const customerId = referenceId(subscription.customer);
    if (!customerId) throw new Error("Missing subscription customer");
    const item = subscription.items.data[0];
    const periodStart = item?.current_period_start ?? sub.current_period_start;
    const periodEnd = item?.current_period_end ?? sub.current_period_end;

    const { error } = await supabase.from("subscriptions").upsert(
        {
            clerk_user_id: clerkUserId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            tier,
            status,
            billing_cycle: subscription.items.data[0]?.price.recurring?.interval === "year"
                ? "yearly"
                : "monthly",
            current_period_start: periodStart != null
                ? new Date(periodStart * 1000).toISOString()
                : null,
            current_period_end: periodEnd != null
                ? new Date(periodEnd * 1000).toISOString()
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

    if (error) throw error;
    console.log(`Subscription updated for user ${clerkUserId}: ${tier} (${status})`);

    // Invalidate user tier cache so changes take effect immediately
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    // Send upgrade email if moving to a paid tier
    if (tier !== "free" && status === "active") {
        await sendSubscriptionEmail(supabase, clerkUserId, "upgrade", tier);
    }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    subscription: Stripe.Subscription
) {
    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) {
        console.error("No clerk_user_id in subscription metadata");
        return;
    }

    const customerId = referenceId(subscription.customer);
    if (!customerId) throw new Error("Missing subscription customer");
    // Never insert a deleted subscription or overwrite its replacement.
    const { data, error } = await supabase.from("subscriptions").update(
        {
            tier: "free",
            status: "canceled",
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
        }
    ).eq("clerk_user_id", clerkUserId)
        .eq("stripe_subscription_id", subscription.id)
        .eq("stripe_customer_id", customerId)
        .select("clerk_user_id");
    if (error) throw error;
    if (!data?.length) return;

    console.log(`Subscription deleted for user ${clerkUserId}`);

    // Invalidate user tier cache so changes take effect immediately
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    // Send cancellation email
    await sendSubscriptionEmail(supabase, clerkUserId, "cancelled");
}

// Handle successful payment
async function handlePaymentSucceeded(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    invoice: Stripe.Invoice
) {
    const inv = invoice as InvoiceWithSubscription;
    const subscriptionId = referenceId(inv.parent?.subscription_details?.subscription ?? inv.subscription);
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) return;

    const customerId = referenceId(subscription.customer);
    if (!customerId || referenceId(invoice.customer) !== customerId || subscription.id !== subscriptionId) {
        throw new Error("Invoice ownership mismatch");
    }
    const { data, error } = await supabase.from("subscriptions").update({
        status: subscriptionStatus(subscription.status),
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId)
        .eq("stripe_subscription_id", subscriptionId)
        .eq("stripe_customer_id", customerId)
        .select("clerk_user_id");
    if (error) throw error;
    if (!data?.length) return;

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
    const subscriptionId = referenceId(inv.parent?.subscription_details?.subscription ?? inv.subscription);
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) return;

    const customerId = referenceId(subscription.customer);
    if (!customerId || referenceId(invoice.customer) !== customerId || subscription.id !== subscriptionId) {
        throw new Error("Invoice ownership mismatch");
    }
    const { data, error } = await supabase.from("subscriptions").update({
        status: subscriptionStatus(subscription.status),
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId)
        .eq("stripe_subscription_id", subscriptionId)
        .eq("stripe_customer_id", customerId)
        .select("clerk_user_id");
    if (error) throw error;
    if (!data?.length) return;

    // Invalidate user tier cache
    invalidateUserCache(clerkUserId, "user-tier");
    invalidateUserCache(clerkUserId, "subscription");

    console.log(`Payment failed for user ${clerkUserId}`);

    // Send payment failed email
    if (subscription.status === "past_due" || subscription.status === "unpaid") {
        await sendSubscriptionEmail(supabase, clerkUserId, "payment_failed");
    }
}

// Helper function to send subscription emails
async function sendSubscriptionEmail(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    clerkUserId: string,
    eventType: "upgrade" | "downgrade" | "cancelled" | "renewed" | "trial_ending" | "payment_failed",
    tier?: string
) {
    if (!resend) {
        console.log("Resend not configured, skipping email");
        return;
    }

    try {
        // Optional email data must not prevent acknowledgment of a persisted payment.
        const { data: user, error } = await supabase
            .from("users")
            .select("email, username, email_preferences")
            .eq("clerk_id", clerkUserId)
            .maybeSingle();
        if (error) throw error;

        if (!user?.email) {
            return;
        }

        const emailPrefs = user.email_preferences as Record<string, boolean> | null;
        if (emailPrefs?.product_updates !== true) {
            return;
        }

        const manageUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
            : "https://localley.io/settings";

        const tierName = tier === "pro" ? "Pro" : tier === "premium" ? "Premium" : "Free";

        const { error: sendError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: getSubscriptionEmailSubject(eventType, tierName),
            react: SubscriptionEmail({
                userName: user.username || undefined,
                eventType,
                newTier: tierName,
                manageUrl,
            }),
        });
        if (sendError) throw sendError;

        console.log("Subscription email sent");
    } catch {
        console.error("Optional subscription email failed");
    }
}

function getSubscriptionEmailSubject(
    eventType: string,
    tier: string
): string {
    switch (eventType) {
        case "upgrade":
            return `Welcome to ${tier}! 🎉`;
        case "downgrade":
            return "Your plan has been changed";
        case "cancelled":
            return "We're sad to see you go 😢";
        case "renewed":
            return "Your subscription has been renewed ✨";
        case "trial_ending":
            return "Your trial ends soon ⏰";
        case "payment_failed":
            return "Payment failed - Action required";
        default:
            return "Subscription update";
    }
}
