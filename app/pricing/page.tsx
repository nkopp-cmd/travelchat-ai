"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Check,
    Sparkles,
    Crown,
    Zap,
    ArrowLeft,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { useSubscription } from "@/hooks/use-subscription";
import { TIER_CONFIGS } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";

export default function PricingPage() {
    const [isYearly, setIsYearly] = useState(false);
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const { tier: currentTier, isLoading, openCheckout, openBillingPortal } = useSubscription();
    const { toast } = useToast();

    const handleSubscribe = async (tier: "pro" | "premium") => {
        try {
            setLoadingTier(tier);
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
        try {
            setLoadingTier("manage");
            await openBillingPortal();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to open billing portal",
                variant: "destructive",
            });
        } finally {
            setLoadingTier(null);
        }
    };

    const proPrice = isYearly ? TIER_CONFIGS.pro.yearlyPrice : TIER_CONFIGS.pro.price;
    const premiumPrice = isYearly ? TIER_CONFIGS.premium.yearlyPrice : TIER_CONFIGS.premium.price;
    const proMonthly = isYearly ? Math.round(TIER_CONFIGS.pro.yearlyPrice / 12) : TIER_CONFIGS.pro.price;
    const premiumMonthly = isYearly ? Math.round(TIER_CONFIGS.premium.yearlyPrice / 12) : TIER_CONFIGS.premium.price;

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div className="container mx-auto px-4 py-12">
                {/* Back Button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                </Link>

                {/* Header */}
                <div className="text-center mb-12 space-y-4">
                    <Badge variant="secondary" className="mb-4">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Choose Your Plan
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        Unlock Your Travel Potential
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Get AI-generated images, full addresses, exclusive deals, and unlimited access to Localley
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-3 pt-6">
                        <Label htmlFor="billing-toggle" className={!isYearly ? "font-semibold" : "text-muted-foreground"}>
                            Monthly
                        </Label>
                        <Switch
                            id="billing-toggle"
                            checked={isYearly}
                            onCheckedChange={setIsYearly}
                        />
                        <Label htmlFor="billing-toggle" className={isYearly ? "font-semibold" : "text-muted-foreground"}>
                            Yearly
                        </Label>
                        {isYearly && (
                            <Badge className="ml-2 bg-green-500">Save up to 30%</Badge>
                        )}
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {/* Free Tier */}
                    <Card className={`relative ${currentTier === "free" ? "ring-2 ring-violet-500" : ""}`}>
                        {currentTier === "free" && (
                            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-500">
                                Current Plan
                            </Badge>
                        )}
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                                    <Zap className="h-5 w-5 text-gray-600" />
                                </div>
                                Free
                            </CardTitle>
                            <CardDescription>Perfect for trying out Localley</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <span className="text-4xl font-bold">$0</span>
                                <span className="text-muted-foreground">/month</span>
                            </div>
                            <ul className="space-y-3">
                                <PricingFeature>3 itineraries per month</PricingFeature>
                                <PricingFeature>10 chat messages per day</PricingFeature>
                                <PricingFeature>Basic activity info</PricingFeature>
                                <PricingFeature>Booking links included</PricingFeature>
                                <PricingFeature included={false}>AI-generated images</PricingFeature>
                                <PricingFeature included={false}>Full addresses</PricingFeature>
                                <PricingFeature included={false}>PDF export (watermarked)</PricingFeature>
                            </ul>
                        </CardContent>
                        <CardFooter>
                            <Button variant="outline" className="w-full" disabled>
                                {currentTier === "free" ? "Current Plan" : "Downgrade"}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Pro Tier */}
                    <Card className={`relative border-violet-200 shadow-lg ${currentTier === "pro" ? "ring-2 ring-violet-500" : ""}`}>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                            {currentTier === "pro" ? (
                                <Badge className="bg-violet-500">Current Plan</Badge>
                            ) : (
                                <Badge className="bg-gradient-to-r from-violet-600 to-indigo-600">
                                    Most Popular
                                </Badge>
                            )}
                        </div>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5 text-white" />
                                </div>
                                Pro
                            </CardTitle>
                            <CardDescription>For serious travelers</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <span className="text-4xl font-bold">${proMonthly}</span>
                                <span className="text-muted-foreground">/month</span>
                                {isYearly && (
                                    <p className="text-sm text-muted-foreground">
                                        Billed ${proPrice} annually
                                    </p>
                                )}
                            </div>
                            <ul className="space-y-3">
                                <PricingFeature highlight>Unlimited itineraries</PricingFeature>
                                <PricingFeature highlight>100 chat messages per day</PricingFeature>
                                <PricingFeature highlight>AI-generated images</PricingFeature>
                                <PricingFeature highlight>Full addresses</PricingFeature>
                                <PricingFeature>Exclusive booking deals</PricingFeature>
                                <PricingFeature>Clean PDF exports</PricingFeature>
                                <PricingFeature>Email itineraries</PricingFeature>
                                <PricingFeature>AI story backgrounds</PricingFeature>
                                <PricingFeature>Weather forecasts</PricingFeature>
                                <PricingFeature>No ads</PricingFeature>
                                <PricingFeature>7-day free trial</PricingFeature>
                            </ul>
                        </CardContent>
                        <CardFooter>
                            {currentTier === "pro" ? (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleManageSubscription}
                                    disabled={loadingTier === "manage"}
                                >
                                    {loadingTier === "manage" ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Manage Subscription
                                </Button>
                            ) : (
                                <Button
                                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                                    onClick={() => handleSubscribe("pro")}
                                    disabled={isLoading || loadingTier !== null}
                                >
                                    {loadingTier === "pro" ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Sparkles className="h-4 w-4 mr-2" />
                                    )}
                                    {currentTier === "premium" ? "Switch to Pro" : "Start Free Trial"}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* Premium Tier */}
                    <Card className={`relative ${currentTier === "premium" ? "ring-2 ring-yellow-500" : ""}`}>
                        {currentTier === "premium" && (
                            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500">
                                Current Plan
                            </Badge>
                        )}
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                                    <Crown className="h-5 w-5 text-white" />
                                </div>
                                Premium
                            </CardTitle>
                            <CardDescription>For power users & teams</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <span className="text-4xl font-bold">${premiumMonthly}</span>
                                <span className="text-muted-foreground">/month</span>
                                {isYearly && (
                                    <p className="text-sm text-muted-foreground">
                                        Billed ${premiumPrice} annually
                                    </p>
                                )}
                            </div>
                            <ul className="space-y-3">
                                <PricingFeature highlight>Everything in Pro, plus:</PricingFeature>
                                <PricingFeature highlight>Unlimited everything</PricingFeature>
                                <PricingFeature highlight>HD quality images</PricingFeature>
                                <PricingFeature highlight>Map pins & directions</PricingFeature>
                                <PricingFeature>Smart scheduling (AI-optimized)</PricingFeature>
                                <PricingFeature>Collaborative trip planning</PricingFeature>
                                <PricingFeature>Branded PDF exports</PricingFeature>
                                <PricingFeature>Priority support</PricingFeature>
                            </ul>
                        </CardContent>
                        <CardFooter>
                            {currentTier === "premium" ? (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleManageSubscription}
                                    disabled={loadingTier === "manage"}
                                >
                                    {loadingTier === "manage" ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Manage Subscription
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="w-full border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                                    onClick={() => handleSubscribe("premium")}
                                    disabled={isLoading || loadingTier !== null}
                                >
                                    {loadingTier === "premium" ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Crown className="h-4 w-4 mr-2" />
                                    )}
                                    Upgrade to Premium
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </div>

                {/* FAQ Section */}
                <div className="mt-20 max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
                    <div className="space-y-6">
                        <FaqItem
                            question="Can I cancel anytime?"
                            answer="Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period."
                        />
                        <FaqItem
                            question="What happens after my trial ends?"
                            answer="After your 7-day free trial, you'll be automatically charged for the Pro plan. You can cancel anytime during the trial to avoid charges."
                        />
                        <FaqItem
                            question="Can I switch between plans?"
                            answer="Absolutely! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any differences."
                        />
                        <FaqItem
                            question="Do you offer refunds?"
                            answer="We offer a full refund within 14 days of your first payment if you're not satisfied with Localley."
                        />
                    </div>
                </div>

                {/* CTA */}
                <div className="mt-20 text-center p-8 bg-gradient-to-r from-violet-100 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-2xl border border-violet-200 dark:border-violet-800">
                    <h3 className="text-2xl font-bold mb-2">Ready to explore like a local?</h3>
                    <p className="text-muted-foreground mb-6">
                        Start your 7-day free trial today. No credit card required to try.
                    </p>
                    <Button
                        size="lg"
                        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                        onClick={() => handleSubscribe("pro")}
                        disabled={isLoading || loadingTier !== null || currentTier !== "free"}
                    >
                        {loadingTier === "pro" ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Start Free Trial
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PricingFeature({
    children,
    included = true,
    highlight = false,
}: {
    children: React.ReactNode;
    included?: boolean;
    highlight?: boolean;
}) {
    return (
        <li className={`flex items-start gap-2 ${!included ? "text-muted-foreground line-through" : ""}`}>
            <Check className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                included
                    ? highlight
                        ? "text-violet-600"
                        : "text-green-500"
                    : "text-gray-300"
            }`} />
            <span className={highlight ? "font-medium" : ""}>{children}</span>
        </li>
    );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">{question}</h3>
            <p className="text-muted-foreground">{answer}</p>
        </div>
    );
}
