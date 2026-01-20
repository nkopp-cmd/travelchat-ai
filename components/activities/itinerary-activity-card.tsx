"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, DollarSign, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionTier, canSeeFullAddress, hasFeature } from "@/lib/subscription";
import { getActivityBookingLinks, getHotelBookingLinks } from "@/lib/affiliates";
import { BookingButton } from "./booking-button";

interface ItineraryActivity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    category?: string;
    localleyScore?: number;
    image?: string;
}

interface ItineraryActivityCardProps {
    activity: ItineraryActivity;
    city: string;
    userTier?: SubscriptionTier;
    isLast?: boolean;
}

// Get Localley score badge
const getScoreBadge = (score: number) => {
    if (score >= 6) return { label: "Legendary", color: "bg-yellow-500", icon: "🏆" };
    if (score >= 5) return { label: "Hidden Gem", color: "bg-violet-500", icon: "💎" };
    if (score >= 4) return { label: "Local Favorite", color: "bg-indigo-500", icon: "⭐" };
    return { label: "Mixed Crowd", color: "bg-blue-500", icon: "👥" };
};

// Get icon for activity type
const getTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
        case "morning": return "🌅";
        case "afternoon": return "☀️";
        case "evening": return "🌆";
        case "night": return "🌙";
        default: return "📍";
    }
};

export function ItineraryActivityCard({
    activity,
    city,
    userTier = "free",
    isLast = false,
}: ItineraryActivityCardProps) {
    const scoreBadge = activity.localleyScore ? getScoreBadge(activity.localleyScore) : null;
    const canShowFullAddress = canSeeFullAddress(userTier);
    const showDeals = hasFeature(userTier, "bookingDeals");

    // Get booking links
    const bookingLinks = getActivityBookingLinks({
        activityName: activity.name,
        city,
        category: activity.category,
    });

    const hotelLinks = getHotelBookingLinks({ city });

    // Get area from address if needed
    const getAreaFromAddress = (address: string): string => {
        // Extract district/area name (usually after last comma or first part)
        const parts = address.split(",");
        if (parts.length >= 2) {
            return parts[parts.length - 2].trim() + ", " + city;
        }
        return city + " Area";
    };

    const displayAddress = canShowFullAddress
        ? activity.address
        : activity.address
            ? getAreaFromAddress(activity.address)
            : `${city} Area`;

    return (
        <div className={cn("relative pl-8 border-l-2 border-violet-200 dark:border-violet-800", !isLast && "pb-6")}>
            {/* Timeline Dot */}
            <div className="absolute -left-[9px] top-0">
                <div className="w-4 h-4 rounded-full bg-violet-600 border-4 border-background" />
            </div>

            <div className="flex gap-4">
                {/* Activity Thumbnail */}
                {activity.image && (
                    <div className="hidden sm:block flex-shrink-0">
                        <div className="relative w-24 h-24 rounded-lg overflow-hidden">
                            <Image
                                src={activity.image}
                                alt={activity.name}
                                fill
                                className="object-cover"
                                sizes="96px"
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 space-y-3">
                    {/* Activity Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg">{activity.name}</h3>
                                {scoreBadge && (
                                    <Badge className={`${scoreBadge.color} text-white`}>
                                        {scoreBadge.icon} {scoreBadge.label}
                                    </Badge>
                                )}
                                {activity.category && (
                                    <Badge variant="secondary" className="text-xs">
                                        {activity.category}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {displayAddress}
                                {!canShowFullAddress && activity.address && (
                                    <span className="text-violet-600 text-xs ml-1">(Pro: full address)</span>
                                )}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                            {activity.time && (
                                <Badge variant="outline" className="gap-1">
                                    <Clock className="h-3 w-3" />
                                    {activity.time}
                                </Badge>
                            )}
                            {activity.type && (
                                <Badge variant="outline">
                                    {getTypeIcon(activity.type)} {activity.type}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Activity Description */}
                    {activity.description && (
                        <p className="text-muted-foreground leading-relaxed">
                            {activity.description}
                        </p>
                    )}

                    {/* Activity Details */}
                    <div className="flex flex-wrap gap-4 text-sm">
                        {activity.duration && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>{activity.duration}</span>
                            </div>
                        )}
                        {activity.cost && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <DollarSign className="h-4 w-4" />
                                <span>{activity.cost}</span>
                            </div>
                        )}
                    </div>

                    {/* Booking Links */}
                    <div className="pt-2 space-y-2">
                        {/* Deal indicator - shown once above all buttons */}
                        {showDeals && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                <Sparkles className="h-3 w-3" />
                                <span className="font-medium">Exclusive deals available</span>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {bookingLinks.slice(0, 2).map((link) => (
                                <BookingButton
                                    key={link.partner}
                                    link={link}
                                    showDeal={false}
                                    activityName={activity.name}
                                    size="sm"
                                />
                            ))}
                            {hotelLinks.slice(0, 1).map((link) => (
                                <BookingButton
                                    key={link.partner}
                                    link={link}
                                    showDeal={false}
                                    activityName={`Hotels near ${activity.name}`}
                                    variant="outline"
                                    size="sm"
                                />
                            ))}
                            {canShowFullAddress && activity.address && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(activity.address || "")}`, "_blank")}
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Maps
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
