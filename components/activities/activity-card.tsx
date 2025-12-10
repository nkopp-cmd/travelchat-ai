"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    MapPin,
    Clock,
    DollarSign,
    Star,
    ExternalLink,
    Lock,
    Bookmark,
    Share2,
    ChevronDown,
    ChevronUp,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionTier, canSeeFullAddress, hasFeature } from "@/lib/subscription";
import { getActivityBookingLinks, getHotelBookingLinks, AffiliateLink } from "@/lib/affiliates";
import { BookingButton } from "./booking-button";
import { UpgradePrompt } from "./upgrade-prompt";

export interface Activity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    area?: string; // District/neighborhood for free users
    city: string;
    type?: string;
    category?: string;
    localleyScore?: number;
    image?: string;
    bookingUrl?: string;
}

interface ActivityCardProps {
    activity: Activity;
    userTier?: SubscriptionTier;
    onSave?: () => void;
    onShare?: () => void;
    className?: string;
    compact?: boolean;
}

// Localley score badge configurations
const getScoreBadge = (score: number) => {
    if (score >= 6) return { label: "Legendary Alley", color: "bg-yellow-500", icon: "🏆" };
    if (score >= 5) return { label: "Hidden Gem", color: "bg-violet-500", icon: "💎" };
    if (score >= 4) return { label: "Local Favorite", color: "bg-indigo-500", icon: "⭐" };
    if (score >= 3) return { label: "Mixed Crowd", color: "bg-blue-500", icon: "👥" };
    return { label: "Tourist Spot", color: "bg-gray-500", icon: "📍" };
};

// Activity type icons
const getTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
        case "morning": return "🌅";
        case "afternoon": return "☀️";
        case "evening": return "🌆";
        case "night": return "🌙";
        default: return "📍";
    }
};

