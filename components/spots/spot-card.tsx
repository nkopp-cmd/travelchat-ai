import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { LocalleyScaleIndicator } from "./localley-scale";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { MapPin, TrendingUp, Users } from "lucide-react";

interface SpotCardProps {
    spot: Spot;
    compact?: boolean;
}

export function SpotCard({ spot, compact = false }: SpotCardProps) {
    if (compact) {
        // Compact horizontal card for list view - cleaner design
        return (
            <Link href={`/spots/${spot.id}`}>
                <Card className="overflow-hidden transition-all duration-200 hover:shadow-md hover:border-violet-300/50 dark:hover:border-violet-700/50 group flex flex-row">
                    {/* Larger image for list view */}
                    <div className="relative w-32 sm:w-40 aspect-[4/3] flex-shrink-0 overflow-hidden">
                        <Image
                            src={spot.photos[0] || "/placeholder-spot.jpg"}
                            alt={spot.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {spot.trending && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-medium flex items-center gap-1">
                                <TrendingUp className="h-2.5 w-2.5" />
                                Hot
                            </div>
                        )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-4 flex flex-col min-w-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-violet-600 transition-colors">
                                    {spot.name}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
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
                        <div className="flex items-center gap-4 mt-auto pt-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">{spot.category}</span>
                            <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {spot.localPercentage}% locals
                            </span>
                        </div>
                    </div>
                </Card>
            </Link>
        );
    }

    // Default grid card - medium thumbnail design (4:3 aspect ratio)
    return (
        <Link href={`/spots/${spot.id}`}>
            <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-300/50 dark:hover:border-violet-700/50 hover:-translate-y-1 h-full flex flex-col group bg-card">
                {/* Medium thumbnail image (4:3 aspect ratio) */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    <Image
                        src={spot.photos[0] || "/placeholder-spot.jpg"}
                        alt={spot.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Localley Score badge - top right */}
                    <div className="absolute top-3 right-3">
                        <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                    </div>

                    {/* Save button - top left */}
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <SaveSpotButton spotId={spot.id} />
                    </div>

                    {/* Trending badge */}
                    {spot.trending && (
                        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-rose-500 text-white text-xs font-medium flex items-center gap-1 shadow-lg">
                            <TrendingUp className="h-3 w-3" />
                            Trending
                        </div>
                    )}
                </div>

                {/* Content section - clean and spacious */}
                <div className="p-4 flex-1 flex flex-col">
                    {/* Title */}
                    <h3 className="font-semibold text-base leading-snug line-clamp-1 group-hover:text-violet-600 transition-colors">
                        {spot.name}
                    </h3>

                    {/* Location */}
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                        <span className="truncate">{spot.location.address}</span>
                    </p>

                    {/* Description - 2 lines max */}
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2 flex-1">
                        {spot.description}
                    </p>

                    {/* Footer - category and local percentage */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                        <span className="text-xs font-medium text-foreground/70">
                            {spot.category}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {spot.localPercentage}% locals
                        </span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}
