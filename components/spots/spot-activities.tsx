"use client";

import { useState, useEffect } from 'react';
import { BookableCard, BookableCardSkeleton, BookableSection, viatorToBookable, type BookableItem } from '@/components/booking/bookable-card';
import { ViatorActivity } from '@/types/viator';
import { Button } from '@/components/ui/button';
import { ChevronRight } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth/client';

interface SpotActivitiesProps {
    spotId: string;
    city: string;
    spotName?: string;
}

export function getSpotActivitiesCopy(city: string, spotName?: string) {
    const cityLabel = city || "this city";
    const spotLabel = spotName || "this stop";

    return {
        heading: `Bookable activities in ${cityLabel}`,
        loadingDescription: `Finding city-level tours that can pair with ${spotLabel}.`,
        description: `These are city-level tours and activities around ${cityLabel}, not exact walking-distance picks from ${spotLabel}.`,
    };
}

export function SpotActivities({ city, spotName }: SpotActivitiesProps) {
    const [activities, setActivities] = useState<ViatorActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const copy = getSpotActivitiesCopy(city, spotName);
    const { isLoaded, isSignedIn } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;
        // /api/viator/search requires a session; signed-out visitors would only get a 401 and an empty section.
        if (!isSignedIn) {
            setActivities([]);
            setLoading(false);
            return;
        }
        const fetchActivities = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/viator/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        destination: city,
                        limit: 6,
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

        fetchActivities();
    }, [city, isLoaded, isSignedIn]);

    const items = activities.map(viatorToBookable).filter((item): item is BookableItem => item !== null);
    const displayed = showAll ? items : items.slice(0, 3);

    if (loading) {
        return (
            <BookableSection title={copy.heading} description={copy.loadingDescription}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => <BookableCardSkeleton key={i} />)}
                </div>
            </BookableSection>
        );
    }

    if (items.length === 0) return null;

    return (
        <BookableSection title={copy.heading} description={copy.description}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayed.map((item) => <BookableCard key={item.id} item={item} placement="spot" />)}
            </div>
            {items.length > 3 && !showAll && (
                <Button variant="outline" onClick={() => setShowAll(true)} className="w-full sm:w-auto">
                    Show {items.length - 3} more
                    <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
            )}
        </BookableSection>
    );
}
