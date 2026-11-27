"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Clock, ExternalLink, ImageOff, Star } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** The one booking card used on itinerary and spot pages (booking plan B2). */
export interface BookableItem {
    id: string;
    productCode: string;
    title: string;
    imageUrl?: string;
    priceFrom?: number;
    currency?: string;
    rating?: number;
    reviewCount?: number;
    duration?: string;
    freeCancellation?: boolean;
    /** Partner URL that carries our partner id. Items without one are not rendered. */
    url: string;
    partner: "viator" | "getyourguide";
}

export type BookablePlacement = "itinerary" | "spot" | "inline" | "checklist" | "itinerary-day" | "city-hub";

export function formatFromPrice(amount: number | undefined, currency = "USD"): string | null {
    if (!amount || !Number.isFinite(amount) || amount <= 0) return null;
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `$${Math.round(amount)}`;
    }
}

export function trackClick(item: Pick<BookableItem, "partner" | "productCode" | "title"> & { url?: string }, placement: BookablePlacement) {
    try {
        void fetch("/api/affiliates/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
                partner: item.partner,
                trackingId: `${item.partner}-${item.productCode}-${placement}`,
                activityName: item.title.slice(0, 200),
                productCode: item.productCode,
                url: item.url,
                eventType: "click",
            }),
        }).catch(() => undefined);
    } catch {
        // Tracking must never block the booking link.
    }
}

export function BookableCard({ item, placement, className }: { item: BookableItem; placement: BookablePlacement; className?: string }) {
    const [imageFailed, setImageFailed] = useState(false);
    const price = formatFromPrice(item.priceFrom, item.currency);
    const showRating = typeof item.rating === "number" && item.rating > 0 && (item.reviewCount ?? 0) > 0;
    // Inline cards sit under one itinerary stop: a short row (thumbnail left), not a full 16:9 tile.
    const row = placement === "inline";

    return (
        <a
            href={item.url}
            target="_blank"
            rel="sponsored noopener noreferrer"
            onClick={() => trackClick(item, placement)}
            data-bookable-card={item.partner}
            className={cn(
                "group flex overflow-hidden rounded-2xl bg-raised text-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                row ? "flex-row items-stretch" : "h-full flex-col",
                className,
            )}
        >
            <div className={cn("relative shrink-0 overflow-hidden bg-card", row ? "w-24 sm:w-32" : "aspect-[16/9] w-full")}>
                {item.imageUrl && !imageFailed ? (
                    <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes={row ? "128px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <ImageOff className={cn("text-muted-foreground", row ? "h-6 w-6" : "h-8 w-8")} aria-hidden />
                    </div>
                )}
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col", row ? "gap-1 p-3" : "gap-2 p-4")}>
                <h3 className={cn("line-clamp-2 font-semibold leading-snug", row ? "text-sm" : "text-base")}>{item.title}</h3>
                {(showRating || item.duration) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {showRating && (
                            <span className="inline-flex items-center gap-1">
                                <Star className="h-4 w-4 fill-current text-[rgb(var(--ll-warning))]" aria-hidden />
                                <span className="font-medium text-foreground">{item.rating!.toFixed(1)}</span>
                                <span>({item.reviewCount!.toLocaleString("en-US")} reviews)</span>
                            </span>
                        )}
                        {item.duration && item.duration !== "Varies" && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-4 w-4" aria-hidden />
                                {item.duration}
                            </span>
                        )}
                    </div>
                )}
                {item.freeCancellation && <p className="text-sm text-muted-foreground">Free cancellation</p>}
                {row && <p className="text-xs text-muted-foreground">Book via Viator</p>}
                <div className={cn("mt-auto flex flex-wrap items-end justify-between gap-2", row ? "pt-1" : "pt-2")}>
                    {price ? (
                        <p className="text-sm text-muted-foreground">
                            from <span className="text-lg font-bold text-foreground">{price}</span> / person
                        </p>
                    ) : (
                        <span />
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                        Check availability
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </span>
                </div>
            </div>
        </a>
    );
}

export function BookableCardSkeleton() {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-raised" aria-hidden>
            <div className="aspect-[16/9] w-full animate-pulse bg-card" />
            <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-card" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-card" />
            </div>
        </div>
    );
}

/** One section style for every booking block: plain header, 16 px grid gaps, no card around the cards. */
export function BookableSection({
    title,
    description,
    children,
    className,
    sectionRef,
    partnerNote = "Tours from Viator, our booking partner. Prices and availability are set by Viator.",
}: {
    title: string;
    description?: string;
    children: ReactNode;
    className?: string;
    sectionRef?: React.Ref<HTMLElement>;
    partnerNote?: string;
}) {
    return (
        <section ref={sectionRef} className={cn("space-y-4", className)} aria-label={title}>
            <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {children}
            <p className="text-xs text-muted-foreground">{partnerNote}</p>
        </section>
    );
}

/** Map a Viator activity (API shape) to a card item; returns null without a partner URL. */
export function viatorToBookable(activity: {
    id: string;
    productCode: string;
    title: string;
    thumbnailUrl?: string;
    images?: string[];
    priceFrom?: number;
    currency?: string;
    rating?: number;
    reviewCount?: number;
    duration?: string;
    freeCancellation?: boolean;
    viatorUrl?: string;
    bookingUrl?: string;
}): BookableItem | null {
    const url = activity.viatorUrl || activity.bookingUrl;
    if (!url || !/^https:\/\/(www\.)?viator\.com\//.test(url) || !activity.title) return null;
    return {
        id: activity.id || activity.productCode,
        productCode: activity.productCode,
        title: activity.title,
        imageUrl: activity.thumbnailUrl || activity.images?.[0],
        priceFrom: activity.priceFrom,
        currency: activity.currency,
        rating: activity.rating,
        reviewCount: activity.reviewCount,
        duration: activity.duration,
        freeCancellation: activity.freeCancellation,
        url,
        partner: "viator",
    };
}

export function CityTourCards({ city, activities }: {
    city: string;
    activities: Parameters<typeof viatorToBookable>[0][];
}) {
    const items = activities.map(viatorToBookable).filter((item): item is BookableItem => {
        if (!item) return false;
        const { searchParams } = new URL(item.url);
        return Boolean(searchParams.get("pid") && searchParams.get("mcid"));
    });

    if (!items.length) return null;
    return (
        <BookableSection title={`Tours in ${city}`} className="mt-10">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => <BookableCard key={item.id} item={item} placement="city-hub" />)}
            </div>
        </BookableSection>
    );
}
