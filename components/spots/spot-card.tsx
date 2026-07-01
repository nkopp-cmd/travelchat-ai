"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { ImageIcon, MapPin, Navigation, Sparkles, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCityGradient, getCityImageUrl } from "@/lib/city-images";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";

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
    { city: "Keelung", lat: [25, 25.25], lng: [121.6, 121.9] },
    { city: "Yilan", lat: [24.5, 24.95], lng: [121.55, 121.95] },
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
    { city: "Keelung", terms: ["beining road", "badouzi", "miaokou", "heping island"] },
    { city: "Yilan", terms: ["wubin road", "wujie", "luodong", "jiaoxi", "dongshan"] },
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
    return !src || src.includes("placeholder") || src.startsWith("/images/placeholders/");
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
    if (realPhoto) return { src: realPhoto, isAreaFallback: false };

    const fallback = getCityFallbackImage(spot) ?? spot.photos[0] ?? PLACEHOLDER_IMAGE;
    return { src: fallback, isAreaFallback: true };
}

function getCityFallbackImage(spot: Spot) {
    const city = inferSpotCity(spot);
    return city ? getCityImageUrl(city, { width: 1200, height: 900, quality: 90 }) : null;
}

function hasRealSpotPhoto(spot: Spot) {
    return spot.hasRealPhoto ?? spot.photos.some((photo) => !isPlaceholderImage(photo));
}

function getScoreTone(score: number) {
    if (score >= 6) return "border-fuchsia-300/25 bg-fuchsia-400/12 text-fuchsia-100";
    if (score >= 5) return "border-violet-300/25 bg-violet-400/12 text-violet-100";
    if (score >= 4) return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
    return "border-sky-300/20 bg-sky-400/10 text-sky-100";
}

function SpotScoreChip({ score, className }: { score: number; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold leading-none sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
                getScoreTone(score),
                className
            )}
            title={`Localley score ${score} out of 6`}
        >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span className="truncate">{score}/6</span>
            <span className="hidden min-[560px]:inline">Localley</span>
        </span>
    );
}

function LocalCrowdChip({ percentage, className }: { percentage: number; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-md border border-emerald-200/15 bg-emerald-400/10 px-1.5 text-[10px] font-semibold leading-none text-emerald-100 sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
                className
            )}
            title={`${percentage}% local crowd signal`}
        >
            <Users className="h-3 w-3" aria-hidden="true" />
            {percentage}%
        </span>
    );
}

function LocationConfidenceChip({ spot, className }: { spot: Spot; className?: string }) {
    const confidence = getSpotLocationConfidence({
        address: spot.location.address,
        lat: spot.location.lat,
        lng: spot.location.lng,
    });
    const hasPlaceMatch = Boolean(spot.googlePlaceId);

    return (
        <span
            className={cn(
                "inline-flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold leading-none sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
                hasPlaceMatch || confidence.tone === "exact"
                    ? "border-sky-200/20 bg-sky-400/10 text-sky-100"
                    : confidence.tone === "pinned"
                        ? "border-indigo-200/20 bg-indigo-400/10 text-indigo-100"
                        : "border-amber-200/25 bg-amber-400/10 text-amber-100",
                className
            )}
            title={hasPlaceMatch ? "Google Place match available for directions" : confidence.description}
        >
            <Navigation className="h-3 w-3" aria-hidden="true" />
            <span>{hasPlaceMatch ? "Place" : confidence.tone === "exact" ? "Exact" : confidence.tone === "pinned" ? "Pinned" : "Area"}</span>
        </span>
    );
}

