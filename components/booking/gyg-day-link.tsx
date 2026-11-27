"use client";

import { ExternalLink } from "@/components/ui/icons";
import { trackClick } from "@/components/booking/bookable-card";

/** Push DR2: "Tours for this day" GetYourGuide link under one itinerary day (server-built URL). */
export function GygDayLink({ day, spotName, url }: { day: number; spotName: string; url: string }) {
    const title = `Tours for day ${day}: ${spotName}`;
    return (
        <a
            href={url}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            data-bookable-card="getyourguide"
            data-testid="itinerary-day-gyg-link"
            onClick={() => trackClick({ partner: "getyourguide", productCode: `d${day}`, title }, "itinerary-day")}
            className="flex items-center justify-between gap-3 rounded-xl bg-raised p-3 text-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
            <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">Tours for this day</span>
                <span className="block truncate text-xs text-muted-foreground">
                    Tickets and tours for {spotName}, on GetYourGuide (booking partner)
                </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                See tours
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </span>
        </a>
    );
}
