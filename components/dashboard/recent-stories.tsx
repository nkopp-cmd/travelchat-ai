"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, MapPin, Sparkles } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { getCityImageUrl } from "@/lib/city-images";

interface RecentItinerary {
    id: string;
    title: string;
    city: string;
    days: number;
    created_at: string;
}

interface RecentStoriesProps {
    itineraries: RecentItinerary[];
}

// Get relative time string
function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
}

// Get short city name (first part before comma)
function getShortCity(city: string | null | undefined): string {
    if (!city || city.toLowerCase() === "unknown city") return "Trip";
    return city.split(",")[0].trim();
}

// Get short title (location-focused, max 2 words)
function getShortTitle(title: string, city: string | null | undefined): string {
    const shortCity = getShortCity(city);
    // If title is already short (2 words or less), use it
    const words = title.split(/\s+/);
    if (words.length <= 2) return title;
    // Otherwise use the city name
    return shortCity;
}

// Story bubble component with loading state
function StoryBubble({ itinerary }: { itinerary: RecentItinerary }) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const shortCity = getShortCity(itinerary.city);
    const imageUrl = getCityImageUrl(itinerary.city || "", { width: 200 });

    return (
        <Link
            href={`/itineraries/${itinerary.id}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
        >
            {/* Story Circle with premium ring animation */}
            <div className="relative">
                {/* Main ring container */}
                <div className={cn(
                    "relative w-[68px] h-[68px] rounded-full p-[3px]",
                    "bg-primary",
                    "group-hover:scale-105 transition-transform duration-300"
                )}>
                    {/* Inner white border */}
                    <div className="w-full h-full rounded-full bg-background p-[2px]">
                        {/* Image container */}
                        <div className="w-full h-full rounded-full relative overflow-hidden">
                            {imageUrl ? (
                                <>
                                    {/* Skeleton loader */}
                                    {!imageLoaded && (
                                        <div className="absolute inset-0 rounded-full bg-raised animate-pulse" />
                                    )}
                                    <Image
                                        src={imageUrl}
                                        alt={shortCity}
                                        fill
                                        className={cn(
                                            "object-cover transition-all duration-500",
                                            "group-hover:scale-110",
                                            imageLoaded ? "opacity-100" : "opacity-0"
                                        )}
                                        sizes="60px"
                                        onLoad={() => setImageLoaded(true)}
                                    />
                                </>
                            ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-full bg-raised">
                                    <span className="text-xl font-bold text-foreground">
                                        {shortCity.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Days badge with glow */}
                <div className={cn(
                    "absolute -bottom-0.5 -right-0.5",
                    "bg-primary text-primary-foreground",
                    "text-xs font-bold",
                    "px-2 py-0.5 rounded-full",
                    "group-hover:scale-110 transition-transform duration-300"
                )}>
                    {itinerary.days}d
                </div>
            </div>

            {/* Location Name */}
            <span className="text-xs font-medium text-foreground truncate max-w-[68px] text-center group-hover:text-primary transition-colors">
                {getShortTitle(itinerary.title, itinerary.city)}
            </span>

            {/* Relative Time with subtle styling */}
            <span className="text-xs text-muted-foreground">
                {getRelativeTime(itinerary.created_at)}
            </span>
        </Link>
    );
}

export function RecentStories({ itineraries }: RecentStoriesProps) {
    if (itineraries.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3 py-2">
            {/* Section Label with premium styling */}
            <div className="flex items-center gap-2 px-1">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-muted-foreground">
                    Recent Trips
                </span>
                <div className="flex-1" aria-hidden="true" />
            </div>

            <div className="flex items-center gap-6 overflow-x-auto pb-4 scrollbar-hide">
                {/* Recent Itineraries using StoryBubble component */}
                {itineraries.map((itinerary) => (
                    <StoryBubble key={itinerary.id} itinerary={itinerary} />
                ))}

                {/* Premium New Itinerary Button */}
                <Link
                    href="/itineraries/new"
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
                >
                    <div className="relative">
                        {/* Glow effect on hover */}
                        <div className={cn(
                            "relative w-[68px] h-[68px] rounded-full",
                            "flex items-center justify-center",
                            "bg-raised group-hover:bg-primary/15",
                            "transition-all duration-300",
                            "group-hover:scale-105"
                        )}>
                            <div className={cn(
                                "h-10 w-10 rounded-full",
                                "bg-primary text-primary-foreground",
                                "flex items-center justify-center",
                                "transition-all duration-300",
                                "group-hover:scale-110"
                            )}>
                                <Plus className="h-5 w-5" aria-hidden="true" />
                            </div>
                        </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                        New Trip
                    </span>
                    <span className="text-xs text-transparent" aria-hidden="true">
                        &nbsp;
                    </span>
                </Link>

                {/* Premium View All Link */}
                {itineraries.length >= 3 && (
                    <Link
                        href="/itineraries"
                        className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
                    >
                        <div className="relative">
                            {/* Subtle glow on hover */}
                            <div className={cn(
                                "relative w-[68px] h-[68px] rounded-full",
                                "bg-raised group-hover:bg-primary/15",
                                "flex items-center justify-center",
                                "transition-all duration-300",
                                "group-hover:scale-105"
                            )}>
                                <MapPin className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            View All
                        </span>
                        <span className="text-xs text-transparent" aria-hidden="true">
                            &nbsp;
                        </span>
                    </Link>
                )}
            </div>
        </div>
    );
}