export function ActivityCard({
    activity,
    userTier = "free",
    onSave,
    onShare,
    className,
    compact = false,
}: ActivityCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
    const [imageError, setImageError] = useState(false);

    const scoreBadge = activity.localleyScore ? getScoreBadge(activity.localleyScore) : null;
    const canShowFullAddress = canSeeFullAddress(userTier);
    const canShowImages = hasFeature(userTier, "activityImages") !== "placeholder";
    const showDeals = hasFeature(userTier, "bookingDeals");

    // Get booking links
    const bookingLinks = getActivityBookingLinks({
        activityName: activity.name,
        city: activity.city,
        category: activity.category,
    });

    const hotelLinks = getHotelBookingLinks({ city: activity.city });

    // Display address based on tier
    const displayAddress = canShowFullAddress
        ? activity.address
        : activity.area || `${activity.city} Area`;

    // Placeholder image for free tier or when image fails
    const placeholderImage = `https://source.unsplash.com/400x300/?${encodeURIComponent(activity.category || "travel")},${encodeURIComponent(activity.city)}`;

    const handleAddressClick = () => {
        if (!canShowFullAddress) {
            setShowUpgradePrompt(true);
        }
    };

    if (compact) {
        return (
            <Card className={cn("overflow-hidden hover:shadow-md transition-shadow", className)}>
                <CardContent className="p-3">
                    <div className="flex gap-3">
                        {/* Compact Image */}
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                            {canShowImages && activity.image && !imageError ? (
                                <Image
                                    src={activity.image}
                                    alt={activity.name}
                                    fill
                                    className="object-cover"
                                    onError={() => setImageError(true)}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                                    <span className="text-2xl">{getTypeIcon(activity.type || "")}</span>
                                </div>
                            )}
                            {!canShowImages && activity.image && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                    <Lock className="h-4 w-4 text-white" />
                                </div>
                            )}
                        </div>

                        {/* Compact Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold text-sm truncate">{activity.name}</h4>
                                {scoreBadge && (
                                    <span className="text-xs">{scoreBadge.icon}</span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {displayAddress}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                {activity.duration && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                        <Clock className="h-3 w-3" />
                                        {activity.duration}
                                    </span>
                                )}
                                {activity.cost && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                        <DollarSign className="h-3 w-3" />
                                        {activity.cost}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className={cn("overflow-hidden hover:shadow-lg transition-all", className)}>
                {/* Image Section */}
                <div className="relative h-48 bg-gradient-to-br from-violet-100 to-indigo-100">
                    {canShowImages && activity.image && !imageError ? (
                        <Image
                            src={activity.image}
                            alt={activity.name}
                            fill
                            className="object-cover"
                            onError={() => setImageError(true)}
                        />
                    ) : canShowImages && !activity.image ? (
                        <Image
                            src={placeholderImage}
                            alt={activity.name}
                            fill
                            className="object-cover"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                            <div className="text-5xl mb-2">{getTypeIcon(activity.type || "")}</div>
                            <p className="text-sm text-muted-foreground">
                                {userTier === "free" ? (
                                    <button
                                        onClick={() => setShowUpgradePrompt(true)}
                                        className="flex items-center gap-1 text-violet-600 hover:underline"
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Unlock AI images
                                    </button>
                                ) : (
                                    "No image available"
                                )}
                            </p>
                        </div>
                    )}

                    {/* Blur overlay for free tier with image */}
                    {!canShowImages && activity.image && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-md flex flex-col items-center justify-center text-white">
                            <Lock className="h-8 w-8 mb-2" />
                            <p className="text-sm font-medium">Upgrade to see image</p>
                            <Button
                                size="sm"
                                variant="secondary"
                                className="mt-2"
                                onClick={() => setShowUpgradePrompt(true)}
                            >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Unlock
                            </Button>
                        </div>
                    )}

                    {/* Score Badge */}
                    {scoreBadge && (
                        <Badge
                            className={cn(
                                "absolute top-3 left-3 text-white shadow-lg",
                                scoreBadge.color
                            )}
                        >
                            {scoreBadge.icon} {scoreBadge.label}
                        </Badge>
                    )}

                    {/* Time/Type Badge */}
                    {activity.time && (
                        <Badge
                            variant="secondary"
                            className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm"
                        >
                            <Clock className="h-3 w-3 mr-1" />
                            {activity.time}
                        </Badge>
                    )}

                    {/* Category Badge */}
                    {activity.category && (
                        <Badge
                            variant="outline"
                            className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm text-xs"
                        >
                            {activity.category}
                        </Badge>
                    )}
                </div>

                <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="font-bold text-lg leading-tight">{activity.name}</h3>
                            <button
                                onClick={handleAddressClick}
                                className={cn(
                                    "flex items-center gap-1 text-sm mt-1",
                                    canShowFullAddress
                                        ? "text-muted-foreground"
                                        : "text-violet-600 hover:underline cursor-pointer"
                                )}
                            >
                                <MapPin className="h-3 w-3" />
                                {displayAddress}
                                {!canShowFullAddress && <Lock className="h-3 w-3 ml-1" />}
                            </button>
                        </div>
                        <div className="flex gap-1">
                            {onSave && (
                                <Button variant="ghost" size="icon" onClick={onSave} className="h-8 w-8">
                                    <Bookmark className="h-4 w-4" />
                                </Button>
                            )}
                            {onShare && (
                                <Button variant="ghost" size="icon" onClick={onShare} className="h-8 w-8">
                                    <Share2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    {activity.description && (
                        <p className={cn(
                            "text-sm text-muted-foreground",
                            !isExpanded && "line-clamp-2"
                        )}>
                            {activity.description}
                        </p>
                    )}

                    {/* Meta Info */}
                    <div className="flex flex-wrap gap-3 text-sm">
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
                        {activity.localleyScore && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                <span>{activity.localleyScore}/6</span>
                            </div>
                        )}
                    </div>

                    {/* Booking Links */}
                    <div className="pt-2 border-t space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {bookingLinks.slice(0, 2).map((link) => (
                                <BookingButton
                                    key={link.partner}
                                    link={link}
                                    showDeal={showDeals}
                                    activityName={activity.name}
                                />
                            ))}
                            {hotelLinks.map((link) => (
                                <BookingButton
                                    key={link.partner}
                                    link={link}
                                    showDeal={showDeals}
                                    activityName={`Hotels near ${activity.name}`}
                                    variant="outline"
                                />
                            ))}
                        </div>
                    </div>

                    {/* Expand/Collapse */}
                    {(activity.description && activity.description.length > 100) || bookingLinks.length > 2 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? (
                                <>
                                    <ChevronUp className="h-4 w-4 mr-1" />
                                    Show less
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    More options
                                </>
                            )}
                        </Button>
                    ) : null}

                    {/* Expanded Content */}
                    {isExpanded && (
                        <div className="space-y-3 pt-2 border-t animate-in slide-in-from-top-2">
                            {/* Additional booking links */}
                            {bookingLinks.length > 2 && (
                                <div className="flex flex-wrap gap-2">
                                    {bookingLinks.slice(2).map((link) => (
                                        <BookingButton
                                            key={link.partner}
                                            link={link}
                                            showDeal={showDeals}
                                            activityName={activity.name}
                                            variant="outline"
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Full address for premium */}
                            {canShowFullAddress && activity.address && (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-sm font-medium mb-1">Full Address</p>
                                    <p className="text-sm text-muted-foreground">{activity.address}</p>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 h-auto mt-1"
                                        onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(activity.address || "")}`, "_blank")}
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Open in Maps
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Upgrade Prompt Modal */}
            <UpgradePrompt
                open={showUpgradePrompt}
                onOpenChange={setShowUpgradePrompt}
                feature="activityImages"
                currentTier={userTier}
            />
        </>
    );
}
