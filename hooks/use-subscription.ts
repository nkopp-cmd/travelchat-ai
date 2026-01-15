"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SubscriptionTier, TIER_CONFIGS, hasFeature, isWithinLimit } from "@/lib/subscription";
import { queryKeys } from "@/hooks/use-queries";

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
    // Early adopter / beta info
    isBetaMode?: boolean;
    isEarlyAdopter?: boolean;
    earlyAdopterPosition?: number;
    earlyAdopterSlotsRemaining?: number;
}

interface UseSubscriptionReturn {
    subscription: SubscriptionStatus | null;
    isLoading: boolean;
    error: Error | null;
    tier: SubscriptionTier;
    isActive: boolean;
    isPro: boolean;
    isPremium: boolean;
    isBetaMode: boolean;
    isEarlyAdopter: boolean;
    earlyAdopterPosition?: number;
    canUseFeature: (feature: keyof typeof TIER_CONFIGS.free.features) => boolean;
    isWithinLimit: (limitType: keyof typeof TIER_CONFIGS.free.limits) => boolean;
    refetch: () => Promise<void>;
    openCheckout: (tier: "pro" | "premium", billingCycle?: "monthly" | "yearly") => Promise<void>;
    openBillingPortal: () => Promise<void>;
}


// Default subscription for error/loading states
const DEFAULT_SUBSCRIPTION: SubscriptionStatus = {
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
};

/**
 * Fetch subscription status from API
 */
async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
    const response = await fetch("/api/subscription/status");

    if (!response.ok) {
        throw new Error("Failed to fetch subscription");
    }

    return response.json();
}

export function useSubscription(): UseSubscriptionReturn {
    // Use React Query for subscription data with caching
    // staleTime: 2 minutes - subscription rarely changes
    // This prevents re-fetching on every navigation
    const {
        data: subscription,
        isLoading,
        error,
        refetch: queryRefetch,
    } = useQuery({
        queryKey: queryKeys.subscription,
        queryFn: fetchSubscriptionStatus,
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        // Return default on error to prevent UI breaking
        placeholderData: DEFAULT_SUBSCRIPTION,
    });

    // Checkout mutation
    const checkoutMutation = useMutation({
        mutationFn: async ({
            tier,
            billingCycle,
        }: {
            tier: "pro" | "premium";
            billingCycle: "monthly" | "yearly";
        }) => {
            const response = await fetch("/api/subscription/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier, billingCycle }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to create checkout session");
            }

            return response.json();
        },
        onSuccess: (data) => {
            if (data.url) {
                window.location.href = data.url;
            }
        },
    });

    // Portal mutation
    const portalMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch("/api/subscription/portal", {
                method: "POST",
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to open billing portal");
            }

            return response.json();
        },
        onSuccess: (data) => {
            if (data.url) {
                window.location.href = data.url;
            }
        },
    });

    // Derived values - memoized to prevent recalculation
    const derivedValues = useMemo(() => {
        const tier = subscription?.tier || "free";
        return {
            tier,
            isActive: subscription?.isActive || false,
            isPro: tier === "pro" || tier === "premium",
            isPremium: tier === "premium",
            isBetaMode: subscription?.isBetaMode || false,
            isEarlyAdopter: subscription?.isEarlyAdopter || false,
            earlyAdopterPosition: subscription?.earlyAdopterPosition,
        };
    }, [subscription]);

    const canUseFeature = useCallback(
        (feature: keyof typeof TIER_CONFIGS.free.features) => {
            const value = hasFeature(derivedValues.tier, feature);
            if (typeof value === "boolean") return value;
            return value !== "placeholder" && value !== "area-only" && value !== "watermarked";
        },
        [derivedValues.tier]
    );

    const checkIsWithinLimit = useCallback(
        (limitType: keyof typeof TIER_CONFIGS.free.limits) => {
            if (!subscription) return true;
            const currentUsage = getCurrentUsage(subscription.usage, limitType);
            return isWithinLimit(derivedValues.tier, limitType, currentUsage);
        },
        [derivedValues.tier, subscription]
    );

    const refetch = useCallback(async () => {
        await queryRefetch();
    }, [queryRefetch]);

    const openCheckout = useCallback(
        async (checkoutTier: "pro" | "premium", billingCycle: "monthly" | "yearly" = "monthly") => {
            await checkoutMutation.mutateAsync({ tier: checkoutTier, billingCycle });
        },
        [checkoutMutation]
    );

    const openBillingPortal = useCallback(async () => {
        await portalMutation.mutateAsync();
    }, [portalMutation]);

    return {
        subscription: subscription ?? null,
        isLoading,
        error: error as Error | null,
        ...derivedValues,
        canUseFeature,
        isWithinLimit: checkIsWithinLimit,
        refetch,
        openCheckout,
        openBillingPortal,
    };
}

/**
 * Invalidate subscription cache - call after checkout return
 */
export function useInvalidateSubscription() {
    const queryClient = useQueryClient();

    return useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
    }, [queryClient]);
}

/**
 * Helper to map limit type to usage field.
 * Exported for use in subscription provider and other components.
 */
export function getCurrentUsage(
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
