"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookableCard, viatorToBookable, type BookableItem } from "@/components/booking/bookable-card";
import { isFreeStop, matchDay, type MatchableStop, type TripBudget } from "@/lib/booking/match";
import type { ViatorActivity } from "@/types/viator";

/**
 * Booking plan B5: one partner search per itinerary page (city level), matched per stop on the
 * client with lib/booking/match. A stop shows a card only when it costs money and a product fits it.
 */
type DayMatches = (BookableItem | null)[][];

const TripBookingContext = createContext<DayMatches | null>(null);

/** How many city products the matcher sees; one request, no paging. */
export const TRIP_BOOKING_SEARCH_LIMIT = 30;

export function computeTripMatches(
    days: MatchableStop[][],
    activities: ViatorActivity[],
    budget: TripBudget = "moderate",
): DayMatches {
    const bookable = new Map<string, BookableItem>();
    for (const activity of activities) {
        const item = viatorToBookable(activity);
        if (item) bookable.set(activity.productCode, item);
    }
    // Only products that can be rendered take part in matching.
    const products = activities.filter((a) => bookable.has(a.productCode));
    return days.map((stops) => matchDay(stops, products, budget).map((m) => (m ? bookable.get(m.productCode) ?? null : null)));
}

export function TripBookingProvider({
    city,
    days,
    budget = "moderate",
    children,
}: {
    city: string;
    days: MatchableStop[][];
    budget?: TripBudget;
    children: ReactNode;
}) {
    const [activities, setActivities] = useState<ViatorActivity[]>([]);
    const hasPaidStop = days.some((stops) => stops.some((stop) => !isFreeStop(stop)));

    useEffect(() => {
        if (!city || !hasPaidStop) return;
        const controller = new AbortController();
        const params = new URLSearchParams({ destination: city, limit: String(TRIP_BOOKING_SEARCH_LIMIT) });
        fetch(`/api/viator/search?${params}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setActivities((data?.data?.activities ?? []) as ViatorActivity[]))
            .catch(() => undefined); // No partner answer: no cards, no error box.
        return () => controller.abort();
    }, [city, hasPaidStop]);

    const matches = useMemo(() => computeTripMatches(days, activities, budget), [days, activities, budget]);
    return <TripBookingContext.Provider value={matches}>{children}</TripBookingContext.Provider>;
}

/** The matched card for one stop, or nothing (free stop, no match, no provider on the page). */
export function StopBookingCard({ dayIndex, stopIndex }: { dayIndex: number; stopIndex: number }) {
    const matches = useContext(TripBookingContext);
    const item = matches?.[dayIndex]?.[stopIndex];
    if (!item) return null;
    return <BookableCard item={item} placement="inline" className="sm:ml-10" />;
}
