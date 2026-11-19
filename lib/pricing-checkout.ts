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

// Planner -> /pricing when a signed-in free account used its monthly trip (push AP1, 2026-11-19).
// Before: the wizard waited for a `result.upgrade` flag that Errors.limitExceeded never sends, so the
// visitor only saw a "Limit reached" toast and stayed on the planner.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** /pricing?limit=itineraries[&resets=YYYY-MM-DD]; a missing or bad reset time is left out. */
export function plannerLimitPricingHref(resetAt?: unknown): string {
    const day = typeof resetAt === "string" ? resetAt.slice(0, 10) : "";
    const valid = DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
    return valid ? `/pricing?limit=itineraries&resets=${day}` : "/pricing?limit=itineraries";
}

export type PlannerLimitNotice = { resets: string | null };

/** Reads ?limit=itineraries[&resets=]; any other value is null. The day is shown, never trusted for access. */
export function parsePlannerLimit(search: string): PlannerLimitNotice | null {
    const params = new URLSearchParams(search);
    if (params.get("limit") !== "itineraries") return null;
    const resets = params.get("resets") ?? "";
    return { resets: DAY.test(resets) && !Number.isNaN(Date.parse(`${resets}T00:00:00Z`)) ? resets : null };
}

/** "December 1" style day for the notice (UTC, so the server day does not shift by time zone). */
export function formatResetDay(day: string): string {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
