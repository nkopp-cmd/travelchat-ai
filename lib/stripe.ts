import Stripe from "stripe";
import { SubscriptionTier } from "./subscription";

// Server-side Stripe client
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.warn("STRIPE_SECRET_KEY is not set. Payment functionality will be disabled.");
}

export const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey, {
          typescript: true,
      })
    : null;

// Price IDs from Stripe Dashboard
// You'll need to create these products/prices in Stripe and add the IDs here
export const STRIPE_PRICE_IDS = {
    pro: {
        monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
        yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "",
    },
    premium: {
        monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || "",
        yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || "",
    },
};

// Map Stripe price IDs to tiers
export function getTierFromPriceId(priceId: string): SubscriptionTier {
    if (
        priceId === STRIPE_PRICE_IDS.premium.monthly ||
        priceId === STRIPE_PRICE_IDS.premium.yearly
    ) {
        return "premium";
    }
    if (
        priceId === STRIPE_PRICE_IDS.pro.monthly ||
        priceId === STRIPE_PRICE_IDS.pro.yearly
    ) {
        return "pro";
    }
    return "free";
}

// Get price ID for a tier and billing cycle
export function getPriceId(
    tier: "pro" | "premium",
    billingCycle: "monthly" | "yearly"
): string {
    return STRIPE_PRICE_IDS[tier][billingCycle];
}

// Check if Stripe is configured
export function isStripeConfigured(): boolean {
    return !!stripeSecretKey;
}

// Create or retrieve a Stripe customer for a user
export async function getOrCreateStripeCustomer(
    clerkUserId: string,
    email: string,
    name?: string
): Promise<string | null> {
    if (!stripe) return null;

    // First, try to find existing customer by metadata
    const existingCustomers = await stripe.customers.list({
        limit: 1,
        email,
    });

    if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];
        // Update metadata if needed
        if (customer.metadata.clerk_user_id !== clerkUserId) {
            await stripe.customers.update(customer.id, {
                metadata: { clerk_user_id: clerkUserId },
            });
        }
        return customer.id;
    }

    // Create new customer
    const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
            clerk_user_id: clerkUserId,
        },
    });

    return customer.id;
}

// Create a checkout session for subscription
export async function createCheckoutSession({
    customerId,
    priceId,
    clerkUserId,
    successUrl,
    cancelUrl,
    trialDays,
}: {
    customerId: string;
    priceId: string;
    clerkUserId: string;
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
}): Promise<Stripe.Checkout.Session | null> {
    if (!stripe) return null;

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
            clerk_user_id: clerkUserId,
        },
        subscription_data: {
            metadata: {
                clerk_user_id: clerkUserId,
            },
        },
        allow_promotion_codes: true,
    };

    // Add trial if specified
    if (trialDays && trialDays > 0) {
        sessionConfig.subscription_data = {
            ...sessionConfig.subscription_data,
            trial_period_days: trialDays,
        };
    }

    return await stripe.checkout.sessions.create(sessionConfig);
}

// Create a billing portal session
export async function createBillingPortalSession(
    customerId: string,
    returnUrl: string
): Promise<Stripe.BillingPortal.Session | null> {
    if (!stripe) return null;

    return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
}

// Get subscription details
export async function getSubscription(
    subscriptionId: string
): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
        return await stripe.subscriptions.retrieve(subscriptionId);
    } catch {
        return null;
    }
}

// Cancel subscription at period end
export async function cancelSubscription(
    subscriptionId: string
): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
    });
}

// Resume a canceled subscription
export async function resumeSubscription(
    subscriptionId: string
): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
    });
}

// Verify webhook signature
export function constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
): Stripe.Event | null {
    if (!stripe) return null;

    try {
        return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return null;
    }
}

// Types for subscription status
export interface SubscriptionStatus {
    isActive: boolean;
    tier: SubscriptionTier;
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: Date | null;
}

// Parse subscription status from Stripe subscription
export function parseSubscriptionStatus(
    subscription: Stripe.Subscription | null
): SubscriptionStatus {
    if (!subscription) {
        return {
            isActive: false,
            tier: "free",
            status: "none",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            trialEnd: null,
        };
    }

    const priceId = subscription.items.data[0]?.price.id || "";
    const tier = getTierFromPriceId(priceId);

    // Cast to access properties that may vary by API version
    const sub = subscription as Stripe.Subscription & {
        current_period_end?: number;
        trial_end?: number | null;
    };

    return {
        isActive: ["active", "trialing"].includes(subscription.status),
        tier,
        status: subscription.status,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: sub.trial_end
            ? new Date(sub.trial_end * 1000)
            : null,
    };
}
