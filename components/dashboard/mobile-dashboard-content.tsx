"use client";

import Link from "next/link";
import { MapPin, Plus, Compass, Sparkles, Calendar, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
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

// Generate a gradient based on city name
function getCityGradient(city: string): string {
    const gradients = [
        "from-rose-500 to-orange-400",
        "from-violet-500 to-purple-400",
        "from-cyan-500 to-blue-400",
        "from-emerald-500 to-teal-400",
        "from-amber-500 to-yellow-400",
        "from-pink-500 to-rose-400",
        "from-indigo-500 to-violet-400",
        "from-lime-500 to-green-400",
    ];
    const hash = city.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return gradients[hash % gradients.length];
}

export function MobileDashboardContent({ itineraries }: MobileDashboardContentProps) {
    const hasItineraries = itineraries.length > 0;

    return (
        <div className="w-full px-4 py-4 space-y-6">
            {/* Welcome Section */}
            <div className="text-center mb-6">
                <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-violet-500/30">
                    <span className="text-2xl font-bold text-white">A</span>
                </div>
                <h1 className="text-xl font-bold">
                    {hasItineraries ? "Welcome back!" : "Hey there!"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {hasItineraries
                        ? "Continue exploring or plan a new adventure"
                        : "Ready to discover hidden gems?"}
                </p>
            </div>

            {/* Quick Action - Create New Itinerary */}
            <Link
                href="/itineraries/new"
                className="block w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl p-4 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all active:scale-[0.98]"
            >
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                        <Plus className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                        <div className="font-semibold">Create New Itinerary</div>
                        <div className="text-sm text-white/80">Get personalized local recommendations</div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/60" />
                </div>
            </Link>

            {/* Recent Itineraries */}
            {hasItineraries && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-semibold text-lg">Recent Trips</h2>
                        <Link
                            href="/itineraries"
                            className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1"
                        >
                            View all <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {itineraries.slice(0, 3).map((itinerary) => (
                            <Link
                                key={itinerary.id}
                                href={`/itineraries/${itinerary.id}`}
                                className="block bg-card border border-border/50 rounded-xl p-4 hover:border-violet-500/30 hover:shadow-md transition-all active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center",
                                        getCityGradient(itinerary.city || "default")
                                    )}>
                                        <span className="text-white font-bold text-lg">
                                            {(itinerary.city || "T").charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{itinerary.title}</div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {itinerary.city || "Trip"}
                                            </span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {itinerary.days} days
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {getRelativeTime(itinerary.created_at)}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Explore Cities */}
            <div>
                <h2 className="font-semibold text-lg mb-3">
                    {hasItineraries ? "Explore More" : "Start Exploring"}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                    {SUPPORTED_CITIES.map((city) => (
                        <Link
                            key={city.name}
                            href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                            className="bg-card border border-border/50 rounded-xl p-4 hover:border-violet-500/30 hover:shadow-md transition-all active:scale-[0.98]"
                        >
                            <div className="text-2xl mb-2">{city.emoji}</div>
                            <div className="font-medium">{city.name}</div>
                            <div className="text-xs text-muted-foreground">{city.country}</div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    href="/spots"
                    className="bg-card border border-border/50 rounded-xl p-4 hover:border-emerald-500/30 hover:shadow-md transition-all active:scale-[0.98]"
                >
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-2">
                        <Compass className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="font-medium">Browse Spots</div>
                    <div className="text-xs text-muted-foreground">Discover local gems</div>
                </Link>
                <Link
                    href="/templates"
                    className="bg-card border border-border/50 rounded-xl p-4 hover:border-amber-500/30 hover:shadow-md transition-all active:scale-[0.98]"
                >
                    <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-2">
                        <Sparkles className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="font-medium">Templates</div>
                    <div className="text-xs text-muted-foreground">Pre-made trip ideas</div>
                </Link>
            </div>

            {/* Bottom spacing for FAB */}
            <div className="h-24" />
        </div>
    );
}
