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

const PLACEHOLDER_IMAGE = "/placeholder-spot.svg";

interface SpotCardProps {
    spot: Spot;
    compact?: boolean;
}

export function SpotCard({ spot, compact = false }: SpotCardProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageSrc, setImageSrc] = useState(spot.photos[0] || PLACEHOLDER_IMAGE);

    const handleImageError = () => {
        setImageSrc(PLACEHOLDER_IMAGE);
        setImageLoaded(true);
    };

    if (compact) {
        // Premium compact horizontal card for list view
        return (
            <Link href={`/spots/${spot.id}`}>
                <Card className={cn(
                    "overflow-hidden group flex flex-row",
                    "bg-gradient-to-r from-card to-card/95",
                    "border border-border/50",
                    "transition-all duration-300 ease-out",
                    "hover:shadow-xl hover:shadow-violet-500/10",
                    "hover:border-violet-400/50 dark:hover:border-violet-500/50",
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
                                <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-200">
                                    {spot.name}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                                    <span className="truncate">{spot.location.address}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                                <SaveSpotButton spotId={spot.id} size="sm" />
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {spot.description}
                        </p>
                        <div className="flex items-center gap-4 mt-auto pt-3 text-xs text-muted-foreground border-t border-border/30">
                            <span className="font-medium text-foreground/80 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-md">
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
                "overflow-hidden h-full flex flex-col group",
                "bg-card/95 backdrop-blur-sm",
                "border border-border/50",
                "transition-all duration-300 ease-out",
                "hover:shadow-2xl hover:shadow-violet-500/20",
                "hover:border-violet-400/60 dark:hover:border-violet-500/60",
                "hover:-translate-y-2",
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
                        className={cn(
                            "object-cover transition-all duration-700 ease-out",
                            "group-hover:scale-110",
                            imageLoaded ? "opacity-100" : "opacity-0"
                        )}
                        onLoad={() => setImageLoaded(true)}
                        onError={handleImageError}
                    />

                    {/* Premium gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-300" />

                    {/* Localley Score badge - glassmorphism style */}
                    <div className="absolute top-3 right-3 z-10">
                        <div className="bg-white/90 dark:bg-black/70 backdrop-blur-md rounded-full px-2.5 py-1 shadow-lg shadow-black/10 border border-white/20">
                            <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                        </div>
                    </div>

                    {/* Save button - always visible with glassmorphism */}
                    <div className="absolute top-3 left-3 z-10">
                        <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full p-1 shadow-lg shadow-black/10 border border-white/20 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110">
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
                            <span className="text-white/90 text-xs font-medium flex items-center gap-1.5 drop-shadow-md">
                                <MapPin className="h-3 w-3" />
                                {spot.location.address.split(',')[0]}
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
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-700/50">
                            {spot.category}
                        </span>
                    </div>

                    {/* Title with hover effect */}
                    <h3 className="font-semibold text-base leading-snug line-clamp-1 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-200">
                        {spot.name}
                    </h3>

                    {/* Description with better typography */}
                    <p className="text-sm text-muted-foreground/80 mt-2 line-clamp-2 flex-1 leading-relaxed">
                        {spot.description}
                    </p>

                    {/* Premium footer with subtle animation */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {spot.localPercentage}% local favorite
                        </div>
                        <span className="text-xs text-violet-600 dark:text-violet-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            View details →
                        </span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}
