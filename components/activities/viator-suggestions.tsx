"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Star,
    Clock,
    ExternalLink,
    ChevronRight,
    Sparkles,
    Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscriptionTier, hasFeature } from "@/lib/subscription";

interface ViatorActivity {
    id: string;
    productCode: string;
    title: string;
    shortDescription?: string;
    thumbnailUrl?: string;
    priceFrom: number;
    currency: string;
    rating?: number;
    reviewCount?: number;
    duration?: string;
    category?: string;
    bookingUrl: string;
}

interface ViatorSuggestionsProps {
    city: string;
    category?: string;
    userTier?: SubscriptionTier;
    className?: string;
    limit?: number;
}

export function ViatorSuggestions({
    city,
    category,
    userTier = "free",
    className,
    limit = 4,
}: ViatorSuggestionsProps) {
    const [activities, setActivities] = useState<ViatorActivity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const showDeals = hasFeature(userTier, "bookingDeals");

    useEffect(() => {
        async function fetchActivities() {
            setIsLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams({
                    destination: city,
                    limit: String(limit),
                });
                if (category) {
                    params.set("category", category);
                }

                const response = await fetch(`/api/viator/search?${params}`);
                if (!response.ok) {
                    throw new Error("Failed to fetch activities");
                }

                const data = await response.json();
                if (data.success && data.data?.activities) {
                    setActivities(data.data.activities);
                }
            } catch (err) {
                console.error("Error fetching Viator activities:", err);
                setError("Unable to load activity suggestions");
            } finally {
                setIsLoading(false);
            }
        }

        fetchActivities();
    }, [city, category, limit]);

    const handleBookClick = async (activity: ViatorActivity) => {
        // Track affiliate click
        try {
            await fetch("/api/affiliates/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    partner: "viator",
                    activityName: activity.title,
                    productCode: activity.productCode,
                    eventType: "click",
                }),
            });
        } catch {
            // Ignore tracking errors
        }

        // Open booking URL
        window.open(activity.bookingUrl, "_blank");
    };

    if (error) {
        return null; // Silently fail - suggestions are optional
    }

    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5" />
                    Book Tours & Activities in {city}
                </CardTitle>
                <p className="text-sm text-emerald-100">
                    Curated experiences from our travel partners
                </p>
            </CardHeader>
            <CardContent className="p-4">
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[...Array(limit)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-32 w-full rounded-lg" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ))}
                    </div>
                ) : activities.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                        No activities found for {city}
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="group relative rounded-lg border bg-card hover:shadow-md transition-all overflow-hidden"
                            >
                                {/* Activity Image */}
                                <div className="relative h-32 bg-muted">
                                    {activity.thumbnailUrl ? (
                                        <Image
                                            src={activity.thumbnailUrl}
                                            alt={activity.title}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            sizes="(max-width: 640px) 100vw, 50vw"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100">
                                            <Sparkles className="h-8 w-8 text-emerald-500" />
                                        </div>
                                    )}

                                    {/* Rating Badge */}
                                    {activity.rating && (
                                        <Badge
                                            className="absolute top-2 left-2 bg-white/90 text-black"
                                        >
                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 mr-1" />
                                            {activity.rating.toFixed(1)}
                                            {activity.reviewCount && (
                                                <span className="text-muted-foreground ml-1">
                                                    ({activity.reviewCount})
                                                </span>
                                            )}
                                        </Badge>
                                    )}

                                    {/* Category Badge */}
                                    {activity.category && (
                                        <Badge
                                            variant="secondary"
                                            className="absolute top-2 right-2 text-xs"
                                        >
                                            {activity.category}
                                        </Badge>
                                    )}
                                </div>

                                {/* Activity Details */}
                                <div className="p-3 space-y-2">
                                    <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-emerald-600 transition-colors">
                                        {activity.title}
                                    </h4>

                                    {activity.shortDescription && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {activity.shortDescription}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        {activity.duration && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {activity.duration}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-lg font-bold text-emerald-600">
                                                ${activity.priceFrom}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                / person
                                            </span>
                                            {showDeals && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-2 text-xs border-emerald-500 text-emerald-600"
                                                >
                                                    <Tag className="h-2.5 w-2.5 mr-1" />
                                                    Best Price
                                                </Badge>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-emerald-600 hover:bg-emerald-700 text-xs px-3"
                                            onClick={() => handleBookClick(activity)}
                                        >
                                            Book
                                            <ExternalLink className="h-3 w-3 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* View More Link */}
                {activities.length > 0 && (
                    <div className="mt-4 pt-4 border-t text-center">
                        <Button
                            variant="ghost"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => {
                                const viatorUrl = `https://www.viator.com/searchResults/all?text=${encodeURIComponent(city)}&pid=localley`;
                                window.open(viatorUrl, "_blank");
                            }}
                        >
                            View all {city} activities on Viator
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                )}

                {/* Partner Attribution */}
                <p className="text-xs text-center text-muted-foreground mt-2">
                    Powered by Viator - earn rewards when you book
                </p>
            </CardContent>
        </Card>
    );
}
