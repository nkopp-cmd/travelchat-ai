"use client";

import { useEffect, useState } from "react";
import { BookableCard, BookableSection, trackClick, viatorToBookable, type BookableItem } from "@/components/booking/bookable-card";
import { ExternalLink } from "@/components/ui/icons";
import { isFreeStop, matchStop } from "@/lib/booking/match";
import type { ViatorActivity } from "@/types/viator";
import { useAuth } from "@/lib/auth/client";

interface SpotActivitiesProps {
    spotId: string;
    city: string;
    spotName?: string;
    category?: string;
    /** Server-built GetYourGuide search URL with our partner id (Push DR1); null hides the fallback. */
    gygUrl?: string | null;
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
export function SpotActivities({ spotId, city, spotName, category, gygUrl }: SpotActivitiesProps) {
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

    if (free) return null;
    if (!item || !isSignedIn) {
        return gygUrl ? <GygSpotLink spotId={spotId} spotName={spotName} url={gygUrl} /> : null;
    }
    return (
        <BookableSection title={getSpotActivitiesCopy(spotName).heading}>
            <div className="max-w-md">
                <BookableCard item={item} placement="spot" />
            </div>
        </BookableSection>
    );
}

/**
 * Push DR1: one GetYourGuide search link for a paid-entry landmark, in the cached HTML for every
 * visitor. Shown when no matched Viator card exists (signed out, or no product fits).
 */
export function GygSpotLink({ spotId, spotName, url }: { spotId: string; spotName?: string; url: string }) {
    const title = spotName ? `Tickets and tours for ${spotName}` : "Tickets and tours for this stop";
    return (
        <BookableSection
            title={getSpotActivitiesCopy(spotName).heading}
            partnerNote="Tours from GetYourGuide, our booking partner. Prices and availability are set by GetYourGuide."
        >
            <a
                href={url}
                target="_blank"
                rel="sponsored noopener noreferrer"
                data-bookable-card="getyourguide"
                data-testid="spot-gyg-link"
                onClick={() => trackClick({ partner: "getyourguide", productCode: spotId, title }, "spot")}
                className="flex max-w-md items-center justify-between gap-3 rounded-2xl bg-raised p-4 text-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
                <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{title}</span>
                    <span className="block text-sm text-muted-foreground">Entry tickets, guided visits and tours, compared on GetYourGuide</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                    See options
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </span>
            </a>
        </BookableSection>
    );
}
