"use client";

import { useState, useEffect } from 'react';
import { ActivityCard, ActivityCardSkeleton } from '@/components/viator/activity-card';
import { ViatorActivity } from '@/types/viator';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronRight } from 'lucide-react';

interface SpotActivitiesProps {
    spotId: string;
    city: string;
    spotName?: string;
}

export function SpotActivities({ spotId, city, spotName }: SpotActivitiesProps) {
    const [activities, setActivities] = useState<ViatorActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        fetchActivities();
    }, [city]);

    const fetchActivities = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/viator/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: city,
                    limit: 6, // Get 6 activities
                }),
            });

            const data = await response.json();
            if (data.success) {
                setActivities(data.data.activities);
            }
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    // Show 3 by default, all when "View All" is clicked
    const displayedActivities = showAll ? activities : activities.slice(0, 3);

    if (loading) {
        return (
            <section className="py-12 border-t border-border/40">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold mb-2">Things to Do Nearby</h2>
                            <p className="text-muted-foreground">
                                Discover activities and tours near {spotName || 'this spot'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                            <ActivityCardSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </section>
        );
    }

    if (activities.length === 0) {
        return null; // Don't show section if no activities
    }

    return (
        <section className="py-12 border-t border-border/40">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-5 w-5 text-violet-600" />
                            <h2 className="text-2xl font-bold">Things to Do Nearby</h2>
                        </div>
                        <p className="text-muted-foreground">
                            Discover activities and tours near {spotName || 'this spot'}
                        </p>
                    </div>

                    {activities.length > 3 && !showAll && (
                        <Button
                            variant="outline"
                            onClick={() => setShowAll(true)}
                            className="hidden md:flex"
                        >
                            View All {activities.length}
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Activities Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayedActivities.map(activity => (
                        <ActivityCard
                            key={activity.id}
                            activity={activity}
                            onViewDetails={(activity) => {
                                // Open Viator booking page in new tab
                                window.open(activity.viatorUrl || activity.bookingUrl, '_blank');
                            }}
                        />
                    ))}
                </div>

                {/* View All Button (Mobile) */}
                {activities.length > 3 && !showAll && (
                    <div className="flex justify-center md:hidden">
                        <Button
                            variant="outline"
                            onClick={() => setShowAll(true)}
                            className="w-full"
                        >
                            View All {activities.length} Activities
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                )}

                {/* Powered by Viator */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-muted-foreground pt-6 border-t border-border/40 mt-6">
                    <div className="flex items-center gap-1.5">
                        <span>Activities powered by</span>
                        <span className="font-semibold text-foreground">Viator</span>
                    </div>
                    <span className="hidden sm:inline text-muted-foreground/50">•</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium">
                        Earn up to 12% commission
                    </span>
                </div>
            </div>
        </section>
    );
}
