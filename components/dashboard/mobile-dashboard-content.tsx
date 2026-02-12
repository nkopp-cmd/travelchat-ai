"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Plus, Compass, Sparkles, Calendar, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCityImageUrl } from "@/lib/city-images";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";

interface RecentItinerary {
    id: string;
    title: string;
    city: string;
    days: number;
    created_at: string;
}

interface MobileDashboardContentProps {
    itineraries: RecentItinerary[];
}

// Get relative time string
function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

// Generate a gradient based on city name (fallback)
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

// Trip card component with loading state
function TripCard({ itinerary }: { itinerary: RecentItinerary }) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const imageUrl = getCityImageUrl(itinerary.city || "", { width: 200 });
    const gradient = getCityGradient(itinerary.city || "default");

    return (
        <Link
            href={`/itineraries/${itinerary.id}`}
            className={cn(
                "block rounded-2xl overflow-hidden group",
                "bg-card/95 backdrop-blur-sm",
                "border border-border/50",
                "hover:shadow-xl hover:shadow-violet-500/10",
                "hover:border-violet-400/50",
                "transition-all duration-300",
                "active:scale-[0.98]"
            )}
        >
            <div className="flex items-center gap-4 p-4">
                {/* City image with loading state */}
                <div className={cn(
                    "h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 relative",
                    !imageUrl && "bg-gradient-to-br flex items-center justify-center",
                    !imageUrl && gradient
                )}>
                    {imageUrl ? (
                        <>
                            {!imageLoaded && (
                                <div className={cn(
                                    "absolute inset-0 bg-gradient-to-br",
                                    gradient,
                                    "animate-pulse"
                                )} />
                            )}
                            <Image
                                src={imageUrl}
                                alt={itinerary.city || "Trip"}
                                fill
                                className={cn(
                                    "object-cover transition-all duration-500",
                                    "group-hover:scale-110",
                                    imageLoaded ? "opacity-100" : "opacity-0"
                                )}
                                sizes="56px"
                                onLoad={() => setImageLoaded(true)}
                            />
                        </>
                    ) : (
                        <span className="text-white font-bold text-xl drop-shadow-md">
                            {(itinerary.city || "T").charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Trip info */}
                <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate group-hover:text-violet-600 transition-colors">
                        {itinerary.title}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {itinerary.city || "Trip"}
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {itinerary.days}d
                        </span>
                    </div>
                </div>

                {/* Time and arrow */}
                <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground/70">
                        {getRelativeTime(itinerary.created_at)}
                    </span>
                    <ArrowRight className={cn(
                        "h-4 w-4 text-muted-foreground/50",
                        "group-hover:text-violet-500 group-hover:translate-x-1",
                        "transition-all duration-300"
                    )} />
                </div>
            </div>
        </Link>
    );
}

export function MobileDashboardContent({ itineraries }: MobileDashboardContentProps) {
    const hasItineraries = itineraries.length > 0;

    return (
        <div className="w-full px-4 py-4 space-y-6">
            {/* Welcome Section with premium styling */}
            <div className="text-center mb-6">
                <div className="relative inline-flex mb-4">
                    {/* Glow effect */}
                    <div className="absolute inset-0 h-18 w-18 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 blur-xl opacity-40" />
                    <div className={cn(
                        "relative h-18 w-18 rounded-2xl",
                        "bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600",
                        "flex items-center justify-center",
                        "shadow-2xl shadow-violet-500/40"
                    )}>
                        <Sparkles className="h-8 w-8 text-white" />
                    </div>
                </div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600">
                    {hasItineraries ? "Welcome back!" : "Hey there!"}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                    {hasItineraries
                        ? "Continue exploring or plan a new adventure"
                        : "Ready to discover hidden gems?"}
                </p>
            </div>

            {/* Premium CTA - Create New Itinerary */}
            <Link
                href="/itineraries/new"
                className={cn(
                    "block w-full rounded-2xl p-5 group",
                    "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600",
                    "text-white",
                    "shadow-xl shadow-violet-500/30",
                    "hover:shadow-2xl hover:shadow-violet-500/40",
                    "transition-all duration-300",
                    "active:scale-[0.98]",
                    "relative overflow-hidden"
                )}
            >
                {/* Animated shine effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </div>

                <div className="relative flex items-center gap-4">
                    <div className={cn(
                        "h-14 w-14 rounded-xl",
                        "bg-white/20 backdrop-blur-sm",
                        "flex items-center justify-center",
                        "group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300"
                    )}>
                        <Plus className="h-7 w-7" />
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-lg">Create New Itinerary</div>
                        <div className="text-sm text-white/80">AI-powered local recommendations</div>
                    </div>
                    <ArrowRight className="h-6 w-6 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
            </Link>

            {/* Recent Itineraries with premium cards */}
            {hasItineraries && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                                <Calendar className="h-3 w-3 text-white" />
                            </div>
                            <h2 className="font-semibold text-lg">Recent Trips</h2>
                        </div>
                        <Link
                            href="/itineraries"
                            className={cn(
                                "text-sm text-violet-600 hover:text-violet-700",
                                "flex items-center gap-1 group"
                            )}
                        >
                            View all
                            <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {itineraries.slice(0, 3).map((itinerary) => (
                            <TripCard key={itinerary.id} itinerary={itinerary} />
                        ))}
                    </div>
                </div>
            )}

            {/* Explore Cities with premium grid */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Compass className="h-3 w-3 text-white" />
                    </div>
                    <h2 className="font-semibold text-lg">
                        {hasItineraries ? "Explore More" : "Start Exploring"}
                    </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {SUPPORTED_CITIES.map((city, idx) => (
                        <Link
                            key={city.name}
                            href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                            className={cn(
                                "rounded-2xl p-4 group",
                                "bg-card/95 backdrop-blur-sm",
                                "border border-border/50",
                                "hover:border-violet-400/50",
                                "hover:shadow-lg hover:shadow-violet-500/10",
                                "transition-all duration-300",
                                "active:scale-[0.97]"
                            )}
                        >
                            <div className="text-3xl mb-2 transform group-hover:scale-110 transition-transform duration-300">
                                {city.emoji}
                            </div>
                            <div className="font-semibold group-hover:text-violet-600 transition-colors">
                                {city.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{city.country}</div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Premium Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    href="/spots"
                    className={cn(
                        "rounded-2xl p-4 group",
                        "bg-gradient-to-br from-emerald-500/10 to-teal-500/5",
                        "border border-emerald-500/20",
                        "hover:border-emerald-500/40",
                        "hover:shadow-lg hover:shadow-emerald-500/10",
                        "transition-all duration-300",
                        "active:scale-[0.97]"
                    )}
                >
                    <div className={cn(
                        "h-12 w-12 rounded-xl mb-3",
                        "bg-gradient-to-br from-emerald-600 to-teal-600",
                        "flex items-center justify-center",
                        "shadow-lg shadow-emerald-500/30",
                        "group-hover:scale-110 transition-transform duration-300"
                    )}>
                        <Compass className="h-6 w-6 text-white" />
                    </div>
                    <div className="font-semibold group-hover:text-emerald-600 transition-colors">
                        Browse Spots
                    </div>
                    <div className="text-xs text-muted-foreground">Discover local gems</div>
                </Link>
                <Link
                    href="/templates"
                    className={cn(
                        "rounded-2xl p-4 group",
                        "bg-gradient-to-br from-amber-500/10 to-orange-500/5",
                        "border border-amber-500/20",
                        "hover:border-amber-500/40",
                        "hover:shadow-lg hover:shadow-amber-500/10",
                        "transition-all duration-300",
                        "active:scale-[0.97]"
                    )}
                >
                    <div className={cn(
                        "h-12 w-12 rounded-xl mb-3",
                        "bg-gradient-to-br from-amber-500 to-orange-500",
                        "flex items-center justify-center",
                        "shadow-lg shadow-amber-500/30",
                        "group-hover:scale-110 transition-transform duration-300"
                    )}>
                        <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <div className="font-semibold group-hover:text-amber-600 transition-colors">
                        Templates
                    </div>
                    <div className="text-xs text-muted-foreground">Pre-made trip ideas</div>
                </Link>
            </div>

            {/* Bottom spacing for FAB */}
            <div className="h-24" />
        </div>
    );
}
