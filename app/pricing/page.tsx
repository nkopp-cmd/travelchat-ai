"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/client";
import {
    ArrowLeft,
    Check,
    Crown,
    Loader2,
    Map,
    ShieldCheck,
    Sparkles,
    Zap,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AppBackground } from "@/components/layout/app-background";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { checkoutSignUpUrl, formatResetDay, parseCheckoutIntent, parsePlannerLimit, withoutCheckoutParam, type PlannerLimitNotice } from "@/lib/pricing-checkout";
import { currentPagePath, signInGateHref } from "@/lib/auth/gate-href";
import { FREE_ACCOUNT_SUBTITLE } from "@/lib/auth/auth-copy";

type PaidTier = "pro" | "premium";

const PLAN_COPY = {
    pro: {
        title: "Pro",
        eyebrow: "For real trips",
        description: "Unlimited day plans around spots locals rate, with full addresses for the taxi and exports.",
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

export default function PricingPage() {
    const [isYearly, setIsYearly] = useState(false);
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const { isSignedIn } = useAuth();
    const {
        tier: currentTier,
        isLoading,
        openCheckout,
        openBillingPortal,
        hasBillingPortal,
    } = useSubscription();
    const { toast } = useToast();

    const hasPaidSubscription = currentTier === "pro" || currentTier === "premium";
    const hasIncludedAccess = hasPaidSubscription && !hasBillingPortal;

    const priceFor = (tier: PaidTier) => {
        const config = TIER_CONFIGS[tier];
        return {
            monthly: isYearly ? Math.round(config.yearlyPrice / 12) : config.price,
            total: isYearly ? config.yearlyPrice : config.price,
        };
    };

    const handleSubscribe = async (tier: PaidTier) => {
        try {
            setLoadingTier(tier);

            if (hasPaidSubscription && hasBillingPortal) {
                await openBillingPortal();
                return;
            }

            await openCheckout(tier, isYearly ? "yearly" : "monthly");
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
        <AppBackground ambient className="min-h-screen bg-surface" contentClassName="min-h-screen">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <Link
                        href="/"
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                    <Badge className="rounded-md bg-primary/10 px-3 py-1.5 text-foreground">
                        First plan free
                    </Badge>
                </header>

                <div className="flex flex-1 flex-col">
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
                        <div>
                            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-muted-foreground">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                Secure subscription through Stripe
                            </div>
                            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
                                Your local friend is free. Pro plans the whole trip.
                            </h1>
                            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Phrases, menus, paying and taxi help cost nothing. Your first trip plan is free too, no account needed. Pro plans every day around the spots locals rate, with full addresses and exports.
                            </p>
                            <Button asChild className="mt-6 min-h-12 px-5 font-semibold">
                                <Link href="/itineraries/new" data-testid="pricing-free-plan">Plan a free trip</Link>
                            </Button>
                            {/* Push BG3: the same free-account offer as /sign-up, built from TIER_CONFIGS.free.limits. */}
                            <p className="mt-3 text-sm text-muted-foreground" data-testid="pricing-free-account">{FREE_ACCOUNT_SUBTITLE}</p>
                        </div>

                        <div className="rounded-lg bg-raised p-4">
                            <div className="mb-4 flex items-center gap-3">
                                <Zap className="h-5 w-5 text-primary" />
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">Billing cycle</h2>
                                    <p className="text-sm text-muted-foreground">Annual billing lowers the monthly equivalent.</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-black/25 p-3">
                                <Label
                                    htmlFor="billing-toggle"
                                    className={cn("text-sm", !isYearly ? "font-semibold text-foreground" : "text-muted-foreground")}
                                >
                                    Monthly
                                </Label>
                                <Switch
                                    id="billing-toggle"
                                    checked={isYearly}
                                    onCheckedChange={setIsYearly}
                                    aria-label="Toggle yearly billing"
                                />
                                <Label
                                    htmlFor="billing-toggle"
                                    className={cn("text-sm", isYearly ? "font-semibold text-foreground" : "text-muted-foreground")}
                                >
                                    Yearly
                                </Label>
                            </div>
                            <p className="mt-3 text-sm text-foreground">Yearly plans save up to 30%.</p>
                        </div>
                    </section>

                    <section className="grid gap-4 md:grid-cols-2">
                        {(["pro", "premium"] as PaidTier[]).map((tier) => {
                            const prices = priceFor(tier);
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
                                    price={`$${prices.monthly}`}
                                    billingLabel="/month"
                                    annualNote={
                                        isYearly
                                            ? `Billed $${prices.total} annually`
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

                    <section className="grid gap-4 py-8 md:grid-cols-3">
                        <ProofBlock
                            icon={Map}
                            title="Spots locals rate"
                            text="Plans use the restaurants, cafes, markets and neighborhoods you would normally only hear about after you land."
                        />
                        <ProofBlock
                            icon={Sparkles}
                            title="Addresses a driver can read"
                            text="Pro shows the full address of every stop. Each spot card shows it in the local script, so a taxi takes you to the door."
                        />
                        <ProofBlock
                            icon={ShieldCheck}
                            title="Cancel anytime"
                            text="Pay securely through Stripe. Change or cancel your plan yourself in the billing portal."
                        />
                    </section>

                    <section className="mb-4 rounded-lg bg-raised p-5">
                        <h2 className="text-xl font-semibold text-foreground">Billing notes</h2>
                        <div className="mt-4 grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-2">
                            <p>Subscriptions can be changed or cancelled through Stripe Billing Portal.</p>
                            <p>Refund requests are handled within 14 days of the first payment when the product is not a fit.</p>
                        </div>
                    </section>

                    {/* Push BD1: a visitor who is not ready to pay can still leave an email (plain form, 0 KB JS). */}
                    <LocalleySignup source="pricing" heading="Not ready yet? Get the Localley newsletter" className="mb-4" />
                </div>
            </div>
        </AppBackground>
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

function ProofBlock({
    icon: Icon,
    title,
    text,
}: {
    icon: typeof Sparkles;
    title: string;
    text: string;
}) {
    return (
        <div className="rounded-lg bg-raised p-4">
            <Icon className="mb-3 h-5 w-5 text-cyan-200" />
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
    );
}
