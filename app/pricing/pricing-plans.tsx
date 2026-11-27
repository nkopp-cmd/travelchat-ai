"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/client";
import { Check, Crown, Loader2, Sparkles, Zap } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePricingSubscription } from "@/hooks/use-pricing-subscription";
import { useToast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { checkoutSignUpUrl, formatResetDay, parseCheckoutIntent, parsePlannerLimit, withoutCheckoutParam, type PlannerLimitNotice } from "@/lib/pricing-checkout";
import { currentPagePath, signInGateHref } from "@/lib/auth/gate-href";

// Push CH2: the interactive part of /pricing (notices, billing toggle, plan cards with the Stripe buttons).
// The page around it is server HTML, and this island loads no React Query and no Radix switch.

type PaidTier = "pro" | "premium";

const PLAN_COPY = {
    pro: {
        title: "Pro",
        eyebrow: "For real trips",
        description: "Save a Seoul trip, move Gwangjang Market to another day, and export the updated route with full addresses.",
        badge: "Most useful",
        accent: "violet",
        icon: Sparkles,
        features: [
            "Unlimited itinerary generation",
            `${TIER_CONFIGS.pro.limits.chatMessagesPerDay} chat messages per day`,
            "Local-first route planning",
            "Full addresses and cleaner exports",
            "Weather-aware planning",
            "No ads",
        ],
    },
    premium: {
        title: "Premium",
        eyebrow: "For power planning",
        description: "Everything in Pro, plus shared trips for your travel group, map pins with directions and unlimited chat.",
        badge: "Full access",
        accent: "indigo",
        icon: Crown,
        features: [
            "Everything in Pro",
            "Unlimited chat and saved spots",
            "Richer maps and route context",
            "Map pins and directions",
            "Collaborative trip planning",
            "Priority support",
        ],
    },
} as const;


export function PricingPlans({ hero }: { hero: ReactNode }) {
    const [isYearly, setIsYearly] = useState(false);
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const { isSignedIn } = useAuth();
    const {
        tier: currentTier,
        isLoading,
        openCheckout,
        openBillingPortal,
        hasBillingPortal,
    } = usePricingSubscription();
    const { toast } = useToast();

    const hasPaidSubscription = currentTier === "pro" || currentTier === "premium";
    const hasIncludedAccess = hasPaidSubscription && !hasBillingPortal;

    const handleSubscribe = async (tier: PaidTier) => {
        try {
            setLoadingTier(tier);

            if (hasPaidSubscription && hasBillingPortal) {
                await openBillingPortal();
                return;
            }

            const cycle = isYearly ? "yearly" : "monthly";
            // Push BY1: opened from the planner limit, a paid checkout returns to the planner, not settings.
            await (plannerLimit ? openCheckout(tier, cycle, "pricing", "planner") : openCheckout(tier, cycle));
        } catch (error) {
            toast({
                title: "Checkout error",
                description: error instanceof Error ? error.message : "Failed to start checkout",
                variant: "destructive",
            });
        } finally {
            setLoadingTier(null);
        }
    };

    // Back from a closed Stripe checkout (?canceled=true): say once that nothing was charged, then drop the parameter.
    const [checkoutClosed, setCheckoutClosed] = useState(false);
    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get("canceled") !== "true") return;
        url.searchParams.delete("canceled");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setCheckoutClosed(true);
    }, []);

    // From the planner after the free monthly trip (?limit=itineraries): say why the visitor is here.
    const [plannerLimit, setPlannerLimit] = useState<PlannerLimitNotice | null>(null);
    useEffect(() => {
        setPlannerLimit(parsePlannerLimit(window.location.search));
    }, []);

    // Back from sign-up with ?checkout=<tier>-<cycle>: start Stripe once, then drop the parameter.
    const autoCheckoutStarted = useRef(false);
    useEffect(() => {
        if (!isSignedIn || isLoading || autoCheckoutStarted.current) return;
        const intent = parseCheckoutIntent(window.location.search);
        if (!intent) return;
        autoCheckoutStarted.current = true;
        window.history.replaceState(null, "", withoutCheckoutParam(window.location.href));
        if (hasPaidSubscription) return;
        setIsYearly(intent.cycle === "yearly");
        setLoadingTier(intent.tier);
        openCheckout(intent.tier, intent.cycle)
            .catch((error) => toast({
                title: "Checkout error",
                description: error instanceof Error ? error.message : "Failed to start checkout",
                variant: "destructive",
            }))
            .finally(() => setLoadingTier(null));
    }, [isSignedIn, isLoading, hasPaidSubscription, openCheckout, toast]);

    const handleManageSubscription = async () => {
        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Sign in to manage billing.",
                variant: "destructive",
            });
            window.location.href = signInGateHref(currentPagePath());
            return;
        }

        try {
            setLoadingTier("manage");
            await openBillingPortal();
        } catch (error) {
            toast({
                title: "Billing error",
                description: error instanceof Error ? error.message : "Failed to open billing portal",
                variant: "destructive",
            });
        } finally {
            setLoadingTier(null);
        }
    };

    return (
        <>
                    {plannerLimit && (
                        <div role="status" data-testid="pricing-planner-limit" className="mt-4 rounded-lg bg-raised px-4 py-3 text-sm text-foreground">
                            <p>
                                You have used your free trip for this month.{" "}
                                {plannerLimit.resets ? `Your next free trip opens on ${formatResetDay(plannerLimit.resets)}. ` : ""}
                                Pro plans unlimited trips and saves them to your account.
                            </p>
                        </div>
                    )}
                    {checkoutClosed && (
                        <div role="status" data-testid="pricing-checkout-closed" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-raised px-4 py-3 text-sm text-foreground">
                            <p>Checkout closed. You were not charged. Pick a plan below when you are ready.</p>
                            <Link href="/itineraries/new" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">Plan a free trip</Link>
                        </div>
                    )}
                    <section className="grid gap-6 py-8 md:grid-cols-[1fr_320px] md:items-end lg:py-12">
                        <div>{hero}</div>

                        <div className="rounded-lg bg-raised p-4">
                            <div className="mb-4 flex items-center gap-3">
                                <Zap className="h-5 w-5 text-primary" />
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">Billing cycle</h2>
                                    <p className="text-sm text-muted-foreground">Annual billing lowers the monthly equivalent.</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-black/25 p-3">
                                {/* Push BU3: each word sets its own cycle (a label for the switch only toggled it). */}
                                <button
                                    type="button"
                                    onClick={() => setIsYearly(false)}
                                    aria-pressed={!isYearly}
                                    className={cn("min-h-11 rounded-md px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300", !isYearly ? "font-semibold text-foreground" : "text-muted-foreground")}
                                >
                                    Monthly
                                </button>
                                {/* Push CH2: a native switch (no Radix bundle); same name and keyboard behavior. */}
                                <button
                                    type="button"
                                    role="switch"
                                    id="billing-toggle"
                                    aria-checked={isYearly}
                                    aria-label="Toggle yearly billing"
                                    onClick={() => setIsYearly((value) => !value)}
                                    className={cn(
                                        "inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                        isYearly ? "bg-primary" : "bg-input dark:bg-input/80"
                                    )}
                                >
                                    <span className={cn("pointer-events-none block size-4 rounded-full ring-0 transition-transform", isYearly ? "translate-x-[calc(100%-2px)] bg-background dark:bg-primary-foreground" : "translate-x-0 bg-background dark:bg-foreground")} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsYearly(true)}
                                    aria-pressed={isYearly}
                                    className={cn("min-h-11 rounded-md px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300", isYearly ? "font-semibold text-foreground" : "text-muted-foreground")}
                                >
                                    Yearly
                                </button>
                            </div>
                            <p className="mt-3 text-sm text-foreground">Yearly plans save up to 30%.</p>
                        </div>
                    </section>

                    <section className="grid gap-4 md:grid-cols-2">
                        {(["pro", "premium"] as PaidTier[]).map((tier) => {
                            const { price, yearlyPrice } = TIER_CONFIGS[tier];
                            const monthlyEquivalent = (Math.ceil(yearlyPrice * 100 / 12) / 100).toFixed(2);
                            const isCurrent = currentTier === tier;
                            const plan = PLAN_COPY[tier];

                            return (
                                <PlanCard
                                    key={tier}
                                    tier={tier}
                                    title={plan.title}
                                    eyebrow={plan.eyebrow}
                                    description={plan.description}
                                    badge={isCurrent ? "Current plan" : plan.badge}
                                    icon={plan.icon}
                                    accent={plan.accent}
                                    price={`$${isYearly ? monthlyEquivalent : price}`}
                                    billingLabel="/month"
                                    annualNote={
                                        isYearly
                                            ? `Billed $${yearlyPrice} per year`
                                            : "Billed monthly, cancel anytime"
                                    }
                                    features={plan.features}
                                    footer={
                                        isCurrent && hasBillingPortal ? (
                                            <Button
                                                className="h-12 w-full rounded-lg"
                                                variant="outline"
                                                onClick={handleManageSubscription}
                                                disabled={loadingTier === "manage"}
                                            >
                                                {loadingTier === "manage" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : null}
                                                Manage subscription
                                            </Button>
                                        ) : isCurrent ? (
                                            <Button className="h-12 w-full rounded-lg" variant="outline" disabled>
                                                {hasIncludedAccess ? "Included access" : "Current plan"}
                                            </Button>
                                        ) : !isSignedIn ? (
                                            // Push BU1: signed out (or the session check still running) -> a real link in the edge
                                            // HTML, tappable before hydration. Sign-up returns to /pricing?checkout -> Stripe, and
                                            // sends an already signed-in visitor straight on.
                                            <Button asChild className="h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90">
                                                <a href={checkoutSignUpUrl(tier, isYearly ? "yearly" : "monthly")} data-testid={`pricing-subscribe-${tier}`}>
                                                    {`Subscribe to ${plan.title}`}
                                                </a>
                                            </Button>
                                        ) : (
                                            <Button
                                                className={cn(
                                                    "h-12 w-full rounded-lg text-base font-semibold",
                                                    tier === "pro"
                                                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                                                )}
                                                onClick={() => handleSubscribe(tier)}
                                                disabled={
                                                    isLoading ||
                                                    loadingTier !== null ||
                                                    (hasPaidSubscription && !hasBillingPortal)
                                                }
                                            >
                                                {loadingTier === tier ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                                {hasPaidSubscription && hasBillingPortal ? "Open billing portal" : `Subscribe to ${plan.title}`}
                                            </Button>
                                        )
                                    }
                                />
                            );
                        })}
                    </section>
        </>
    );
}

