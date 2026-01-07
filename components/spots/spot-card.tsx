import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { LocalleyScaleIndicator } from "./localley-scale";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, TrendingUp, Users } from "lucide-react";

interface SpotCardProps {
    spot: Spot;
    compact?: boolean;
}

export function SpotCard({ spot, compact = false }: SpotCardProps) {
    if (compact) {
        // Compact horizontal card for list view
        return (
            <Link href={`/spots/${spot.id}`}>
                <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-700 group flex flex-row h-28">
                    {/* Compact image */}
                    <div className="relative w-28 h-full flex-shrink-0 overflow-hidden">
                        <Image
                            src={spot.photos[0] || "/placeholder-spot.jpg"}
                            alt={spot.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform"
                        />
                        <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} className="absolute top-1.5 right-1.5 scale-90" />
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-3 flex flex-col min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-violet-600 transition-colors">
                                {spot.name}
                            </h3>
                            <SaveSpotButton spotId={spot.id} size="sm" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{spot.location.address}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-auto text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {spot.localPercentage}%
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {spot.bestTime}
                            </span>
                            {spot.trending && (
                                <Badge className="h-5 px-1.5 text-[10px] bg-rose-500 hover:bg-rose-600">
                                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                                    Hot
                                </Badge>
                            )}
                        </div>
                    </div>
                </Card>
            </Link>
        );
    }

    // Default grid card - more compact version
    return (
        <Link href={`/spots/${spot.id}`}>
            <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-700 hover:-translate-y-0.5 h-full flex flex-col group">
                {/* More compact image with overlay info */}
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <Image
                        src={spot.photos[0] || "/placeholder-spot.jpg"}
                        alt={spot.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                    />
                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* Top badges */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                        <SaveSpotButton spotId={spot.id} />
                        <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                    </div>
                    {spot.trending && (
                        <Badge className="absolute top-2 left-2 bg-rose-500 hover:bg-rose-600 text-xs h-6">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Trending
                        </Badge>
                    )}

                    {/* Bottom overlay with name and location */}
                    <div className="absolute bottom-0 inset-x-0 p-3">
                        <h3 className="font-semibold text-white text-base leading-tight line-clamp-1 drop-shadow-lg">
                            {spot.name}
                        </h3>
                        <p className="text-white/80 text-xs mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{spot.location.address}</span>
                        </p>
                    </div>
                </div>

                {/* Compact content section */}
                <div className="p-3 flex-1 flex flex-col">
                    <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                        {spot.description}
                    </p>

                    {/* Tags and meta in one row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <div className="flex gap-1.5">
                            {spot.subcategories.slice(0, 2).map((sub) => (
                                <Badge key={sub} variant="secondary" className="text-[10px] h-5 px-1.5">
                                    {sub}
                                </Badge>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                {spot.localPercentage}%
                            </span>
                        </div>
                    </div>
                </div>
            </Card>
        </Link>
    );
}
