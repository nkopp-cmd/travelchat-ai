"use client";

import { useState, useEffect, useRef } from "react";
import { SubscriptionTier } from "@/lib/subscription";
import {
    BookableCard,
    BookableCardSkeleton,
    BookableSection,
    viatorToBookable,
    type BookableItem,
} from "@/components/booking/bookable-card";

interface ViatorSuggestionsProps {
    city: string;
    category?: string;
    /** Kept for callers; booking cards are the same for every tier. */
    userTier?: SubscriptionTier;
    className?: string;
    limit?: number;
}

export function ViatorSuggestions({
    city,
    category,
    className,
    limit = 4,
}: ViatorSuggestionsProps) {
    const [items, setItems] = useState<BookableItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    // The block sits below the itinerary; ask Viator only when it is about to scroll into view,
    // so the first view of the page does not wait on (or pay for) an off-screen partner call.
    const rootRef = useRef<HTMLDivElement>(null);
    const [nearViewport, setNearViewport] = useState(false);

    useEffect(() => {
        const node = rootRef.current;
        if (!node || nearViewport) return;
        if (typeof IntersectionObserver === "undefined") {
            setNearViewport(true);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setNearViewport(true);
                observer.disconnect();
            }
        }, { rootMargin: "600px 0px" });
        observer.observe(node);
        return () => observer.disconnect();
    }, [nearViewport]);

    useEffect(() => {
        if (!nearViewport) return;
        async function fetchActivities() {
            setIsLoading(true);
            setError(false);
            try {
                const params = new URLSearchParams({ destination: city, limit: String(limit) });
                if (category) params.set("category", category);
                const response = await fetch(`/api/viator/search?${params}`);
                if (!response.ok) throw new Error("Failed to fetch activities");
                const data = await response.json();
                const activities = (data?.data?.activities ?? []) as Parameters<typeof viatorToBookable>[0][];
                setItems(activities.map(viatorToBookable).filter((item): item is BookableItem => item !== null));
            } catch {
                setError(true);
            } finally {
                setIsLoading(false);
            }
        }
        fetchActivities();
    }, [city, category, limit, nearViewport]);

    // Nothing to book (or partner down): no empty box, no apology text.
    if (error || (!isLoading && items.length === 0)) return <div ref={rootRef} aria-hidden />;

    return (
        <div ref={rootRef} className={className}>
            <BookableSection title={`Book tours in ${city}`} description="Top-rated tours you can add to this trip.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {isLoading
                        ? Array.from({ length: Math.min(limit, 4) }, (_, i) => <BookableCardSkeleton key={i} />)
                        : items.map((item) => <BookableCard key={item.id} item={item} placement="itinerary" />)}
                </div>
            </BookableSection>
        </div>
    );
}
