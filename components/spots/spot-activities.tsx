"use client";

import { useEffect, useState } from "react";
import { BookableCard, BookableSection, viatorToBookable, type BookableItem } from "@/components/booking/bookable-card";
import { isFreeStop, matchStop } from "@/lib/booking/match";
import type { ViatorActivity } from "@/types/viator";
import { useAuth } from "@/lib/auth/client";

interface SpotActivitiesProps {
    spotId: string;
    city: string;
    spotName?: string;
    category?: string;
}

/** How many city products the matcher sees for one spot. */
export const SPOT_BOOKING_SEARCH_LIMIT = 30;

export function getSpotActivitiesCopy(spotName?: string) {
    return { heading: spotName ? `Book a tour with ${spotName}` : "Book a tour for this stop" };
}

/** The one partner product that fits this spot, or null (booking plan B5). */
export function pickSpotProduct(activities: ViatorActivity[], spot: { name?: string; category?: string }): BookableItem | null {
    const renderable = activities.filter((a) => viatorToBookable(a) !== null);
    const match = matchStop({ name: spot.name, category: spot.category?.toLowerCase() }, renderable);
    return match ? viatorToBookable(match as ViatorActivity) : null;
}

/**
 * Booking plan B5: the spot page shows at most one matched card (same named place or a tour
 * that fits the spot category), never a list of city tours. Free places show nothing.
 */
export function SpotActivities({ city, spotName, category }: SpotActivitiesProps) {
    const [item, setItem] = useState<BookableItem | null>(null);
    const { isLoaded, isSignedIn } = useAuth();
    const free = isFreeStop({ name: spotName, category: category?.toLowerCase() });

    useEffect(() => {
        // /api/viator/search requires a session; a free place needs no booking.
        if (!isLoaded || !isSignedIn || free || !city) return;
        const controller = new AbortController();
        fetch("/api/viator/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination: city, limit: SPOT_BOOKING_SEARCH_LIMIT }),
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setItem(data?.success ? pickSpotProduct(data.data?.activities ?? [], { name: spotName, category }) : null))
            .catch(() => undefined);
        return () => controller.abort();
    }, [city, spotName, category, free, isLoaded, isSignedIn]);

    if (!item || free || !isSignedIn) return null;
    return (
        <BookableSection title={getSpotActivitiesCopy(spotName).heading}>
            <div className="max-w-md">
                <BookableCard item={item} placement="spot" />
            </div>
        </BookableSection>
    );
}
