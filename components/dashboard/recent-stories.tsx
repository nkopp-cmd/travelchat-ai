"use client";

import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
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

// Generate a gradient based on city name for consistent colors
function getCityGradient(city: string): string {
    const gradients = [
        "from-rose-400 to-orange-300",
        "from-violet-400 to-purple-300",
        "from-cyan-400 to-blue-300",
        "from-emerald-400 to-teal-300",
        "from-amber-400 to-yellow-300",
        "from-pink-400 to-rose-300",
        "from-indigo-400 to-violet-300",
        "from-lime-400 to-green-300",
    ];
    const hash = city.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return gradients[hash % gradients.length];
}

export function RecentStories({ itineraries }: RecentStoriesProps) {
    if (itineraries.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            {/* Section Label for Clarity */}
            <div className="flex items-center gap-2 px-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Recent Itineraries
                </span>
            </div>

            <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {/* Recent Itineraries */}
                {itineraries.map((itinerary) => {
                const shortCity = getShortCity(itinerary.city);
                const gradient = getCityGradient(itinerary.city || "default");

                return (
                    <Link
                        key={itinerary.id}
                        href={`/itineraries/${itinerary.id}`}
                        className="flex flex-col items-center gap-1 flex-shrink-0 group"
                    >
                        {/* Story Circle */}
                        <div className="relative">
                            {/* Gradient Ring */}
                            <div className={cn(
                                "w-16 h-16 rounded-full p-0.5 bg-gradient-to-br",
                                gradient,
                                "group-hover:scale-105 transition-transform"
                            )}>
                                {/* Inner Circle */}
                                <div className="w-full h-full rounded-full bg-background p-0.5">
                                    <div className={cn(
                                        "w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center",
                                        gradient,
                                        "opacity-80"
                                    )}>
                                        <span className="text-white font-bold text-lg">
                                            {shortCity.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Days badge */}
                            <div className="absolute -bottom-0.5 -right-0.5 bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {itinerary.days}d
                            </div>
                        </div>

                        {/* Location Name */}
                        <span className="text-xs font-medium text-foreground truncate max-w-[64px] text-center">
                            {getShortTitle(itinerary.title, itinerary.city)}
                        </span>

                        {/* Relative Time */}
                        <span className="text-[10px] text-muted-foreground">
                            {getRelativeTime(itinerary.created_at)}
                        </span>
                    </Link>
                );
            })}

                {/* New Itinerary Button */}
                <Link
                    href="/itineraries/new"
                    className="flex flex-col items-center gap-1 flex-shrink-0 group"
                >
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center group-hover:border-violet-400 group-hover:bg-violet-50 dark:group-hover:bg-violet-950/20 transition-all">
                        <Plus className="h-6 w-6 text-muted-foreground group-hover:text-violet-600 transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-violet-600 transition-colors">
                        New
                    </span>
                    <span className="text-[10px] text-transparent">
                        &nbsp;
                    </span>
                </Link>

                {/* View All Link */}
                {itineraries.length >= 3 && (
                    <Link
                        href="/itineraries"
                        className="flex flex-col items-center gap-1 flex-shrink-0 group"
                    >
                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-muted transition-colors">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
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
