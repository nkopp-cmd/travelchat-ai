import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase";
import { stripe, getTierFromPriceId, constructWebhookEvent } from "@/lib/stripe";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { SubscriptionEmail } from "@/emails/subscription-email";

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

            case "invoice.payment_succeeded": {
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
    await supabase.from("subscriptions").upsert(
        {
            clerk_user_id: clerkUserId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: "active",
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: "clerk_user_id",
        }
    );

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
    const tier = getTierFromPriceId(priceId);

    // Cast to extended type for period properties
    const sub = subscription as SubscriptionWithPeriods;

    // Map Stripe status to our status
    let status: string;
    switch (subscription.status) {
        case "active":
            status = "active";
            break;
        case "trialing":
            status = "trialing";
            break;
        case "past_due":
            status = "past_due";
            break;
        case "canceled":
        case "unpaid":
            status = "canceled";
            break;
        default:
            status = subscription.status;
    }

    await supabase.from("subscriptions").upsert(
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

    console.log(`Subscription updated for user ${clerkUserId}: ${tier} (${status})`);

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

    // Downgrade to free tier
    await supabase.from("subscriptions").upsert(
        {
            clerk_user_id: clerkUserId,
            tier: "free",
            status: "canceled",
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: "clerk_user_id",
        }
    );

    console.log(`Subscription deleted for user ${clerkUserId}`);

    // Send cancellation email
    await sendSubscriptionEmail(supabase, clerkUserId, "cancelled");
}

// Handle successful payment
async function handlePaymentSucceeded(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    invoice: Stripe.Invoice
) {
    const inv = invoice as InvoiceWithSubscription;
    const subscriptionId = typeof inv.subscription === "string"
        ? inv.subscription
        : inv.subscription?.id;
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) return;

    // Update status to active
    await supabase.from("subscriptions").update({
        status: "active",
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId);

    console.log(`Payment succeeded for user ${clerkUserId}`);
}

// Handle failed payment
async function handlePaymentFailed(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    invoice: Stripe.Invoice
) {
    const inv = invoice as InvoiceWithSubscription;
    const subscriptionId = typeof inv.subscription === "string"
        ? inv.subscription
        : inv.subscription?.id;
    if (!subscriptionId) return;

    // Get the subscription to find the user
    const subscription = await stripe?.subscriptions.retrieve(subscriptionId);
    if (!subscription) return;

    const clerkUserId = subscription.metadata?.clerk_user_id;
    if (!clerkUserId) return;

    // Update status to past_due
    await supabase.from("subscriptions").update({
        status: "past_due",
        updated_at: new Date().toISOString(),
    }).eq("clerk_user_id", clerkUserId);

    console.log(`Payment failed for user ${clerkUserId}`);

    // Send payment failed email
    await sendSubscriptionEmail(supabase, clerkUserId, "payment_failed");
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
        // Get user email from database
        const { data: user } = await supabase
            .from("users")
            .select("email, name")
            .eq("clerk_id", clerkUserId)
            .single();

        if (!user?.email) {
            console.error("No email found for user:", clerkUserId);
            return;
        }

        // Check email preferences
        const { data: preferences } = await supabase
            .from("users")
            .select("email_preferences")
            .eq("clerk_id", clerkUserId)
            .single();

        const emailPrefs = preferences?.email_preferences as Record<string, boolean> | null;
        if (emailPrefs && emailPrefs.product_updates === false) {
            console.log("User has disabled product update emails");
            return;
        }

        const manageUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
            : "https://localley.app/settings";

        const tierName = tier === "pro" ? "Pro" : tier === "premium" ? "Premium" : "Free";

        await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: getSubscriptionEmailSubject(eventType, tierName),
            react: SubscriptionEmail({
                userName: user.name || undefined,
                eventType,
                newTier: tierName,
                manageUrl,
            }),
        });

        console.log(`Subscription email (${eventType}) sent to ${user.email}`);
    } catch (error) {
        console.error("Error sending subscription email:", error);
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
