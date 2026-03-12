"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink, Sparkles, Ticket } from "lucide-react";
import type { AffiliateLink } from "@/lib/affiliates";
import { AFFILIATE_PARTNERS } from "@/lib/affiliates";

interface BookingDealsPopoverProps {
    activityLinks: AffiliateLink[];
    hotelLinks: AffiliateLink[];
    activityName: string;
    showDeals?: boolean;
}

export function BookingDealsPopover({
    activityLinks,
    hotelLinks,
    activityName,
    showDeals = false,
}: BookingDealsPopoverProps) {
    const [open, setOpen] = useState(false);
    const allLinks = [...activityLinks, ...hotelLinks];

    if (allLinks.length === 0) return null;

    const handleClick = async (link: AffiliateLink, linkActivityName: string) => {
        try {
            await fetch("/api/affiliates/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    partner: link.partner,
                    trackingId: link.trackingId,
                    eventType: "click",
                    activityName: linkActivityName,
                    url: link.url,
                }),
            });
        } catch {
            // Don't block redirect if tracking fails
        }
        window.open(link.url, "_blank", "noopener,noreferrer");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 relative"
                >
                    <Ticket className="h-3.5 w-3.5" />
                    Book deals
                    {showDeals && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                <div className="p-3 border-b">
                    <p className="font-semibold text-sm">Book this activity</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{activityName}</p>
                </div>
                <div className="p-1.5">
                    {activityLinks.map((link, index) => {
                        const partner = AFFILIATE_PARTNERS[link.partner];
                        return (
                            <button
                                key={link.partner}
                                onClick={() => handleClick(link, activityName)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/80 transition-colors text-left"
                            >
                                <span className="text-lg">{link.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{partner.name}</p>
                                    <p className="text-xs text-muted-foreground">{partner.description}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {showDeals && index === 0 && (
                                        <span className="text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                            <Sparkles className="h-2.5 w-2.5" />
                                            Deal
                                        </span>
                                    )}
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                            </button>
                        );
                    })}
                    {hotelLinks.length > 0 && activityLinks.length > 0 && (
                        <div className="border-t my-1" />
                    )}
                    {hotelLinks.map((link) => {
                        const partner = AFFILIATE_PARTNERS[link.partner];
                        return (
                            <button
                                key={link.partner}
                                onClick={() => handleClick(link, `Hotels near ${activityName}`)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/80 transition-colors text-left"
                            >
                                <span className="text-lg">{link.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{partner.name}</p>
                                    <p className="text-xs text-muted-foreground">Find nearby hotels</p>
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
