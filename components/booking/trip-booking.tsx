"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookableCard, BookableSection, formatFromPrice, trackClick, viatorToBookable, type BookableItem } from "@/components/booking/bookable-card";
import { bookedStorageKey, buildChecklist, checklistTotals, parseBookedCodes, type ChecklistEntry } from "@/lib/booking/checklist";
import { isFreeStop, matchDay, type MatchableStop, type TripBudget } from "@/lib/booking/match";
import type { ViatorActivity } from "@/types/viator";

/**
 * Booking plan B5: one partner search per itinerary page (city level), matched per stop on the
 * client with lib/booking/match. A stop shows a card only when it costs money and a product fits it.
 */
type DayMatches = (BookableItem | null)[][];

const TripBookingContext = createContext<{ matches: DayMatches; days: MatchableStop[][] } | null>(null);

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

    const value = useMemo(() => ({ matches: computeTripMatches(days, activities, budget), days }), [days, activities, budget]);
    return <TripBookingContext.Provider value={value}>{children}</TripBookingContext.Provider>;
}

/** The matched card for one stop, or nothing (free stop, no match, no provider on the page). */
export function StopBookingCard({ dayIndex, stopIndex }: { dayIndex: number; stopIndex: number }) {
    const ctx = useContext(TripBookingContext);
    const item = ctx?.matches[dayIndex]?.[stopIndex];
    if (!item) return null;
    return <BookableCard item={item} placement="inline" className="sm:ml-10" />;
}

/**
 * Booking plan B6: every bookable part of the plan in one list, "book early" first, with a running
 * per-person total. "Booked" marks stay on this device (localStorage); nothing is sent anywhere.
 */
export function TripChecklist({ itineraryId }: { itineraryId: string }) {
    const ctx = useContext(TripBookingContext);
    const entries = useMemo(
        () => (ctx ? buildChecklist(ctx.matches, ctx.days.map((stops) => stops.map((s) => s.name ?? ""))) : []),
        [ctx],
    );
    const [booked, setBooked] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        try {
            setBooked(parseBookedCodes(window.localStorage.getItem(bookedStorageKey(itineraryId))));
        } catch {
            // Storage blocked (private mode): marks live for this visit only.
        }
    }, [itineraryId]);

    if (entries.length === 0) return null;

    const toggle = (code: string) => {
        setBooked((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            try {
                window.localStorage.setItem(bookedStorageKey(itineraryId), JSON.stringify([...next]));
            } catch {
                // Ignore: see above.
            }
            return next;
        });
    };

    const totals = checklistTotals(entries, booked);
    const toBook = formatFromPrice(totals.toBook, totals.currency);
    const total = formatFromPrice(totals.total, totals.currency);
    const groups: { key: ChecklistEntry["group"]; title: string; hint: string }[] = [
        { key: "early", title: "Book early", hint: "Timed tickets and popular tours sell out first." },
        { key: "anytime", title: "Book anytime", hint: "Usually available close to the day." },
    ];

    return (
        <BookableSection
            title="Bookings for this trip"
            description={[
                `${totals.booked} of ${totals.count} booked`,
                total ? (toBook ? `${toBook} of ${total} per person left to book` : "All priced items booked") : null,
            ].filter(Boolean).join(" · ")}
            className="rounded-2xl bg-raised p-4 sm:p-6"
        >
            {groups.map(({ key, title, hint }) => {
                const rows = entries.filter((e) => e.group === key);
                if (rows.length === 0) return null;
                return (
                    <div key={key} className="space-y-2">
                        <div>
                            <h3 className="text-base font-semibold">{title}</h3>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                        </div>
                        <ul className="space-y-2">
                            {rows.map(({ item, day, stopName }) => {
                                const isBooked = booked.has(item.productCode);
                                const price = formatFromPrice(item.priceFrom, item.currency);
                                const id = `booked-${item.productCode}`;
                                return (
                                    <li key={item.productCode} className="flex flex-wrap items-center gap-3 rounded-xl bg-background/60 p-3">
                                        <input
                                            id={id}
                                            type="checkbox"
                                            checked={isBooked}
                                            onChange={() => toggle(item.productCode)}
                                            className="h-5 w-5 shrink-0 accent-primary"
                                        />
                                        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                                            <span className={isBooked ? "block text-sm font-medium text-muted-foreground line-through" : "block text-sm font-medium"}>
                                                {item.title}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                Day {day}{stopName ? ` · ${stopName}` : ""}{price ? ` · ${price}` : ""}{item.freeCancellation ? " · Free cancellation" : ""}
                                            </span>
                                        </label>
                                        {!isBooked && (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer sponsored"
                                                onClick={() => trackClick(item, "checklist")}
                                                className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            >
                                                Check availability
                                            </a>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
        </BookableSection>
    );
}