export function SpotCard({ spot, compact = false, priority = false }: SpotCardProps) {
    const initialImage = getInitialImage(spot);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageSrc, setImageSrc] = useState(initialImage.src);
    const [usingAreaImage, setUsingAreaImage] = useState(initialImage.isAreaFallback);
    const [showGradientFallback, setShowGradientFallback] = useState(false);
    const hasRealPhoto = hasRealSpotPhoto(spot);
    const inferredCity = inferSpotCity(spot);
    const fallbackLabel = inferredCity ? `${inferredCity} area` : spot.category;
    const fallbackGradient = getCityGradient(fallbackLabel);

    const handleImageError = () => {
        const cityFallback = getCityFallbackImage(spot);
        if (cityFallback && imageSrc !== cityFallback) {
            setImageSrc(cityFallback);
            setUsingAreaImage(true);
            setImageLoaded(false);
            return;
        }

        setShowGradientFallback(true);
        setUsingAreaImage(true);
        setImageLoaded(true);
    };

    const renderImage = (sizes: string) => {
        if (showGradientFallback) {
            return (
                <div className={cn("flex h-full w-full items-end bg-gradient-to-br p-2", fallbackGradient)}>
                    <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                        {fallbackLabel}
                    </span>
                </div>
            );
        }

        return (
            <Image
                src={imageSrc}
                alt={spot.name}
                fill
                sizes={sizes}
                quality={90}
                priority={priority}
                className={cn(
                    "object-cover transition-all duration-500 ease-out",
                    "group-hover:scale-110",
                    imageLoaded ? "opacity-100" : "opacity-0"
                )}
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
            />
        );
    };

    if (compact) {
        // Premium compact horizontal card for list view
        return (
            <Card className={cn(
                "group relative flex flex-row overflow-hidden rounded-lg !gap-0 !py-0",
                "bg-[#100b1c]/92 text-white backdrop-blur-xl",
                "border border-violet-200/15",
                "transition-all duration-300 ease-out",
                "hover:shadow-xl hover:shadow-violet-500/10",
                "hover:border-violet-300/45",
                "hover:-translate-y-0.5"
            )}>
                <Link
                    href={`/spots/${spot.id}`}
                    aria-label={`Open ${spot.name}`}
                    className="absolute inset-0 z-10 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714]"
                >
                    <span className="sr-only">Open {spot.name}</span>
                </Link>
                    <div className="relative aspect-[4/3] w-24 flex-shrink-0 overflow-hidden bg-violet-950/60 min-[430px]:w-28 sm:w-36">
                        {!showGradientFallback && !imageLoaded && (
                            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-violet-950 via-violet-900/80 to-violet-950" />
                        )}
                        {renderImage("(max-width: 640px) 112px, 160px")}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                        {(!hasRealPhoto || usingAreaImage) && (
                            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-violet-100/20 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-violet-50/80 backdrop-blur">
                                <ImageIcon className="h-3 w-3" />
                                Area image
                            </span>
                        )}
                    </div>

                    <div className="relative flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <h3 className="line-clamp-1 text-sm font-semibold leading-tight text-white transition-colors duration-200 group-hover:text-violet-100 sm:text-base">
                                    {spot.name}
                                </h3>
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-violet-50/60 sm:text-sm">
                                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
                                    <span className="truncate">{spot.location.address}</span>
                                </p>
                            </div>
                            <div className="relative z-20 flex flex-shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-0.5 backdrop-blur sm:p-1">
                                <SaveSpotButton spotId={spot.id} size="sm" className="h-7 w-7 bg-white/10 p-0 hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5" />
                            </div>
                        </div>
                        <p className="mt-1.5 line-clamp-1 text-xs leading-5 text-violet-50/60 sm:line-clamp-2 sm:text-sm">
                            {spot.description}
                        </p>
                        <div className="mt-auto border-t border-white/10 pt-2 text-xs text-violet-50/60">
                            <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1">
                                <span className="max-w-[7rem] truncate rounded-md border border-violet-200/20 bg-violet-400/10 px-1.5 py-0.5 font-medium text-violet-100 sm:max-w-none sm:px-2">
                                    {spot.category}
                                </span>
                                {spot.trending && (
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-rose-200/25 bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100 sm:text-[11px]" title="Trending">
                                        <TrendingUp className="h-3 w-3" />
                                        Hot
                                    </span>
                                )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                                <SpotScoreChip score={spot.localleyScore} />
                                <LocalCrowdChip percentage={spot.localPercentage} />
                                <LocationConfidenceChip spot={spot} />
                            </div>
                        </div>
                    </div>
                </Card>
        );
    }

    // Premium grid card with glassmorphism and micro-animations
    return (
        <Card className={cn(
            "group relative flex min-h-[112px] flex-row items-stretch overflow-hidden rounded-lg !gap-0 !py-0 sm:min-h-0 sm:flex-col",
            "bg-[#100b1c]/92 text-white backdrop-blur-xl",
            "border border-violet-200/15",
            "transition-all duration-300 ease-out",
            "shadow-md shadow-violet-950/20",
            "hover:shadow-xl hover:shadow-violet-500/20",
            "hover:border-violet-300/45",
            "hover:-translate-y-0.5"
        )}>
            <Link
                href={`/spots/${spot.id}`}
                aria-label={`Open ${spot.name}`}
                className="absolute inset-0 z-10 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714]"
            >
                <span className="sr-only">Open {spot.name}</span>
            </Link>
                <div className="relative w-24 shrink-0 overflow-hidden bg-violet-950/60 min-[420px]:w-28 sm:aspect-[2/1] sm:w-full">
                    {!showGradientFallback && !imageLoaded && (
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-violet-900/80 to-violet-950">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                                 style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    )}

                    {renderImage("(max-width: 640px) 128px, (max-width: 1024px) 50vw, 33vw")}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/12 to-black/10 transition-opacity duration-300 group-hover:opacity-85" />

                    {(!hasRealPhoto || usingAreaImage) && (
                        <span className="absolute bottom-1.5 left-1.5 z-10 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-full border border-violet-100/20 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-violet-50/80 shadow-lg shadow-black/15 backdrop-blur sm:bottom-2.5 sm:left-2.5 sm:max-w-[calc(100%-5.5rem)] sm:px-2.5 sm:py-1 sm:text-[11px]">
                            <ImageIcon className="h-3 w-3 flex-shrink-0" />
                            Area
                        </span>
                    )}

                    <div className="absolute right-1.5 top-1.5 z-10 hidden sm:right-2.5 sm:top-2.5 sm:block">
                        <div className="relative z-20 flex-shrink-0 rounded-full border border-white/20 bg-black/42 p-1 shadow-lg shadow-black/15 backdrop-blur-md transition-all duration-300 hover:scale-105 sm:opacity-0 sm:group-hover:opacity-100">
                            <SaveSpotButton spotId={spot.id} className="h-7 w-7 bg-white/90 p-0 text-slate-900 hover:bg-white sm:h-8 sm:w-8" />
                        </div>
                    </div>
                    {spot.trending && (
                        <div className="absolute left-1.5 top-1.5 z-10 rounded-full border border-rose-200/25 bg-rose-500/85 p-1 text-white shadow-lg shadow-black/15 backdrop-blur sm:left-2.5 sm:top-2.5">
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Trending</span>
                        </div>
                    )}
                </div>

                <div className="relative z-10 flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
                    <div className="mb-1.5 flex min-w-0 items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <span className="inline-flex max-w-[7.5rem] truncate rounded-md border border-violet-200/20 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-100 sm:max-w-full sm:rounded-full sm:px-2.5 sm:text-[11px]">
                                {spot.category}
                            </span>
                        </div>
                        <div className="relative z-20 shrink-0 sm:hidden">
                            <SaveSpotButton spotId={spot.id} className="h-7 w-7 bg-white/10 p-0 text-white hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5" />
                        </div>
                    </div>

                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors duration-200 group-hover:text-violet-100 sm:line-clamp-1 sm:text-base">
                        {spot.name}
                    </h3>

                    <p className="mt-1 flex items-center gap-1.5 text-xs text-violet-50/55">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
                        <span className="truncate">{spot.location.address}</span>
                    </p>

                    <div className="mt-auto border-t border-white/10 pt-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <SpotScoreChip score={spot.localleyScore} />
                            <LocalCrowdChip percentage={spot.localPercentage} />
                            <LocationConfidenceChip spot={spot} />
                        </div>
                    </div>
                </div>
            </Card>
    );
}
