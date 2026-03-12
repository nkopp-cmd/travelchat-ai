import { stripe } from "./stripe";

// ============================================
// Stripe Connect — Guide/Creator Accounts
// ============================================

/**
 * Create a Stripe Express account for a guide.
 * Express accounts use Stripe-hosted onboarding (simplest setup).
 */
export async function createConnectAccount(
    clerkUserId: string,
    email: string,
    name?: string
): Promise<string | null> {
    if (!stripe) return null;

    const account = await stripe.accounts.create({
        type: "express",
        email,
        metadata: {
            clerk_user_id: clerkUserId,
        },
        business_profile: {
            name: name || undefined,
            product_description: "Local travel guide and content creator on Localley",
        },
        capabilities: {
            transfers: { requested: true },
        },
    });

    return account.id;
}

/**
 * Generate an onboarding link for a guide to complete their Stripe account setup.
 */
export async function createOnboardingLink(
    stripeAccountId: string,
    returnUrl: string,
    refreshUrl: string
): Promise<string | null> {
    if (!stripe) return null;

    const link = await stripe.accountLinks.create({
        account: stripeAccountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: "account_onboarding",
    });

    return link.url;
}

/**
 * Generate a login link to the Stripe Express dashboard for a guide.
 */
export async function createDashboardLink(
    stripeAccountId: string
): Promise<string | null> {
    if (!stripe) return null;

    const link = await stripe.accounts.createLoginLink(stripeAccountId);
    return link.url;
}

/**
 * Get the current status of a connected account.
 */
export async function getAccountStatus(stripeAccountId: string) {
    if (!stripe) return null;

    const account = await stripe.accounts.retrieve(stripeAccountId);

    return {
        id: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        email: account.email,
    };
}

/**
 * Create a transfer from the platform to a connected guide account.
 * Used for monthly revenue share payouts.
 */
export async function createTransfer(
    stripeAccountId: string,
    amountCents: number,
    description: string,
    metadata?: Record<string, string>
): Promise<{ id: string; amount: number } | null> {
    if (!stripe) return null;

    const transfer = await stripe.transfers.create({
        amount: amountCents, // Amount in cents
        currency: "usd",
        destination: stripeAccountId,
        description,
        metadata: metadata || {},
    });

    return {
        id: transfer.id,
        amount: transfer.amount,
    };
}

/**
 * Check if Stripe Connect is configured (uses same key as regular Stripe).
 */
export function isConnectConfigured(): boolean {
    return !!stripe;
}
