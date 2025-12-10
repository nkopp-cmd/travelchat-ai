"use client";

import { useState, useEffect, useCallback } from "react";
import { SubscriptionTier, TIER_CONFIGS, hasFeature, isWithinLimit } from "@/lib/subscription";

export interface SubscriptionStatus {
    tier: SubscriptionTier;
    status: string;
    isActive: boolean;
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
}

interface UseSubscriptionReturn {
    subscription: SubscriptionStatus | null;
    isLoading: boolean;
    error: Error | null;
    tier: SubscriptionTier;
    isActive: boolean;
    isPro: boolean;
    isPremium: boolean;
    canUseFeature: (feature: keyof typeof TIER_CONFIGS.free.features) => boolean;
    isWithinLimit: (limitType: keyof typeof TIER_CONFIGS.free.limits) => boolean;
    refetch: () => Promise<void>;
    openCheckout: (tier: "pro" | "premium", billingCycle?: "monthly" | "yearly") => Promise<void>;
    openBillingPortal: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSubscription = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch("/api/subscription/status");

            if (!response.ok) {
                throw new Error("Failed to fetch subscription");
            }

            const data = await response.json();
            setSubscription(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"));
            // Default to free tier on error
            setSubscription({
                tier: "free",
                status: "none",
                isActive: false,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
                trialEnd: null,
                limits: TIER_CONFIGS.free.limits,
                usage: {
                    itinerariesThisMonth: 0,
                    chatMessagesToday: 0,
                    storiesThisWeek: 0,
                    aiImagesThisMonth: 0,
                    savedSpots: 0,
                },
            });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSubscription();
    }, [fetchSubscription]);

    const tier = subscription?.tier || "free";
    const isActive = subscription?.isActive || false;
    const isPro = tier === "pro" || tier === "premium";
    const isPremium = tier === "premium";

    const canUseFeature = useCallback(
        (feature: keyof typeof TIER_CONFIGS.free.features) => {
            const value = hasFeature(tier, feature);
            // For boolean features, return the value directly
            if (typeof value === "boolean") return value;
            // For string features (like image quality), return true if not "placeholder"
            return value !== "placeholder" && value !== "area-only" && value !== "watermarked";
        },
        [tier]
    );

    const checkIsWithinLimit = useCallback(
        (limitType: keyof typeof TIER_CONFIGS.free.limits) => {
            if (!subscription) return true; // Allow if we don't have data yet
            const currentUsage = getCurrentUsage(subscription.usage, limitType);
            return isWithinLimit(tier, limitType, currentUsage);
        },
        [tier, subscription]
    );

    const openCheckout = useCallback(
        async (checkoutTier: "pro" | "premium", billingCycle: "monthly" | "yearly" = "monthly") => {
            try {
                const response = await fetch("/api/subscription/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tier: checkoutTier, billingCycle }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Failed to create checkout session");
                }

                const { url } = await response.json();
                if (url) {
                    window.location.href = url;
                }
            } catch (err) {
                console.error("Checkout error:", err);
                throw err;
            }
        },
        []
    );

    const openBillingPortal = useCallback(async () => {
        try {
            const response = await fetch("/api/subscription/portal", {
                method: "POST",
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to open billing portal");
            }

            const { url } = await response.json();
            if (url) {
                window.location.href = url;
            }
        } catch (err) {
            console.error("Portal error:", err);
            throw err;
        }
    }, []);

    return {
        subscription,
        isLoading,
        error,
        tier,
        isActive,
        isPro,
        isPremium,
        canUseFeature,
        isWithinLimit: checkIsWithinLimit,
        refetch: fetchSubscription,
        openCheckout,
        openBillingPortal,
    };
}

// Helper to map limit type to usage field
function getCurrentUsage(
    usage: SubscriptionStatus["usage"],
    limitType: keyof typeof TIER_CONFIGS.free.limits
): number {
    switch (limitType) {
        case "itinerariesPerMonth":
            return usage.itinerariesThisMonth;
        case "chatMessagesPerDay":
            return usage.chatMessagesToday;
        case "storiesPerWeek":
            return usage.storiesThisWeek;
        case "aiImagesPerMonth":
            return usage.aiImagesThisMonth;
        case "savedSpotsLimit":
            return usage.savedSpots;
        default:
            return 0;
    }
}
