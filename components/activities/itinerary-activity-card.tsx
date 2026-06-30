"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, DollarSign, ExternalLink, Star, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionTier, canSeeFullAddress, hasFeature } from "@/lib/subscription";
import { getActivityBookingLinks, getHotelBookingLinks } from "@/lib/affiliates";
import { BookingDealsPopover } from "./booking-deals-popover";
import { usePlacePhoto } from "@/hooks/use-place-photo";
import { CityImageAvatar } from "@/components/ui/city-image";
import { buildActivityMapUrl } from "@/lib/itineraries/map-links";

interface ItineraryActivity {
    name: string;
    nameKo?: string;
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

function compactAddress(address: string, city: string): string {
    const parts = address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length >= 3) return `${parts.at(-2)}, ${parts.at(-1)}`;
    if (parts.length >= 2) return `${parts.at(-2)}, ${city}`;
    return `${city} area`;
}

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

    const displayAddress = canShowFullAddress
        ? activity.address
        : activity.address
            ? compactAddress(activity.address, city)
            : `${city} Area`;
    const exactMapUrl = buildActivityMapUrl(activity, city);

    return (
        <div className={cn("relative pl-5 sm:pl-7 border-l border-violet-200/70 dark:border-violet-800/70", !isLast && "pb-3 sm:pb-4")}>
            {/* Timeline Dot */}
            <div className="absolute -left-[7px] top-4">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-background bg-violet-500 shadow-sm shadow-violet-500/35" />
            </div>

            <div className="group overflow-hidden rounded-lg border border-black/5 bg-white/80 shadow-sm shadow-violet-500/5 backdrop-blur-md transition-colors hover:border-violet-300/40 dark:border-white/10 dark:bg-white/[0.055]">
                <div className="flex gap-3 p-2.5 sm:gap-4 sm:p-3.5">
                {/* Activity Thumbnail — shows existing image or Google Places photo */}
                <div className="flex-shrink-0">
                    <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-violet-950/10 sm:h-24 sm:w-28">
                        {displayImage ? (
                            activity.image ? (
                                    <Image
                                        src={activity.image}
                                        alt={activity.name}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        sizes="(max-width: 640px) 80px, 112px"
                                        quality={90}
                                    />
                                ) : (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={displayImage}
                                        alt={activity.name}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                )
                        ) : (
                            <CityImageAvatar city={city} className="h-full w-full rounded-none" sizes="112px" imageWidth={360} quality={90} />
                        )}
                        {placeData.isLoading && (
                            <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                        {activity.time && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                                {activity.time}
                            </span>
                        )}
                    </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    {/* Activity Header */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <h3 className="min-w-0 text-sm font-bold leading-snug text-foreground sm:text-base">
                                    {activity.name}
                                </h3>
                                {scoreBadge && (
                                    <Badge className={`${scoreBadge.color} h-5 rounded-full px-2 text-[10px] font-semibold text-white`}>
                                        {scoreBadge.icon} {scoreBadge.label}
                                    </Badge>
                                )}
                                {activity.category && (
                                    <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">
                                        {activity.category}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <div className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground sm:text-sm">
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                                    <span className="line-clamp-2 min-w-0 break-words">{displayAddress}</span>
                                </div>
                                {/* Google Places rating */}
                                {displayRating && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                        {displayRating.toFixed(1)}
                                        {displayTotalRatings && (
                                            <span className="text-xs">({displayTotalRatings.toLocaleString()})</span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                            {activity.type && (
                                <Badge variant="outline" className="h-6 rounded-full px-2">
                                    {getTypeIcon(activity.type)} {activity.type}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Activity Description */}
                    {activity.description && (
                        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:line-clamp-none">
                            {activity.description}
                        </p>
                    )}

                    {/* Activity Details */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm">
                        {activity.duration && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{activity.duration}</span>
                            </div>
                        )}
                        {activity.cost && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <DollarSign className="h-3.5 w-3.5" />
                                <span>{activity.cost}</span>
                            </div>
                        )}
                    </div>

                    {/* Booking & Maps */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        <BookingDealsPopover
                            activityLinks={bookingLinks.slice(0, 2)}
                            hotelLinks={hotelLinks.slice(0, 1)}
                            activityName={activity.name}
                            showDeals={showDeals}
                        />
                        {canShowFullAddress && exactMapUrl && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 rounded-full border-violet-200/50 bg-violet-50/70 px-3 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200 dark:hover:bg-violet-400/15"
                                onClick={() => window.open(exactMapUrl, "_blank", "noopener,noreferrer")}
                                aria-label={`Open exact map location for ${activity.name}`}
                            >
                                <Navigation className="h-3.5 w-3.5" />
                                Exact map
                                <ExternalLink className="h-3 w-3" />
                            </Button>
                        )}
                        {!canShowFullAddress && activity.address && (
                            <span className="inline-flex h-8 items-center rounded-full border border-violet-200/40 bg-violet-50/60 px-3 text-xs font-medium text-violet-700 dark:border-violet-400/15 dark:bg-violet-400/10 dark:text-violet-200">
                                Full address on paid plans
                            </span>
                        )}
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
}
