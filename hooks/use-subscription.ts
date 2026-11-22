"use client";

import { useCallback, useMemo } from "react";
import { useUser } from "@/lib/auth/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SubscriptionTier, TIER_CONFIGS, hasFeature, isWithinLimit } from "@/lib/subscription";
import { queryKeys } from "@/hooks/query-keys";
import type { FunnelSource } from "@/lib/funnel-analytics";
import type { CheckoutReturnTo } from "@/lib/checkout-source";
import { fetchSubscriptionStatus, requestBillingPortal, requestCheckout, type SubscriptionStatus } from "@/lib/subscription-actions";

export type { SubscriptionStatus };

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
    hasBillingPortal: boolean;
    canUseFeature: (feature: keyof typeof TIER_CONFIGS.free.features) => boolean;
    isWithinLimit: (limitType: keyof typeof TIER_CONFIGS.free.limits) => boolean;
    refetch: () => Promise<void>;
    openCheckout: (tier: "pro" | "premium", billingCycle?: "monthly" | "yearly", source?: FunnelSource, returnTo?: CheckoutReturnTo) => Promise<void>;
    openBillingPortal: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
    const { isLoaded, isSignedIn } = useUser();

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
        enabled: isLoaded && isSignedIn,
    });

    // Checkout mutation
    const checkoutMutation = useMutation({
        mutationFn: async ({
            tier,
            billingCycle,
            source,
            returnTo,
        }: {
            tier: "pro" | "premium";
            billingCycle: "monthly" | "yearly";
            source: FunnelSource;
            returnTo?: CheckoutReturnTo;
        }) => {
            // The one checkout_start for every Stripe checkout opened through this hook (Push BW1 fix: callers pass the source).
            return requestCheckout({ tier, billingCycle, source, returnTo });
        },
    });

    // Portal mutation
    const portalMutation = useMutation({
        // requestCheckout / requestBillingPortal open the returned Stripe URL themselves.
        mutationFn: requestBillingPortal,
    });

    // Derived values - memoized to prevent recalculation
    const derivedValues = useMemo(() => {
        const tier = subscription?.tier || "free";
        return {
            tier,
            isActive: subscription?.isActive || false,
            hasBillingPortal: subscription?.hasBillingPortal || false,
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
        if (!isSignedIn) return;
        await queryRefetch();
    }, [isSignedIn, queryRefetch]);

    const openCheckout = useCallback(
        async (checkoutTier: "pro" | "premium", billingCycle: "monthly" | "yearly" = "monthly", source: FunnelSource = "pricing", returnTo?: CheckoutReturnTo) => {
            await checkoutMutation.mutateAsync({ tier: checkoutTier, billingCycle, source, returnTo });
        },
        [checkoutMutation]
    );

    const openBillingPortal = useCallback(async () => {
        await portalMutation.mutateAsync();
    }, [portalMutation]);

    return {
        subscription: subscription ?? null,
        isLoading: !isLoaded || (isSignedIn && isLoading),
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
