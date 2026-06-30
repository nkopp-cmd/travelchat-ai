"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { LocalleyScaleIndicator } from "./localley-scale";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { MapPin, TrendingUp, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCityImageUrl } from "@/lib/city-images";

const PLACEHOLDER_IMAGE = "/images/placeholders/default.svg";
const KNOWN_CITY_COORDS: Array<{ city: string; lat: [number, number]; lng: [number, number] }> = [
    { city: "Seoul", lat: [37.35, 37.75], lng: [126.75, 127.25] },
    { city: "Tokyo", lat: [35.45, 35.9], lng: [139.45, 140] },
    { city: "Bangkok", lat: [13.45, 14.1], lng: [100.25, 100.9] },
    { city: "Singapore", lat: [1.15, 1.5], lng: [103.55, 104.1] },
    { city: "Osaka", lat: [34.5, 34.85], lng: [135.25, 135.75] },
    { city: "Kyoto", lat: [34.85, 35.2], lng: [135.55, 136] },
    { city: "Busan", lat: [35, 35.35], lng: [128.85, 129.35] },
    { city: "Jeju", lat: [33.1, 33.65], lng: [126.05, 126.95] },
    { city: "Hong Kong", lat: [22.1, 22.6], lng: [113.75, 114.45] },
    { city: "Taipei", lat: [24.85, 25.25], lng: [121.25, 121.8] },
    { city: "Hanoi", lat: [20.8, 21.25], lng: [105.65, 106.15] },
    { city: "Ho Chi Minh", lat: [10.6, 11], lng: [106.45, 106.95] },
    { city: "Kuala Lumpur", lat: [2.95, 3.35], lng: [101.5, 101.85] },
    { city: "Bali", lat: [-8.9, -8.05], lng: [114.85, 115.65] },
];

const LOCATION_KEYWORDS: Array<{ city: string; terms: string[] }> = [
    { city: "Kuala Lumpur", terms: ["jalan hang lekir", "petaling street", "bukit bintang", "chow kit"] },
    { city: "Bangkok", terms: ["don muang", "taopoon", "ari", "thonglor", "sukhumvit"] },
    { city: "Busan", terms: ["ilgwang", "haeundae", "gwangalli", "seomyeon"] },
    { city: "Kyoto", terms: ["gion", "arashiyama", "temple courtyard", "shrine"] },
    { city: "Seoul", terms: ["euljiro", "hongdae", "mullae", "haengdang", "hongje", "hwarang", "daebang", "hyehwa"] },
    { city: "Tokyo", terms: ["shinjuku", "kita city", "harmonica yokocho", "shimokitazawa", "koenji"] },
];

interface SpotCardProps {
    spot: Spot;
    compact?: boolean;
    /** Set to true for above-the-fold images (first 6 cards) */
    priority?: boolean;
}

function isPlaceholderImage(src: string | undefined) {
    return !src || src.startsWith("/images/placeholders/");
}

function inferSpotCity(spot: Spot): string | null {
    const haystack = `${spot.name} ${spot.location.address}`.toLowerCase();
    const textMatch = KNOWN_CITY_COORDS.find(({ city }) => haystack.includes(city.toLowerCase()));
    if (textMatch) return textMatch.city;

    const keywordMatch = LOCATION_KEYWORDS.find(({ terms }) =>
        terms.some((term) => haystack.includes(term))
    );
    if (keywordMatch) return keywordMatch.city;

    const { lat, lng } = spot.location;
    const coordMatch = KNOWN_CITY_COORDS.find(
        ({ lat: latRange, lng: lngRange }) =>
            lat >= latRange[0] && lat <= latRange[1] && lng >= lngRange[0] && lng <= lngRange[1]
    );

    return coordMatch?.city ?? null;
}

function getInitialImage(spot: Spot) {
    const realPhoto = spot.photos.find((photo) => !isPlaceholderImage(photo));
    if (realPhoto) return realPhoto;

    const city = inferSpotCity(spot);
    const cityImage = city ? getCityImageUrl(city, { width: 1200, height: 900, quality: 90 }) : null;
    return cityImage ?? spot.photos[0] ?? PLACEHOLDER_IMAGE;
}

