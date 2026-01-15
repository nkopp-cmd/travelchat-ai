"use client";

import { createContext, useContext, ReactNode } from "react";
import { useSubscription, SubscriptionStatus, getCurrentUsage } from "@/hooks/use-subscription";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";

interface SubscriptionContextValue {
    subscription: SubscriptionStatus | null;
    isLoading: boolean;
    error: Error | null;
    tier: SubscriptionTier;
    isActive: boolean;
    isPro: boolean;
    isPremium: boolean;
    isFree: boolean;
    canUseFeature: (feature: keyof typeof TIER_CONFIGS.free.features) => boolean;
    isWithinLimit: (limitType: keyof typeof TIER_CONFIGS.free.limits) => boolean;
    getRemainingUsage: (limitType: keyof typeof TIER_CONFIGS.free.limits) => number;
    refetch: () => Promise<void>;
    openCheckout: (tier: "pro" | "premium", billingCycle?: "monthly" | "yearly") => Promise<void>;
    openBillingPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const subscriptionData = useSubscription();

    const getRemainingUsage = (limitType: keyof typeof TIER_CONFIGS.free.limits): number => {
        if (!subscriptionData.subscription) return 0;
        const limit = TIER_CONFIGS[subscriptionData.tier].limits[limitType];
        const usage = getCurrentUsage(subscriptionData.subscription.usage, limitType);
        return Math.max(0, limit - usage);
    };

    const value: SubscriptionContextValue = {
        ...subscriptionData,
        isFree: subscriptionData.tier === "free",
        getRemainingUsage,
    };

    return (
        <SubscriptionContext.Provider value={value}>
            {children}
        </SubscriptionContext.Provider>
    );
}

export function useSubscriptionContext() {
    const context = useContext(SubscriptionContext);
    if (!context) {
        throw new Error("useSubscriptionContext must be used within a SubscriptionProvider");
    }
    return context;
}

// Optional hook that doesn't throw - useful for components that may be outside provider
export function useSubscriptionOptional() {
    return useContext(SubscriptionContext);
}
