// Subscription requests without React Query (Push CH2): /pricing calls them through a small hook so the
// public page does not download a QueryClient; useSubscription wraps the same functions in mutations.
import type { SubscriptionTier } from "@/lib/subscription";
import { trackFunnelStep, type FunnelSource } from "@/lib/funnel-analytics";
import { isCheckoutReturnTo, isCheckoutSource, type CheckoutReturnTo } from "@/lib/checkout-source";

export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        const error = await response.json().catch(() => null);
        if (error && typeof error === "object") {
            if (
                "error" in error &&
                error.error &&
                typeof error.error === "object" &&
                "message" in error.error &&
                typeof error.error.message === "string"
            ) {
                return error.error.message;
            }

            if ("error" in error && typeof error.error === "string") {
                return error.error;
            }

            if ("message" in error && typeof error.message === "string") {
                return error.message;
            }
        }
    }

    const text = await response.text().catch(() => "");
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        return fallback;
    }

    return text || fallback;
}

export interface SubscriptionStatus {
    tier: SubscriptionTier;
    status: string;
    isActive: boolean;
    hasBillingPortal: boolean;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    limits: {
        itinerariesPerMonth: number;
        chatMessagesPerDay: number;
        storiesPerWeek: number;
        aiImagesPerMonth: number;
        savedSpotsLimit: number;
    };
    usage: {
        itinerariesThisMonth: number;
        chatMessagesToday: number;
        storiesThisWeek: number;
        aiImagesThisMonth: number;
        savedSpots: number;
    };
    // Early adopter / beta info
    isBetaMode?: boolean;
    isEarlyAdopter?: boolean;
    earlyAdopterPosition?: number;
    earlyAdopterSlotsRemaining?: number;
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
    const response = await fetch("/api/subscription/status");

    if (!response.ok) {
        throw new Error("Failed to fetch subscription");
    }

    return response.json();
}

export interface CheckoutRequest {
    tier: "pro" | "premium";
    billingCycle: "monthly" | "yearly";
    source: FunnelSource;
    returnTo?: CheckoutReturnTo;
}

/** Counts checkout_start once, creates the Stripe checkout session and opens it. */
export async function requestCheckout({ tier, billingCycle, source, returnTo }: CheckoutRequest): Promise<{ url?: string }> {
    trackFunnelStep("checkout_start", source);
    const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Push BX2: the start page goes to Stripe metadata, so checkout_paid is counted per source.
        // Only sources the server accepts are sent; any other value would be rejected with 400.
        body: JSON.stringify({
            tier, billingCycle,
            ...(isCheckoutSource(source) ? { source } : {}),
            // Push BY1: fixed return page (planner); the server maps it to its own URLs.
            ...(isCheckoutReturnTo(returnTo) ? { returnTo } : {}),
        }),
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to create checkout session"));
    }

    const data = await response.json();
    if (data?.url) window.location.href = data.url;
    return data;
}

/** Opens the Stripe billing portal. */
export async function requestBillingPortal(): Promise<{ url?: string }> {
    const response = await fetch("/api/subscription/portal", { method: "POST" });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to open billing portal"));
    }

    const data = await response.json();
    if (data?.url) window.location.href = data.url;
    return data;
}
