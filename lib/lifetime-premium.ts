const LIFETIME_PREMIUM_EMAILS = [
    "nkopp@my-goodlife.com",
    "hello@localley.io",
] as const;

export const LIFETIME_PREMIUM_EMAIL_ALLOWLIST = new Set(
    LIFETIME_PREMIUM_EMAILS.map((email) => email.toLowerCase())
);

export function isLifetimePremiumEmail(email?: string | null): boolean {
    if (!email) {
        return false;
    }

    return LIFETIME_PREMIUM_EMAIL_ALLOWLIST.has(email.toLowerCase());
}


/**
 * The plan to show for a stored subscription row. Lifetime accounts have no paid row, so pages that read
 * the subscriptions table directly showed "Choose a paid plan" while /api/subscription/status said premium.
 */
export function withLifetimePremium<T extends { tier: string; status: string }>(
    subscription: T,
    email?: string | null,
): T {
    if (!isLifetimePremiumEmail(email)) return subscription;
    return { ...subscription, tier: "premium", status: "lifetime_premium" };
}

export function isActivePlanStatus(status: string): boolean {
    return ["active", "trialing", "lifetime_premium"].includes(status);
}
