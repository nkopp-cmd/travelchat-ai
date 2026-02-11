"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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

// Generate a gradient based on city name for consistent colors (fallback)
function getCityGradient(city: string): string {
    const gradients = [
        "from-rose-500 via-pink-500 to-orange-400",
        "from-violet-500 via-purple-500 to-indigo-400",
        "from-cyan-500 via-sky-500 to-blue-400",
        "from-emerald-500 via-teal-500 to-cyan-400",
        "from-amber-500 via-orange-500 to-yellow-400",
        "from-pink-500 via-rose-500 to-red-400",
        "from-indigo-500 via-violet-500 to-purple-400",
        "from-lime-500 via-emerald-500 to-green-400",
    ];
    const hash = city.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return gradients[hash % gradients.length];
}

// Get city image URL - curated Unsplash images for known cities
function getCityImageUrl(city: string): string | null {
    const cityLower = city.toLowerCase().trim();

    const cityImages: Record<string, string> = {
        // Asia
        "tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=200&q=80",
        "seoul": "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=200&q=80",
        "bangkok": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=200&q=80",
        "singapore": "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=200&q=80",
        "hong kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=200&q=80",
        "osaka": "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=200&q=80",
        "kyoto": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=200&q=80",
        "taipei": "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=200&q=80",
        "bali": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=200&q=80",
        "hanoi": "https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=200&q=80",
        "ho chi minh": "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=200&q=80",
        "kuala lumpur": "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=200&q=80",
        "manila": "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=200&q=80",
        // Europe
        "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200&q=80",
        "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=200&q=80",
        "rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=200&q=80",
        "barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=200&q=80",
        "amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=200&q=80",
        "berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=200&q=80",
        // Americas
        "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=200&q=80",
        "los angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=200&q=80",
        "san francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=200&q=80",
        "miami": "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=200&q=80",
        // Oceania
        "sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=200&q=80",
        "melbourne": "https://images.unsplash.com/photo-1514395462725-fb4566210144?w=200&q=80",
    };

    // Check for exact match or partial match
    for (const [key, url] of Object.entries(cityImages)) {
        if (cityLower.includes(key) || key.includes(cityLower)) {
            return url;
        }
    }

    return null;
}

// Story bubble component with loading state
function StoryBubble({ itinerary }: { itinerary: RecentItinerary }) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const shortCity = getShortCity(itinerary.city);
    const gradient = getCityGradient(itinerary.city || "default");
    const imageUrl = getCityImageUrl(itinerary.city || "");

    return (
        <Link
            href={`/itineraries/${itinerary.id}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
        >
            {/* Story Circle with premium ring animation */}
            <div className="relative">
                {/* Animated gradient ring */}
                <div className={cn(
                    "absolute inset-0 w-[68px] h-[68px] rounded-full",
                    "bg-gradient-to-br",
                    gradient,
                    "opacity-80 group-hover:opacity-100",
                    "group-hover:scale-105 transition-all duration-300",
                    "blur-[2px] group-hover:blur-[3px]"
                )} />

                {/* Main ring container */}
                <div className={cn(
                    "relative w-[68px] h-[68px] rounded-full p-[3px]",
                    "bg-gradient-to-br",
                    gradient,
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
                                        <div className={cn(
                                            "absolute inset-0 rounded-full bg-gradient-to-br",
                                            gradient,
                                            "opacity-30 animate-pulse"
                                        )} />
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
                                <div className={cn(
                                    "w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center",
                                    gradient,
                                    "group-hover:brightness-110 transition-all duration-300"
                                )}>
                                    <span className="text-white font-bold text-xl drop-shadow-md">
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
                    "bg-gradient-to-r from-violet-600 to-indigo-600",
                    "text-white text-[10px] font-bold",
                    "px-2 py-0.5 rounded-full",
                    "shadow-lg shadow-violet-500/30",
                    "border border-white/20",
                    "group-hover:scale-110 transition-transform duration-300"
                )}>
                    {itinerary.days}d
                </div>
            </div>

            {/* Location Name */}
            <span className="text-xs font-medium text-foreground truncate max-w-[68px] text-center group-hover:text-violet-600 transition-colors">
                {getShortTitle(itinerary.title, itinerary.city)}
            </span>

            {/* Relative Time with subtle styling */}
            <span className="text-[10px] text-muted-foreground/70">
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
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Recent Trips
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
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
                            "absolute inset-0 w-[68px] h-[68px] rounded-full",
                            "bg-gradient-to-br from-violet-500 to-indigo-500",
                            "opacity-0 group-hover:opacity-40",
                            "blur-lg transition-opacity duration-300"
                        )} />

                        <div className={cn(
                            "relative w-[68px] h-[68px] rounded-full",
                            "border-2 border-dashed",
                            "border-muted-foreground/20 group-hover:border-violet-400",
                            "flex items-center justify-center",
                            "bg-muted/30 group-hover:bg-violet-50 dark:group-hover:bg-violet-950/30",
                            "transition-all duration-300",
                            "group-hover:scale-105"
                        )}>
                            <div className={cn(
                                "h-10 w-10 rounded-full",
                                "bg-gradient-to-br from-violet-500 to-indigo-500",
                                "flex items-center justify-center",
                                "opacity-60 group-hover:opacity-100",
                                "shadow-lg shadow-violet-500/20",
                                "transition-all duration-300",
                                "group-hover:scale-110"
                            )}>
                                <Plus className="h-5 w-5 text-white" />
                            </div>
                        </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-violet-600 transition-colors">
                        New Trip
                    </span>
                    <span className="text-[10px] text-transparent">
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
                                "absolute inset-0 w-[68px] h-[68px] rounded-full",
                                "bg-gradient-to-br from-emerald-500 to-teal-500",
                                "opacity-0 group-hover:opacity-30",
                                "blur-lg transition-opacity duration-300"
                            )} />

                            <div className={cn(
                                "relative w-[68px] h-[68px] rounded-full",
                                "bg-muted/50 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/30",
                                "flex items-center justify-center",
                                "border border-border/50 group-hover:border-emerald-300/50",
                                "transition-all duration-300",
                                "group-hover:scale-105"
                            )}>
                                <MapPin className="h-6 w-6 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
                            </div>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-emerald-600 transition-colors">
                            View All
                        </span>
                        <span className="text-[10px] text-transparent">
                            &nbsp;
                        </span>
                    </Link>
                )}
            </div>
        </div>
    );
}
