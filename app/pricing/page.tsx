"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
    ArrowLeft,
    Check,
    Crown,
    Loader2,
    Map,
    ShieldCheck,
    Sparkles,
    Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AppBackground } from "@/components/layout/app-background";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { TIER_CONFIGS } from "@/lib/subscription";
import { cn } from "@/lib/utils";

type PaidTier = "pro" | "premium";

const PLAN_COPY = {
    pro: {
        title: "Pro",
        eyebrow: "For real trips",
        description: "Daily planning, local routes, full addresses, exports, and richer itinerary support.",
        badge: "Most useful",
        accent: "violet",
        icon: Sparkles,
        features: [
            "Unlimited itinerary generation",
            "100 chat messages per day",
            "Local-first route planning",
            "Full addresses and cleaner exports",
            "Weather-aware planning",
            "No ads",
        ],
    },
    premium: {
        title: "Premium",
        eyebrow: "For power planning",
        description: "The highest-capability Localley plan for heavy travelers, teams, and collaborative planning.",
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
        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Create or sign in to your account before checkout.",
                variant: "destructive",
            });
            window.location.href = "/sign-in";
            return;
        }

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

    const handleManageSubscription = async () => {
        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Sign in to manage billing.",
                variant: "destructive",
            });
            window.location.href = "/sign-in";
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
        <AppBackground ambient className="min-h-screen bg-[#0b0714]" contentClassName="min-h-screen">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <Link
                        href="/"
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-white/65 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                    <Badge className="rounded-md border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-violet-100">
                        Paid access only
                    </Badge>
                </header>

                <main className="flex flex-1 flex-col">
                    <section className="grid gap-6 py-8 md:grid-cols-[1fr_320px] md:items-end lg:py-12">
                        <div>
                            <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/75">
                                <ShieldCheck className="h-4 w-4 text-violet-300" />
                                Secure subscription through Stripe
                            </div>
                            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
                                Choose the Localley plan before you travel.
                            </h1>
                            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                                Localley is a paid travel-planning product. Pick Pro for regular trips or Premium for the full collaboration, maps, and high-capacity experience.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                            <div className="mb-4 flex items-center gap-3">
                                <Zap className="h-5 w-5 text-violet-300" />
                                <div>
                                    <h2 className="text-base font-semibold text-white">Billing cycle</h2>
                                    <p className="text-sm text-white/55">Annual billing lowers the monthly equivalent.</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 p-3">
                                <Label
                                    htmlFor="billing-toggle"
                                    className={cn("text-sm", !isYearly ? "font-semibold text-white" : "text-white/50")}
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
                                    className={cn("text-sm", isYearly ? "font-semibold text-white" : "text-white/50")}
                                >
                                    Yearly
                                </Label>
                            </div>
                            <p className="mt-3 text-sm text-violet-200">Yearly plans save up to 30%.</p>
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
                                        ) : (
                                            <Button
                                                className={cn(
                                                    "h-12 w-full rounded-lg text-base font-semibold",
                                                    tier === "pro"
                                                        ? "bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400"
                                                        : "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
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
                            title="Built around trip intent"
                            text="Plans unlock the route builder, local spot intelligence, and saved trip workflows."
                        />
                        <ProofBlock
                            icon={Sparkles}
                            title="Richer outputs"
                            text="Paid plans support better images, exports, addresses, and trip context across devices."
                        />
                        <ProofBlock
                            icon={ShieldCheck}
                            title="Simple billing"
                            text="Checkout and plan changes stay in Stripe so payment state remains clean and auditable."
                        />
                    </section>

                    <section className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] p-5">
                        <h2 className="text-xl font-semibold text-white">Billing notes</h2>
                        <div className="mt-4 grid gap-4 text-sm leading-6 text-white/65 md:grid-cols-2">
                            <p>Subscriptions can be changed or cancelled through Stripe Billing Portal.</p>
                            <p>Refund requests are handled within 14 days of the first payment when the product is not a fit.</p>
                        </div>
                    </section>
                </main>
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
                "relative flex min-h-full flex-col rounded-lg border bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl",
                isPremium ? "border-indigo-300/35 shadow-indigo-950/20" : "border-violet-300/35 shadow-violet-950/20"
            )}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg text-white", isPremium ? "bg-indigo-500" : "bg-violet-500")}>
                    <Icon className="h-5 w-5" />
                </div>
                <Badge
                    className={cn(
                        "rounded-md px-2.5 py-1",
                        isPremium ? "bg-indigo-300/15 text-indigo-100" : "bg-violet-300/15 text-violet-100"
                    )}
                >
                    {badge}
                </Badge>
            </div>

            <p className={cn("text-sm font-semibold", accent === "indigo" ? "text-indigo-200" : "text-violet-200")}>
                {eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-2 min-h-[72px] text-sm leading-6 text-white/65">{description}</p>

            <div className="my-6 rounded-lg border border-white/10 bg-black/25 p-4">
                <div className="flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-normal text-white">{price}</span>
                    <span className="pb-1 text-base text-white/55">{billingLabel}</span>
                </div>
                <p className="mt-2 text-sm text-white/55">{annualNote}</p>
            </div>

            <ul className="mb-6 flex-1 space-y-3">
                {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-white/82">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", isPremium ? "text-indigo-300" : "text-violet-300")} />
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
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <Icon className="mb-3 h-5 w-5 text-cyan-200" />
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/60">{text}</p>
        </div>
    );
}
