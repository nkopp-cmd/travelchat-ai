"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Plus, Compass, Sparkles, Calendar, ChevronRight, ArrowRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { getCityImageUrl } from "@/lib/city-images";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";
import { CityImageAvatar } from "@/components/ui/city-image";

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

// Trip card component with loading state
function TripCard({ itinerary }: { itinerary: RecentItinerary }) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const imageUrl = getCityImageUrl(itinerary.city || "", { width: 200 });

    return (
        <Link
            href={`/itineraries/${itinerary.id}`}
            className={cn(
                "block rounded-2xl overflow-hidden group",
                "bg-surface shadow-surface hover:bg-raised",
                "transition-colors duration-300",
                "active:scale-[0.98]"
            )}
        >
            <div className="flex items-center gap-4 p-4">
                {/* City image with loading state */}
                <div className={cn(
                    "h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 relative",
                    !imageUrl && "flex items-center justify-center bg-raised"
                )}>
                    {imageUrl ? (
                        <>
                            {!imageLoaded && (
                                <div className="absolute inset-0 animate-pulse bg-raised" />
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
                        <span className="text-foreground font-bold text-xl drop-shadow-md">
                            {(itinerary.city || "T").charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Trip info */}
                <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate group-hover:text-primary transition-colors">
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
                        "group-hover:text-primary group-hover:translate-x-1",
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
        <div className="w-full space-y-4 px-4 pb-6 pt-6">
            <PageHeader
                eyebrow="Dashboard"
                eyebrowIcon={Sparkles}
                title={hasItineraries ? "Welcome back" : "Start with one good local plan"}
                lede={hasItineraries
                    ? "Continue a trip, browse real spots, or ask Alley for a tighter route."
                    : "Pick a city or use Alley to build the first version for you."}
            />

            <Link
                href="/itineraries/new"
                className="group flex min-h-11 w-full items-center gap-3 rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised"
            >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Plus className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Create itinerary</span>
                    <span className="block text-[13px] text-muted-foreground">One guided flow, local-first spots</span>
                </span>
                <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>

            {/* Recent Itineraries with premium cards */}
            {hasItineraries && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
                            <h2 className="font-semibold text-lg">Recent Trips</h2>
                        </div>
                        <Link
                            href="/itineraries"
                            className={cn(
                                "text-sm text-primary hover:text-foreground",
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
                    <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h2 className="font-semibold text-lg">
                        {hasItineraries ? "Explore More" : "Start Exploring"}
                    </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {SUPPORTED_CITIES.slice(0, 8).map((city) => (
                        <Link
                            key={city.name}
                            href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                            className={cn(
                                "group relative min-h-[96px] overflow-hidden rounded-xl p-3",
                                " bg-raised backdrop-blur-xl",
                                "transition-all duration-300",
                                "active:scale-[0.97]"
                            )}
                        >
                            <CityImageAvatar
                                city={city.name}
                                className="absolute inset-0 h-full w-full rounded-none"
                                imageClassName="transition duration-500 group-hover:scale-105"
                                sizes="50vw"
                                imageWidth={900}
                                quality={90}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
                            <div className="relative mt-9">
                                <div className="truncate font-semibold text-white">
                                    {city.name}
                                </div>
                                <div className="text-xs text-muted-foreground">{city.country}</div>
                            </div>
                        </Link>
                    ))}
                </div>
                <Link
                    href="/spots"
                    className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-raised text-sm font-semibold text-foreground transition hover:bg-primary/10"
                >
                    Browse all cities
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
            </div>

            {/* Premium Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    href="/spots"
                    className={cn(
                        "rounded-2xl p-3 group",
                        "bg-surface shadow-surface hover:bg-raised",
                        "transition-colors duration-300",
                        "active:scale-[0.97]"
                    )}
                >
                    <div className={cn(
                        "h-10 w-10 rounded-xl mb-2",
                        "bg-primary/15 text-primary",
                        "flex items-center justify-center",
                        "group-hover:scale-110 transition-transform duration-300"
                    )}>
                        <Compass className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="font-semibold transition-colors group-hover:text-primary">
                        Browse Spots
                    </div>
                    <div className="text-xs text-muted-foreground">Discover local gems</div>
                </Link>
                <Link
                    href="/templates"
                    className={cn(
                        "rounded-2xl p-3 group",
                        "bg-surface shadow-surface hover:bg-raised",
                        "transition-colors duration-300",
                        "active:scale-[0.97]"
                    )}
                >
                    <div className={cn(
                        "h-10 w-10 rounded-xl mb-2",
                        "bg-primary/15 text-primary",
                        "flex items-center justify-center",
                        "group-hover:scale-110 transition-transform duration-300"
                    )}>
                        <Sparkles className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="font-semibold transition-colors group-hover:text-primary">
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
