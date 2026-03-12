"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, DollarSign, ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionTier, canSeeFullAddress, hasFeature } from "@/lib/subscription";
import { getActivityBookingLinks, getHotelBookingLinks } from "@/lib/affiliates";
import { BookingDealsPopover } from "./booking-deals-popover";
import { usePlacePhoto } from "@/hooks/use-place-photo";

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

    // Fetch Google Places photo + rating for paid users when no existing image
    const placeData = usePlacePhoto(activity.name, city, {
        existingImage: activity.image,
        userTier,
    });

    // Use activity image first, then Google Places photo for paid users
    const displayImage = activity.image || placeData.photoUrl;
    const displayRating = placeData.rating;
    const displayTotalRatings = placeData.totalRatings;

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
                {/* Activity Thumbnail — shows existing image or Google Places photo */}
                {displayImage && (
                    <div className="flex-shrink-0">
                        <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-lg overflow-hidden">
                            {activity.image ? (
                                <Image
                                    src={activity.image}
                                    alt={activity.name}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 80px, 112px"
                                />
                            ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={displayImage}
                                    alt={activity.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            )}
                            {placeData.isLoading && (
                                <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                                    <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
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
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {displayAddress}
                                    {!canShowFullAddress && activity.address && (
                                        <span className="text-violet-600 text-xs ml-1">(Pro: full address)</span>
                                    )}
                                </p>
                                {/* Google Places rating */}
                                {displayRating && (
                                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                        {displayRating.toFixed(1)}
                                        {displayTotalRatings && (
                                            <span className="text-xs">({displayTotalRatings.toLocaleString()})</span>
                                        )}
                                    </span>
                                )}
                            </div>
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

                    {/* Booking & Maps */}
                    <div className="pt-2 flex flex-wrap gap-2">
                        <BookingDealsPopover
                            activityLinks={bookingLinks.slice(0, 2)}
                            hotelLinks={hotelLinks.slice(0, 1)}
                            activityName={activity.name}
                            showDeals={showDeals}
                        />
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
    );
}
