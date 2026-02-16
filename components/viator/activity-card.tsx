"use client";

import { ViatorActivity } from '@/types/viator';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Star, Users, ExternalLink } from 'lucide-react';
import Image from 'next/image';

interface ActivityCardProps {
    activity: ViatorActivity;
    onViewDetails?: (activity: ViatorActivity) => void;
}

// Type for Google Analytics gtag function
declare global {
    interface Window {
        gtag?: (command: string, eventName: string, params: Record<string, string | number>) => void;
    }
}

export function ActivityCard({ activity, onViewDetails }: ActivityCardProps) {
    const handleBookNow = () => {
        // Track click for analytics
        if (typeof window !== 'undefined' && window.gtag) {
            window.gtag('event', 'viator_click', {
                product_code: activity.productCode,
                title: activity.title,
                price: activity.priceFrom,
            });
        }

        // Open Viator booking page in new tab
        window.open(activity.bookingUrl, '_blank', 'noopener,noreferrer');
    };

    const handleViewDetails = () => {
        if (onViewDetails) {
            onViewDetails(activity);
        }
    };

    return (
        <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 group flex flex-col h-full min-h-[420px] !py-0 !gap-0">
            {/* Image */}
            <div className="relative aspect-[16/9] overflow-hidden bg-gray-100 flex-shrink-0">
                <Image
                    src={activity.thumbnailUrl || activity.images[0] || '/placeholder-activity.jpg'}
                    alt={activity.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {activity.instantConfirmation && (
                        <Badge className="bg-green-500 text-white">
                            Instant Confirmation
                        </Badge>
                    )}
                    {activity.mobileTicket && (
                        <Badge variant="secondary" className="bg-white/90">
                            Mobile Ticket
                        </Badge>
                    )}
                </div>

                {/* Category Badge */}
                <div className="absolute top-3 right-3">
                    <Badge variant="outline" className="bg-white/90 backdrop-blur-sm">
                        {activity.category}
                    </Badge>
                </div>
            </div>

            <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                {/* Title */}
                <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-violet-600 transition-colors">
                    {activity.title}
                </h3>

                {/* Description */}
                {activity.shortDescription && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {activity.shortDescription}
                    </p>
                )}

                {/* Meta Info */}
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {/* Duration */}
                    <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{activity.duration}</span>
                    </div>

                    {/* Rating */}
                    {activity.rating && (
                        <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium text-foreground">{activity.rating}</span>
                            <span>({activity.reviewCount})</span>
                        </div>
                    )}

                    {/* Max Travelers */}
                    {activity.maxTravelers && (
                        <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>Max {activity.maxTravelers}</span>
                        </div>
                    )}
                </div>

                {/* Included/Excluded - pushed to bottom of content area */}
                <div className="mt-auto">
                    {activity.included && activity.included.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Includes:</span> {activity.included.slice(0, 2).join(', ')}
                            {activity.included.length > 2 && '...'}
                        </div>
                    )}
                </div>
            </CardContent>

            <CardFooter className="p-4 pt-0 flex items-center justify-between gap-3 mt-auto flex-shrink-0">
                {/* Price */}
                <div className="flex-shrink-0">
                    <div className="text-xs text-muted-foreground">From</div>
                    <div className="text-xl sm:text-2xl font-bold text-violet-600">
                        ${activity.priceFrom}
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground"> / person</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                    {onViewDetails && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleViewDetails}
                            className="hidden sm:inline-flex"
                        >
                            Details
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 whitespace-nowrap"
                        onClick={handleBookNow}
                    >
                        Book
                        <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                </div>
            </CardFooter>

            {/* Powered by Viator Badge */}
            <div className="px-4 pb-3 flex-shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                    Powered by <span className="font-semibold">Viator</span>
                </div>
            </div>
        </Card>
    );
}

// Skeleton loader for activity cards
export function ActivityCardSkeleton() {
    return (
        <Card className="overflow-hidden flex flex-col h-full min-h-[420px] !py-0 !gap-0">
            <div className="aspect-[16/9] bg-gray-200 animate-pulse flex-shrink-0" />
            <CardContent className="p-4 space-y-3 flex-1">
                <div className="h-6 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="flex gap-3">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
                </div>
            </CardContent>
            <CardFooter className="p-4 pt-0 flex justify-between mt-auto flex-shrink-0">
                <div className="h-8 bg-gray-200 rounded w-24 animate-pulse" />
                <div className="h-9 bg-gray-200 rounded w-24 animate-pulse" />
            </CardFooter>
        </Card>
    );
}
