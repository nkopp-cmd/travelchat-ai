"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Crown, Zap } from "lucide-react";
import {
    SubscriptionTier,
    SubscriptionFeatures,
    getUpgradePrompt,
    TIER_CONFIGS,
} from "@/lib/subscription";
import Link from "next/link";

interface UpgradePromptProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    feature: keyof SubscriptionFeatures;
    currentTier: SubscriptionTier;
}

export function UpgradePrompt({
    open,
    onOpenChange,
    feature,
    currentTier,
}: UpgradePromptProps) {
    const prompt = getUpgradePrompt(feature);
    const suggestedTierConfig = TIER_CONFIGS[prompt.suggestedTier];

    // Get features for the suggested tier
    const tierBenefits = getTierBenefits(prompt.suggestedTier);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                            {prompt.suggestedTier === "premium" ? (
                                <Crown className="h-5 w-5 text-white" />
                            ) : (
                                <Sparkles className="h-5 w-5 text-white" />
                            )}
                        </div>
                        <Badge
                            variant="secondary"
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                        >
                            {suggestedTierConfig.name}
                        </Badge>
                    </div>
                    <DialogTitle className="text-xl">{prompt.title}</DialogTitle>
                    <DialogDescription className="text-base">
                        {prompt.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Pricing */}
                    <div className="text-center p-4 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 rounded-lg">
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-3xl font-bold">${suggestedTierConfig.price}</span>
                            <span className="text-muted-foreground">/month</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            or ${suggestedTierConfig.yearlyPrice}/year (save{" "}
                            {Math.round((1 - suggestedTierConfig.yearlyPrice / (suggestedTierConfig.price * 12)) * 100)}%)
                        </p>
                    </div>

                    {/* Benefits */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                            What you&apos;ll get:
                        </p>
                        <ul className="space-y-2">
                            {tierBenefits.map((benefit, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{benefit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Link href="/pricing" className="w-full">
                        <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                            <Zap className="h-4 w-4 mr-2" />
                            Upgrade to {suggestedTierConfig.name}
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => onOpenChange(false)}
                    >
                        Maybe later
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Get human-readable benefits for a tier
 */
function getTierBenefits(tier: SubscriptionTier): string[] {
    const benefits: Record<SubscriptionTier, string[]> = {
        free: [],
        pro: [
            "AI-generated images for all activities",
            "Full addresses with map links",
            "Exclusive booking deals",
            "Clean PDF exports (no watermark)",
            "Email itineraries to friends",
            "AI story backgrounds",
            "Weather forecasts for your trip",
            "No ads",
        ],
        premium: [
            "Everything in Pro, plus:",
            "HD quality images",
            "Map pins and directions",
            "Smart scheduling (AI-optimized order)",
            "Collaborative trip planning",
            "Priority customer support",
            "Branded PDF exports",
            "Unlimited everything",
        ],
    };

    return benefits[tier];
}

/**
 * Inline upgrade prompt for use in cards/lists
 */
interface InlineUpgradePromptProps {
    feature: keyof SubscriptionFeatures;
    className?: string;
}

export function InlineUpgradePrompt({ feature, className }: InlineUpgradePromptProps) {
    const prompt = getUpgradePrompt(feature);

    return (
        <Link
            href="/pricing"
            className={`flex items-center gap-2 p-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 rounded-lg border border-violet-200 dark:border-violet-800 hover:border-violet-400 transition-colors ${className}`}
        >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{prompt.title}</p>
                <p className="text-xs text-muted-foreground truncate">{prompt.description}</p>
            </div>
            <Badge variant="secondary" className="flex-shrink-0">
                Pro
            </Badge>
        </Link>
    );
}