export function SpotCard({ spot, compact = false, priority = false }: SpotCardProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageSrc, setImageSrc] = useState(() => getInitialImage(spot));

    const handleImageError = () => {
        setImageSrc(PLACEHOLDER_IMAGE);
        setImageLoaded(true);
    };

    if (compact) {
        // Premium compact horizontal card for list view
        return (
            <Link href={`/spots/${spot.id}`}>
                <Card className={cn(
                    "overflow-hidden group flex flex-row !py-0 !gap-0",
                    "bg-[#100b1c]/92 text-white backdrop-blur-xl",
                    "border border-violet-200/15",
                    "transition-all duration-300 ease-out",
                    "hover:shadow-xl hover:shadow-violet-500/10",
                    "hover:border-violet-300/45",
                    "hover:-translate-y-0.5"
                )}>
                    {/* Image with skeleton loader */}
                    <div className="relative w-32 sm:w-44 aspect-[4/3] flex-shrink-0 overflow-hidden bg-muted">
                        {!imageLoaded && (
                            <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/80 to-muted animate-pulse" />
                        )}
                        <Image
                            src={imageSrc}
                            alt={spot.name}
                            fill
                            sizes="(max-width: 640px) 128px, 176px"
                            quality={90}
                            priority={priority}
                            className={cn(
                                "object-cover transition-all duration-500",
                                "group-hover:scale-110",
                                imageLoaded ? "opacity-100" : "opacity-0"
                            )}
                            onLoad={() => setImageLoaded(true)}
                            onError={handleImageError}
                        />
                        {/* Gradient overlay for depth */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {spot.trending && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] font-semibold flex items-center gap-1 shadow-lg shadow-rose-500/30">
                                <TrendingUp className="h-2.5 w-2.5" />
                                Hot
                            </div>
                        )}
                    </div>

                    {/* Content with glassmorphism hover effect */}
                    <div className="flex-1 p-4 flex flex-col min-w-0 relative">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-base leading-tight line-clamp-1 text-white transition-colors duration-200 group-hover:text-violet-100">
                                    {spot.name}
                                </h3>
                                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-violet-50/60">
                                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                                    <span className="truncate">{spot.location.address}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                                <SaveSpotButton spotId={spot.id} size="sm" />
                            </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-violet-50/60">
                            {spot.description}
                        </p>
                        <div className="mt-auto flex items-center gap-4 border-t border-white/10 pt-3 text-xs text-violet-50/60">
                            <span className="rounded-md border border-violet-200/20 bg-violet-400/10 px-2 py-0.5 font-medium text-violet-100">
                                {spot.category}
                            </span>
                            <span className="flex items-center gap-1">
                                <Users className="h-3 w-3 text-emerald-500" />
                                {spot.localPercentage}% locals
                            </span>
                        </div>
                    </div>
                </Card>
            </Link>
        );
    }

    // Premium grid card with glassmorphism and micro-animations
    return (
        <Link href={`/spots/${spot.id}`}>
            <Card className={cn(
                "overflow-hidden h-full flex flex-col group !py-0 !gap-0",
                "bg-[#100b1c]/92 text-white backdrop-blur-xl",
                "border border-violet-200/15",
                "transition-all duration-300 ease-out",
                "shadow-lg shadow-violet-950/20",
                "hover:shadow-2xl hover:shadow-violet-500/20",
                "hover:border-violet-300/45",
                "hover:-translate-y-1",
                "relative"
            )}>
                {/* Animated gradient border on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <div className="absolute inset-[-1px] rounded-xl bg-gradient-to-r from-violet-500/20 via-purple-500/20 to-indigo-500/20 blur-sm" />
                </div>

                {/* Image section with premium effects */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {/* Skeleton loader */}
                    {!imageLoaded && (
                        <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/80 to-muted">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                                 style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    )}

                    <Image
                        src={imageSrc}
                        alt={spot.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        quality={90}
                        priority={priority}
                        className={cn(
                            "object-cover transition-all duration-700 ease-out",
                            "group-hover:scale-110",
                            imageLoaded ? "opacity-100" : "opacity-0"
                        )}
                        onLoad={() => setImageLoaded(true)}
                        onError={handleImageError}
                    />

                    {/* Premium gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/18 to-transparent opacity-80 group-hover:opacity-65 transition-opacity duration-300" />

                    {/* Localley Score badge - glassmorphism style */}
                    <div className="absolute top-3 right-3 z-10">
                        <div className="bg-white/90 dark:bg-black/70 backdrop-blur-md rounded-full px-2.5 py-1 shadow-lg shadow-black/10 border border-white/20">
                            <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                        </div>
                    </div>

                    {/* Save button - always visible with glassmorphism */}
                    <div className="absolute top-3 left-3 z-10">
                        <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full p-1 shadow-lg shadow-black/10 border border-white/20 transition-all duration-300 hover:scale-105 sm:opacity-0 sm:group-hover:opacity-100">
                            <SaveSpotButton spotId={spot.id} />
                        </div>
                    </div>

                    {/* Trending badge with glow */}
                    {spot.trending && (
                        <div className="absolute bottom-3 left-3 z-10">
                            <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-500/40 animate-pulse-subtle">
                                <Sparkles className="h-3 w-3" />
                                Trending
                            </div>
                        </div>
                    )}

                    {/* Bottom info bar with glassmorphism */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                        <div className="flex items-center justify-between">
                            <span className="min-w-0 text-white/90 text-xs font-medium flex items-center gap-1.5 drop-shadow-md">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{spot.location.address.split(',')[0]}</span>
                            </span>
                            <span className="text-white/80 text-xs flex items-center gap-1 drop-shadow-md">
                                <Users className="h-3 w-3" />
                                {spot.localPercentage}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Content section - clean and premium */}
                <div className="p-4 flex-1 flex flex-col relative z-10">
                    {/* Category pill */}
                    <div className="mb-2">
                        <span className="inline-flex items-center rounded-full border border-violet-200/20 bg-violet-400/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-100">
                            {spot.category}
                        </span>
                    </div>

                    {/* Title with hover effect */}
                    <h3 className="font-semibold text-base leading-snug line-clamp-1 text-white transition-colors duration-200 group-hover:text-violet-100">
                        {spot.name}
                    </h3>

                    {/* Description with better typography */}
                    <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-violet-50/60">
                        {spot.description}
                    </p>

                    {/* Premium footer with subtle animation */}
                    <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-200">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {spot.localPercentage}% local favorite
                        </div>
                        <span className="text-xs font-medium text-violet-200 opacity-80 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                            View details →
                        </span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}
