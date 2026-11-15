// /pricing -> sign-up -> back to /pricing?checkout=<tier>-<cycle> -> Stripe (revenue push L2, 2026-11-15).
export type CheckoutTier = "pro" | "premium";
export type CheckoutCycle = "monthly" | "yearly";
export type CheckoutIntent = { tier: CheckoutTier; cycle: CheckoutCycle };

const INTENT = /^(pro|premium)-(monthly|yearly)$/;

/** Sign-up URL that returns a new visitor to /pricing with the chosen plan kept. */
export function checkoutSignUpUrl(tier: CheckoutTier, cycle: CheckoutCycle): string {
    return `/sign-up?redirect_url=${encodeURIComponent(`/pricing?checkout=${tier}-${cycle}`)}`;
}

/** Reads ?checkout=<tier>-<cycle>; anything else is null (never trust the URL for a tier name). */
export function parseCheckoutIntent(search: string): CheckoutIntent | null {
    const match = INTENT.exec(new URLSearchParams(search).get("checkout") ?? "");
    return match ? { tier: match[1] as CheckoutTier, cycle: match[2] as CheckoutCycle } : null;
}

/** The URL without the checkout parameter, so a reload or Back does not start Stripe again. */
export function withoutCheckoutParam(href: string): string {
    const url = new URL(href);
    url.searchParams.delete("checkout");
    return `${url.pathname}${url.search}${url.hash}`;
}
