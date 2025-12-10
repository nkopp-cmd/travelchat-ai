"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles,
    Crown,
    Rocket,
    Calendar,
    MessageSquare,
    Image,
    Bookmark,
    ArrowRight,
    Check,
} from "lucide-react";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import { useSubscriptionContext } from "@/providers/subscription-provider";

export type LimitType =
    | "itineraries"
    | "chat"
    | "stories"
    | "images"
    | "spots";

interface LimitExceededModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    limitType: LimitType;
    currentUsage: number;
    limit: number;
    resetAt?: string;
}

const limitTypeConfig: Record<LimitType, {
    title: string;
    description: string;
    icon: React.ReactNode;
    upgradeMessage: string;
}> = {
    itineraries: {
        title: "Itinerary Limit Reached",
        description: "You've used all your itinerary generations for this month.",
        icon: <Calendar className="h-6 w-6" />,
        upgradeMessage: "Create unlimited itineraries with Pro",
    },
    chat: {
        title: "Daily Chat Limit Reached",
        description: "You've used all your chat messages for today.",
        icon: <MessageSquare className="h-6 w-6" />,
        upgradeMessage: "Get more messages with Pro",
    },
    stories: {
        title: "Story Limit Reached",
        description: "You've created all your stories for this week.",
        icon: <Sparkles className="h-6 w-6" />,
        upgradeMessage: "Create unlimited stories with Pro",
    },
    images: {
        title: "AI Image Limit Reached",
        description: "You've generated all your AI images for this month.",
        icon: <Image className="h-6 w-6" />,
        upgradeMessage: "Generate more AI images with Premium",
    },
    spots: {
        title: "Saved Spots Limit Reached",
        description: "You've reached your saved spots limit.",
        icon: <Bookmark className="h-6 w-6" />,
        upgradeMessage: "Save unlimited spots with Premium",
    },
};

export function LimitExceededModal({
    open,
    onOpenChange,
    limitType,
    currentUsage,
    limit,
    resetAt,
}: LimitExceededModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const config = limitTypeConfig[limitType];
    const { openCheckout, tier } = useSubscriptionContext();

    const progressPercent = Math.min((currentUsage / limit) * 100, 100);

    const handleUpgrade = async (targetTier: "pro" | "premium") => {
        setIsLoading(true);
        try {
            await openCheckout(targetTier);
        } finally {
            setIsLoading(false);
        }
    };

    const formatResetDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
        });
    };

    const suggestedTier = tier === "free" ? "pro" : "premium";
    const suggestedTierConfig = TIER_CONFIGS[suggestedTier];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        {config.icon}
                    </div>
                    <DialogTitle className="text-center text-xl">
                        {config.title}
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        {config.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Usage Progress */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Usage</span>
                            <span className="font-medium">
                                {currentUsage} / {limit}
                            </span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                        {resetAt && (
                            <p className="text-xs text-muted-foreground text-center">
                                Resets on {formatResetDate(resetAt)}
                            </p>
                        )}
                    </div>

                    {/* Upgrade Card */}
                    <div className="rounded-lg border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            {suggestedTier === "pro" ? (
                                <Rocket className="h-5 w-5 text-violet-600" />
                            ) : (
                                <Crown className="h-5 w-5 text-yellow-600" />
                            )}
                            <span className="font-semibold capitalize">
                                Upgrade to {suggestedTier}
                            </span>
                            <Badge variant="secondary" className="ml-auto">
                                ${suggestedTierConfig.price}/mo
                            </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {config.upgradeMessage}
                        </p>

                        <ul className="space-y-2 text-sm">
                            <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>
                                    {suggestedTierConfig.limits.itinerariesPerMonth === 999
                                        ? "Unlimited"
                                        : suggestedTierConfig.limits.itinerariesPerMonth}{" "}
                                    itineraries/month
                                </span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>
                                    {suggestedTierConfig.limits.chatMessagesPerDay === 999
                                        ? "Unlimited"
                                        : suggestedTierConfig.limits.chatMessagesPerDay}{" "}
                                    messages/day
                                </span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>
                                    {suggestedTierConfig.features.activityImages === "ai-generated"
                                        ? "AI-generated"
                                        : "High-quality"}{" "}
                                    images
                                </span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>Full address & booking deals</span>
                            </li>
                        </ul>

                        <Button
                            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                            onClick={() => handleUpgrade(suggestedTier)}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                "Redirecting..."
                            ) : (
                                <>
                                    Upgrade to {suggestedTier}
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Alternative: Wait */}
                    {resetAt && (
                        <p className="text-center text-sm text-muted-foreground">
                            Or wait until {formatResetDate(resetAt)} for your limit to reset
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
