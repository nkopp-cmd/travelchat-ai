"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Crown, Rocket, User, Sparkles, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscriptionContext } from "@/providers/subscription-provider";
import { TIER_CONFIGS } from "@/lib/subscription";
import { UsageIndicator } from "./usage-indicator";
import Link from "next/link";

interface SubscriptionBadgeProps {
    className?: string;
    showDetails?: boolean;
}

const tierConfig = {
    free: {
        label: "Choose plan",
        icon: User,
        color: "bg-violet-500/12 text-violet-100 hover:bg-violet-500/18",
        borderColor: "border-violet-300/25",
    },
    pro: {
        label: "Pro",
        icon: Rocket,
        color: "bg-violet-500/15 text-violet-100 hover:bg-violet-500/22",
        borderColor: "border-violet-300/30",
    },
    premium: {
        label: "Premium",
        icon: Crown,
        color: "bg-gradient-to-r from-amber-400/18 to-violet-500/14 text-amber-100 hover:from-amber-400/24 hover:to-violet-500/20",
        borderColor: "border-amber-300/35",
    },
};

export function SubscriptionBadge({
    className,
    showDetails = true,
}: SubscriptionBadgeProps) {
    const { tier, subscription, isLoading, openBillingPortal } =
        useSubscriptionContext();

    if (isLoading) {
        return (
            <Badge variant="secondary" className={cn("animate-pulse", className)}>
                Loading...
            </Badge>
        );
    }

    const config = tierConfig[tier];
    const Icon = config.icon;
    const tierLimits = TIER_CONFIGS[tier];

    if (!showDetails) {
        return (
            <Badge className={cn(config.color, "gap-1", className)}>
                <Icon className="h-3 w-3" />
                {config.label}
            </Badge>
        );
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className={cn(
                        "h-8 px-3 gap-1.5 rounded-full border",
                        config.color,
                        config.borderColor,
                        className
                    )}
                >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-sm font-medium">{config.label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 border-white/10 bg-[#0b0714]/96 text-white shadow-2xl shadow-violet-950/30 backdrop-blur-xl" align="end">
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div
                                className={cn(
                                    "p-2 rounded-full",
                                    tier === "premium"
                                        ? "bg-amber-400/15"
                                        : tier === "pro"
                                        ? "bg-violet-500/15"
                                        : "bg-violet-500/12"
                                )}
                            >
                                <Icon
                                    className={cn(
                                        "h-4 w-4",
                                        tier === "premium"
                                            ? "text-amber-200"
                                            : tier === "pro"
                                            ? "text-violet-200"
                                            : "text-violet-200"
                                    )}
                                />
                            </div>
                            <div>
                                <p className="font-semibold">
                                    {tier === "free" ? "Choose a paid plan" : `${config.label} Plan`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {tier === "free"
                                        ? "Pro or Premium is required for full access"
                                        : `$${tierLimits.price}/month`}
                                </p>
                            </div>
                        </div>
                        {tier !== "free" && subscription?.hasBillingPortal && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openBillingPortal()}
                            >
                                <Settings className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* Usage Section */}
                    {subscription && tier !== "free" && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-muted-foreground">
                                    Usage
                                </p>
                                <UsageIndicator
                                    label="Itineraries"
                                    current={subscription.usage.itinerariesThisMonth}
                                    limit={tierLimits.limits.itinerariesPerMonth}
                                    periodLabel="this month"
                                />
                                <UsageIndicator
                                    label="Chat Messages"
                                    current={subscription.usage.chatMessagesToday}
                                    limit={tierLimits.limits.chatMessagesPerDay}
                                    periodLabel="today"
                                />
                                <UsageIndicator
                                    label="Saved Spots"
                                    current={subscription.usage.savedSpots}
                                    limit={tierLimits.limits.savedSpotsLimit}
                                />
                            </div>
                        </>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="space-y-2">
                        {tier === "free" && (
                            <Button
                                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                                asChild
                            >
                                <Link href="/pricing">
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Choose Pro
                                </Link>
                            </Button>
                        )}
                        {tier === "pro" && !subscription?.hasBillingPortal && (
                            <Button
                                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
                                asChild
                            >
                                <Link href="/pricing">
                                    <Crown className="h-4 w-4 mr-2" />
                                    Compare plans
                                </Link>
                            </Button>
                        )}
                        {tier === "pro" && subscription?.hasBillingPortal && (
                            <Button
                                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
                                onClick={() => openBillingPortal()}
                            >
                                <Crown className="h-4 w-4 mr-2" />
                                Manage or compare
                            </Button>
                        )}
                        {tier === "premium" && subscription?.hasBillingPortal && (
                            <Button className="w-full" variant="outline" onClick={() => openBillingPortal()}>
                                <Settings className="h-4 w-4 mr-2" />
                                Manage Subscription
                            </Button>
                        )}
                        {tier === "premium" && !subscription?.hasBillingPortal && (
                            <Button className="w-full" variant="outline" disabled>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Included Access
                            </Button>
                        )}
                        <Button variant="outline" className="w-full" asChild>
                            <Link href="/pricing">View all plans</Link>
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