function PlanCard({
    tier,
    title,
    eyebrow,
    description,
    badge,
    icon: Icon,
    accent,
    price,
    billingLabel,
    annualNote,
    features,
    footer,
}: {
    tier: PaidTier;
    title: string;
    eyebrow: string;
    description: string;
    badge: string;
    icon: typeof Sparkles;
    accent: "violet" | "indigo";
    price: string;
    billingLabel: string;
    annualNote: string;
    features: readonly string[];
    footer: React.ReactNode;
}) {
    const isPremium = tier === "premium";

    return (
        <article
            className={cn(
                "relative flex min-h-full flex-col rounded-lg bg-raised p-5 shadow-2xl backdrop-blur-xl",
                isPremium ? "" : ""
            )}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg text-foreground", isPremium ? "bg-primary" : "bg-primary")}>
                    <Icon className="h-5 w-5" />
                </div>
                <Badge
                    className={cn(
                        "rounded-md px-2.5 py-1",
                        isPremium ? "bg-primary/15 text-foreground" : "bg-primary/15 text-foreground"
                    )}
                >
                    {badge}
                </Badge>
            </div>

            <p className={cn("text-sm font-semibold", accent === "indigo" ? "text-foreground" : "text-foreground")}>
                {eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2 min-h-[72px] text-sm leading-6 text-muted-foreground">{description}</p>

            <div className="my-6 rounded-lg bg-black/25 p-4">
                <div className="flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-normal text-foreground">{price}</span>
                    <span className="pb-1 text-base text-muted-foreground">{billingLabel}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{annualNote}</p>
            </div>

            <ul className="mb-6 flex-1 space-y-3">
                {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", isPremium ? "text-primary" : "text-primary")} />
                        <span>{feature}</span>
                    </li>
                ))}
            </ul>

            <div className="mt-auto">{footer}</div>
        </article>
    );
}
