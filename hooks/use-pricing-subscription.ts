"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/auth/client";
import type { SubscriptionTier } from "@/lib/subscription";
import type { FunnelSource } from "@/lib/funnel-analytics";
import type { CheckoutReturnTo } from "@/lib/checkout-source";
import { fetchSubscriptionStatus, requestBillingPortal, requestCheckout, type SubscriptionStatus } from "@/lib/subscription-actions";

// Push CH2: /pricing needs only the tier, the portal flag and the two Stripe buttons. This hook reads them
// without React Query, so the public pricing page ships no QueryClient. The checkout and portal requests
// (checkout_start beacon, source, returnTo) are the same functions useSubscription runs.
export function usePricingSubscription() {
    const { isLoaded, isSignedIn } = useUser();
    // undefined until the signed-in status read settles; null when it failed (the page then treats the plan as free).
    const [read, setRead] = useState<SubscriptionStatus | null | undefined>(undefined);
    const signedIn = Boolean(isLoaded && isSignedIn);

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        fetchSubscriptionStatus()
            .then((next) => { if (active) setRead(next); })
            .catch(() => { if (active) setRead(null); });
        return () => { active = false; };
    }, [signedIn]);

    const status = signedIn ? read ?? null : null;

    const openCheckout = useCallback(
        async (tier: "pro" | "premium", billingCycle: "monthly" | "yearly" = "monthly", source: FunnelSource = "pricing", returnTo?: CheckoutReturnTo) => {
            await requestCheckout({ tier, billingCycle, source, returnTo });
        },
        []
    );

    const openBillingPortal = useCallback(async () => {
        await requestBillingPortal();
    }, []);

    const tier: SubscriptionTier = status?.tier || "free";
    return {
        tier,
        // Same contract as useSubscription: loading until auth is known, and while a signed-in status read runs.
        isLoading: !isLoaded || (signedIn && read === undefined),
        hasBillingPortal: status?.hasBillingPortal || false,
        openCheckout,
        openBillingPortal,
    };
}
