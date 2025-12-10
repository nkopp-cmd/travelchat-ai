"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Sparkles } from "lucide-react";
import { AffiliateLink, AFFILIATE_PARTNERS } from "@/lib/affiliates";
import { cn } from "@/lib/utils";

interface BookingButtonProps {
    link: AffiliateLink;
    showDeal?: boolean;
    activityName: string;
    variant?: "default" | "outline" | "ghost";
    size?: "sm" | "default" | "lg";
    className?: string;
}

export function BookingButton({
    link,
    showDeal = false,
    activityName,
    variant = "default",
    size = "sm",
    className,
}: BookingButtonProps) {
    const partner = AFFILIATE_PARTNERS[link.partner];

    const handleClick = async () => {
        // Track the click before redirecting
        try {
            await fetch("/api/affiliates/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    partner: link.partner,
                    trackingId: link.trackingId,
                    eventType: "click",
                    activityName,
                    url: link.url,
                }),
            });
        } catch (error) {
            // Don't block the redirect if tracking fails
            console.error("Failed to track click:", error);
        }

        // Open the affiliate link
        window.open(link.url, "_blank", "noopener,noreferrer");
    };

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            className={cn(
                "gap-1.5 relative",
                variant === "default" && "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700",
                className
            )}
        >
            <span>{link.icon}</span>
            <span>{link.displayName}</span>
            <ExternalLink className="h-3 w-3" />

            {/* Deal badge for Pro+ users */}
            {showDeal && (
                <Badge
                    className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 animate-pulse"
                >
                    <Sparkles className="h-2 w-2 mr-0.5" />
                    Deal
                </Badge>
            )}
        </Button>
    );
}

/**
 * A row of booking buttons for an activity
 */
interface BookingButtonsRowProps {
    links: AffiliateLink[];
    showDeals?: boolean;
    activityName: string;
    maxVisible?: number;
}

export function BookingButtonsRow({
    links,
    showDeals = false,
    activityName,
    maxVisible = 3,
}: BookingButtonsRowProps) {
    const visibleLinks = links.slice(0, maxVisible);

    return (
        <div className="flex flex-wrap gap-2">
            {visibleLinks.map((link, index) => (
                <BookingButton
                    key={link.partner}
                    link={link}
                    showDeal={showDeals && index === 0} // Only show deal on first button
                    activityName={activityName}
                    variant={index === 0 ? "default" : "outline"}
                />
            ))}
        </div>
    );
}
