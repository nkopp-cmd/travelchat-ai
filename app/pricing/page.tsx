"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, Check, Crown, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSubscription } from "@/hooks/use-subscription";
import { TIER_CONFIGS } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { AppBackground } from "@/components/layout/app-background";
import { PremiumCard } from "@/components/ui/premium-card";
import { GlassButton, PremiumButton } from "@/components/ui/premium-button";

type PaidTier = "pro" | "premium";

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

    const proPrice = isYearly ? TIER_CONFIGS.pro.yearlyPrice : TIER_CONFIGS.pro.price;
    const premiumPrice = isYearly ? TIER_CONFIGS.premium.yearlyPrice : TIER_CONFIGS.premium.price;
    const proMonthly = isYearly ? Math.round(TIER_CONFIGS.pro.yearlyPrice / 12) : TIER_CONFIGS.pro.price;
    const premiumMonthly = isYearly
        ? Math.round(TIER_CONFIGS.premium.yearlyPrice / 12)
        : TIER_CONFIGS.premium.price;

    const handleSubscribe = async (tier: PaidTier) => {
        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Please sign in before starting checkout.",
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
                title: "Error",
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
                description: "Please sign in to manage billing.",
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
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to open billing portal",
                variant: "destructive",
            });
        } finally {
            setLoadingTier(null);
        }
    };

    return (
        <AppBackground ambient grid className="min-h-screen" contentClassName="min-h-screen">
            <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
                <div className="mb-8 flex items-center justify-between">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Link>
                    <Badge className="border border-white/10 bg-white/10 px-3 py-1 text-white/80 backdrop-blur-md">
                        Secure billing via Stripe
                    </Badge>
                </div>

                <section className="mb-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <PremiumCard
                        glow
                        gradientBorder
                        className="overflow-hidden border-white/10 bg-white/[0.04] p-0"
                    >
                        <div className="relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_32%)]" />
                            <div className="relative">
                                <Badge className="mb-4 border border-violet-400/30 bg-violet-500/15 text-violet-100">
                                    Plans that fit how you travel
                                </Badge>
                                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                                    Local-first travel tools, with a cleaner path to Pro and Premium.
                                </h1>
                                <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                                    Unlock itinerary generation, AI imagery, full addresses, and collaborative planning
                                    without leaving the design language of the app behind.
                                </p>

                                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                    <HeroStat
                                        icon={Sparkles}
                                        label="7-day Pro trial"
                                        value="Start light"
                                    />
                                    <HeroStat
                                        icon={ShieldCheck}
                                        label="Stripe billing"
                                        value="Secure checkout"
                                    />
                                    <HeroStat
                                        icon={Crown}
                                        label="Flexible changes"
                                        value="Manage anytime"
                                    />
                                </div>
                            </div>
                        </div>
                    </PremiumCard>

                    <PremiumCard className="border-white/10 bg-white/[0.04] p-6">
                        <div className="flex h-full flex-col justify-between gap-6">
                            <div>
                                <div className="mb-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                                    Billing cadence
                                </div>
                                <h2 className="text-2xl font-semibold text-white">Choose monthly or yearly</h2>
                                <p className="mt-2 text-sm leading-6 text-white/65">
                                    Yearly billing keeps the same feature set but lowers the effective monthly cost.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-white">Billing cycle</p>
                                        <p className="text-xs text-white/55">
                                            Switch plans or return to monthly anytime in Stripe Billing Portal.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Label
                                            htmlFor="billing-toggle"
                                            className={!isYearly ? "font-semibold text-white" : "text-white/55"}
                                        >
                                            Monthly
                                        </Label>
                                        <Switch
                                            id="billing-toggle"
                                            checked={isYearly}
                                            onCheckedChange={setIsYearly}
                                        />
                                        <Label
                                            htmlFor="billing-toggle"
                                            className={isYearly ? "font-semibold text-white" : "text-white/55"}
                                        >
                                            Yearly
                                        </Label>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-400/10 bg-emerald-500/10 px-4 py-3">
                                    <span className="text-sm text-emerald-100">Annual plans save up to 30%</span>
                                    <Badge className="bg-emerald-400 text-emerald-950">Best value</Badge>
                                </div>
                            </div>
                        </div>
                    </PremiumCard>
                </section>

                <section className="grid gap-6 lg:grid-cols-3">
                    <PlanCard
                        tier="free"
                        title="Free"
                        description="For trying Localley before you commit."
                        priceLabel="$0"
                        billingLabel="/month"
                        accent="slate"
                        badge={currentTier === "free" ? "Current Plan" : undefined}
                        current={currentTier === "free"}
                        features={[
                            { label: "3 itineraries per month" },
                            { label: "10 chat messages per day" },
                            { label: "Basic activity info" },
                            { label: "Booking links included" },
                            { label: "AI-generated images", included: false },
                            { label: "Full addresses", included: false },
                            { label: "PDF export (watermarked)", included: false },
                        ]}
                        footer={
                            <GlassButton className="w-full" disabled>
                                {currentTier === "free" ? "Current Plan" : "Explore Free"}
                            </GlassButton>
                        }
                    />

                    <PlanCard
                        tier="pro"
                        title="Pro"
                        description="For travelers planning more often and going deeper."
                        priceLabel={`$${proMonthly}`}
                        billingLabel="/month"
                        annualNote={isYearly ? `Billed $${proPrice} annually` : "7-day free trial included"}
                        accent="violet"
                        badge={currentTier === "pro" ? "Current Plan" : "Most Popular"}
                        current={currentTier === "pro"}
                        features={[
                            { label: "Unlimited itineraries", highlight: true },
                            { label: "100 chat messages per day", highlight: true },
                            { label: "AI-generated images", highlight: true },
                            { label: "Full addresses", highlight: true },
                            { label: "Exclusive booking deals" },
                            { label: "Clean PDF exports" },
                            { label: "Email itineraries" },
                            { label: "AI story backgrounds" },
                            { label: "Weather forecasts" },
                            { label: "No ads" },
                        ]}
                        footer={
                            currentTier === "pro" && hasBillingPortal ? (
                                <GlassButton
                                    className="w-full"
                                    onClick={handleManageSubscription}
                                    disabled={loadingTier === "manage"}
                                >
                                    {loadingTier === "manage" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Manage Subscription
                                </GlassButton>
                            ) : currentTier === "pro" ? (
                                <GlassButton className="w-full" disabled>
                                    {hasIncludedAccess ? "Included Access" : "Current Plan"}
                                </GlassButton>
                            ) : (
                                <PremiumButton
                                    className="w-full"
                                    glow
                                    loading={loadingTier === "pro"}
                                    leftIcon={<Sparkles className="h-4 w-4" />}
                                    onClick={() => handleSubscribe("pro")}
                                    disabled={isLoading || loadingTier !== null || (hasPaidSubscription && !hasBillingPortal)}
                                >
                                    {currentTier === "premium" && hasBillingPortal
                                        ? "Change Plan in Billing Portal"
                                        : currentTier === "premium"
                                            ? "Included Access"
                                            : "Start Pro Trial"}
                                </PremiumButton>
                            )
                        }
                    />

                    <PlanCard
                        tier="premium"
                        title="Premium"
                        description="For power users, teams, and heavier workflows."
                        priceLabel={`$${premiumMonthly}`}
                        billingLabel="/month"
                        annualNote={isYearly ? `Billed $${premiumPrice} annually` : "Highest-capability tier"}
                        accent="gold"
                        badge={currentTier === "premium" ? "Current Plan" : undefined}
                        current={currentTier === "premium"}
                        features={[
                            { label: "Everything in Pro, plus:", highlight: true },
                            { label: "Unlimited everything", highlight: true },
                            { label: "HD quality images", highlight: true },
                            { label: "Map pins & directions", highlight: true },
                            { label: "Smart scheduling (AI-optimized)" },
                            { label: "Collaborative trip planning" },
                            { label: "Branded PDF exports" },
                            { label: "Priority support" },
                        ]}
                        footer={
                            currentTier === "premium" && hasBillingPortal ? (
                                <GlassButton
                                    className="w-full"
                                    onClick={handleManageSubscription}
                                    disabled={loadingTier === "manage"}
                                >
                                    {loadingTier === "manage" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Manage Subscription
                                </GlassButton>
                            ) : currentTier === "premium" ? (
                                <GlassButton className="w-full" disabled>
                                    {hasIncludedAccess ? "Included Access" : "Current Plan"}
                                </GlassButton>
                            ) : (
                                <GlassButton
                                    className="w-full border-amber-400/30 bg-amber-500/10 text-amber-50 hover:bg-amber-500/15"
                                    onClick={() => handleSubscribe("premium")}
                                    disabled={isLoading || loadingTier !== null || (hasPaidSubscription && !hasBillingPortal)}
                                >
                                    {loadingTier === "premium" ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Crown className="mr-2 h-4 w-4" />
                                    )}
                                    {currentTier === "pro" && hasBillingPortal
                                        ? "Change Plan in Billing Portal"
                                        : currentTier === "pro"
                                            ? "Included Access"
                                            : "Upgrade to Premium"}
                                </GlassButton>
                            )
                        }
                    />
                </section>

                <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <PremiumCard className="border-white/10 bg-white/[0.04] p-6">
                        <div className="grid gap-5 sm:grid-cols-2">
                            <FAQCard
                                question="How are billing changes handled?"
                                answer="Plan upgrades, downgrades, payment methods, and cancellations are all managed through Stripe Billing Portal for a secure, consistent billing experience."
                            />
                            <FAQCard
                                question="Can I cancel or switch plans later?"
                                answer="Yes. Paid subscriptions should always be managed through Stripe Billing Portal so upgrades, downgrades, and cancellations stay consistent."
                            />
                            <FAQCard
                                question="What happens after the Pro trial?"
                                answer="After the 7-day trial, Stripe starts the Pro billing cycle automatically unless you cancel during the trial."
                            />
                            <FAQCard
                                question="Do you support refunds?"
                                answer="Localley offers a refund window within 14 days of the first payment if the product is not a fit."
                            />
                        </div>
                    </PremiumCard>

                    <PremiumCard
                        glow
                        className="border-violet-500/20 bg-gradient-to-br from-violet-500/12 via-white/[0.04] to-cyan-400/8 p-6"
                    >
                        <div className="flex h-full flex-col justify-between gap-6">
                            <div>
                                <Badge className="mb-3 bg-white/10 text-white/80">Built for confident travel planning</Badge>
                                <h2 className="text-2xl font-semibold text-white">Choose the plan that matches your pace.</h2>
                                <p className="mt-2 text-sm leading-6 text-white/70">
                                    Start on Free, move to Pro when you want better planning tools, or use Premium for
                                    the highest-capability experience with richer visuals, maps, and collaboration.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <InfoStep title="Free" text="A lighter entry point for trying Localley and getting a feel for the product." />
                                <InfoStep title="Pro" text="The best fit for regular travelers who want AI support, cleaner exports, and more depth." />
                                <InfoStep title="Premium" text="The full Localley experience for power users, teams, and heavier planning workflows." />
                            </div>

                            {currentTier === "free" ? (
                                <PremiumButton
                                    className="w-full"
                                    glow
                                    loading={loadingTier === "pro"}
                                    leftIcon={<Sparkles className="h-4 w-4" />}
                                    onClick={() => handleSubscribe("pro")}
                                    disabled={isLoading || loadingTier !== null}
                                >
                                    Start Free Trial
                                </PremiumButton>
                            ) : hasBillingPortal ? (
                                <GlassButton
                                    className="w-full"
                                    onClick={handleManageSubscription}
                                    disabled={loadingTier === "manage"}
                                >
                                    {loadingTier === "manage" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Open Billing Portal
                                </GlassButton>
                            ) : (
                                <GlassButton className="w-full" disabled>
                                    Included Access
                                </GlassButton>
                            )}
                        </div>
                    </PremiumCard>
                </section>
            </div>
        </AppBackground>
    );
}

function HeroStat({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Sparkles;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <Icon className="mb-3 h-5 w-5 text-violet-300" />
            <div className="text-sm text-white/55">{label}</div>
            <div className="mt-1 text-base font-semibold text-white">{value}</div>
        </div>
    );
}

function PlanCard({
    title,
    description,
    priceLabel,
    billingLabel,
    annualNote,
    features,
    footer,
    badge,
    accent,
    current,
    tier,
}: {
    tier: "free" | "pro" | "premium";
    title: string;
    description: string;
    priceLabel: string;
    billingLabel: string;
    annualNote?: string;
    features: Array<{ label: string; included?: boolean; highlight?: boolean }>;
    footer: React.ReactNode;
    badge?: string;
    accent: "slate" | "violet" | "gold";
    current?: boolean;
}) {
    const accentStyles = {
        slate: {
            iconWrap: "bg-white text-slate-800",
            icon: <Zap className="h-5 w-5" />,
            badge: "bg-slate-200 text-slate-900",
            border: "border-white/10",
            glow: "shadow-slate-950/10",
        },
        violet: {
            iconWrap: "bg-gradient-to-br from-violet-500 to-indigo-500 text-white",
            icon: <Sparkles className="h-5 w-5" />,
            badge: "bg-violet-500 text-white",
            border: current ? "border-violet-400/60" : "border-violet-400/25",
            glow: "shadow-violet-500/20",
        },
        gold: {
            iconWrap: "bg-gradient-to-br from-amber-400 to-orange-500 text-white",
            icon: <Crown className="h-5 w-5" />,
            badge: "bg-amber-400 text-amber-950",
            border: current ? "border-amber-300/70" : "border-amber-300/25",
            glow: "shadow-amber-500/20",
        },
    };

    const styles = accentStyles[accent];

    return (
        <PremiumCard
            glow={current}
            className={`relative flex h-full flex-col overflow-hidden border bg-white/[0.04] p-0 ${styles.border} ${styles.glow}`}
        >
            {badge ? (
                <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
                    <Badge className={styles.badge}>{badge}</Badge>
                </div>
            ) : null}

            <div className="flex h-full flex-col px-6 pb-6 pt-10">
                <div className="mb-6 flex items-start gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${styles.iconWrap}`}>
                        {styles.icon}
                    </div>
                    <div>
                        <h3 className="text-2xl font-semibold text-white">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-white/60">{description}</p>
                    </div>
                </div>

                <div className="mb-6 rounded-2xl border border-white/8 bg-black/20 p-5">
                    <div className="flex items-end gap-2">
                        <span className="text-5xl font-semibold tracking-tight text-white">{priceLabel}</span>
                        <span className="pb-1 text-lg text-white/60">{billingLabel}</span>
                    </div>
                    {annualNote ? <p className="mt-2 text-sm text-white/55">{annualNote}</p> : null}
                    {tier === "pro" ? (
                        <div className="mt-4 inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100">
                            Includes AI images and full addresses
                        </div>
                    ) : null}
                    {tier === "premium" ? (
                        <div className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                            Best for teams and high-frequency usage
                        </div>
                    ) : null}
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                    {features.map((feature) => (
                        <PricingFeature
                            key={feature.label}
                            included={feature.included}
                            highlight={feature.highlight}
                            accent={accent}
                        >
                            {feature.label}
                        </PricingFeature>
                    ))}
                </ul>

                <div className="mt-auto">{footer}</div>
            </div>
        </PremiumCard>
    );
}

function PricingFeature({
    children,
    included = true,
    highlight = false,
    accent,
}: {
    children: React.ReactNode;
    included?: boolean;
    highlight?: boolean;
    accent: "slate" | "violet" | "gold";
}) {
    const activeColor =
        accent === "gold" ? "text-amber-300" : accent === "violet" ? "text-violet-300" : "text-emerald-300";

    return (
        <li className={`flex items-start gap-3 ${!included ? "text-white/35 line-through" : "text-white/85"}`}>
            <Check
                className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                    included ? (highlight ? activeColor : "text-emerald-300") : "text-white/20"
                }`}
            />
            <span className={highlight ? "font-medium text-white" : ""}>{children}</span>
        </li>
    );
}

function FAQCard({ question, answer }: { question: string; answer: string }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
            <h3 className="text-lg font-semibold text-white">{question}</h3>
            <p className="mt-2 text-sm leading-6 text-white/65">{answer}</p>
        </div>
    );
}

function InfoStep({ title, text }: { title: string; text: string }) {
    return (
        <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="min-w-16 rounded-full border border-violet-400/20 bg-violet-500/15 px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.16em] text-violet-100">
                {title}
            </div>
            <p className="text-sm leading-6 text-white/75">{text}</p>
        </div>
    );
}
