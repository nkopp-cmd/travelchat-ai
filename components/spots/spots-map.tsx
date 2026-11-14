"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SpotCard } from "@/components/spots/spot-card";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import { decodePinIndex, type DecodedPin, type PinIndex } from "@/lib/spots/pin-index";
import type { PinSpot } from "./spot-pin-map";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/ui/icons";
import { formatDistance, NEAR_RADIUS_KM } from "@/lib/spots/near";
import { TONE_ICONS } from "@/components/spots/category-tone";
import { getDirectVenuePhotos } from "@/components/spots/venue-photo-provider";
import { cardSpotPhotos, spotPhotoPinPath } from "@/lib/spots/own-photo";
import { pinTone } from "@/lib/spots/pin-clusters";
import { useLocate, type LocateStatus } from "./use-locate";
import type { Spot } from "@/types";

// Leaflet and the pin layer load with the map view, not with the spots page.
const SpotPinMap = dynamic(() => import("./spot-pin-map"), {
    ssr: false,
    loading: () => <p role="status" className="grid h-full place-items-center text-muted-foreground">Loading map...</p>,
});

interface SpotsMapProps {
    spots: Spot[];
    city?: string;
    /** Query of the active filter for the full pin index ("" = all spots); omit to pin only the listed spots. */
    pinQuery?: string;
    currentPage: number;
    /** Pagination, shown at the end of the list sheet. */
    footer?: ReactNode;
    /** Leaves the map view (phones cover the page with the map, so the sheet carries the way back). */
    onClose?: () => void;
    /** Cities for the fallback picker when the location is not available. */
    cities?: Array<{ slug: string; name: string }>;
}

/** Sheet positions on phones: the whole list, list and map shared, or the map with a peeking handle. */
export type SheetSnap = "list" | "half" | "map";
const SNAP_ORDER: SheetSnap[] = ["list", "half", "map"];
const SNAP_FRACTION: Record<SheetSnap, number> = { list: 0, half: 0.5, map: 1 };
/** Visible sheet height in the map position: handle, the count row and the three-spot peek row. */
const PEEK_PX = 128;
/** A flick faster than this (px/ms) moves one position in its direction. */
const FLICK_SPEED = 0.45;

export function nextSnap(current: SheetSnap, offsetFraction: number, velocity: number): SheetSnap {
    // A flick goes to the next position past the release point in its direction.
    if (velocity > FLICK_SPEED) return SNAP_ORDER.find((snap) => SNAP_FRACTION[snap] > offsetFraction) ?? "map";
    if (velocity < -FLICK_SPEED) {
        return [...SNAP_ORDER].reverse().find((snap) => SNAP_FRACTION[snap] < offsetFraction) ?? "list";
    }
    return SNAP_ORDER.reduce((best, snap) =>
        Math.abs(SNAP_FRACTION[snap] - offsetFraction) < Math.abs(SNAP_FRACTION[best] - offsetFraction) ? snap : best, current);
}

/**
 * Airbnb-style discovery map. Phones: a full-height dark map with a draggable list sheet
 * (swipe up for the list, down for the map). Desktop: the list beside a sticky map.
 */
export default function SpotsMap({ spots, pinQuery, footer, onClose, cities = [] }: SpotsMapProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Phones open on the map with only the handle and the count showing; one tap or swipe opens the list.
    const [snap, setSnap] = useState<SheetSnap>("map");
    const [dragPx, setDragPx] = useState<number | null>(null);
    const drag = useRef<{ startY: number; startPx: number; travel: number; lastY: number; lastT: number; velocity: number } | null>(null);
    const section = useRef<HTMLElement | null>(null);
    const sheetId = useId();
    const sheetInset = useSheetInset(section, snap);
    // "My location": a fix opens the sheet halfway on the nearest spots ("Near you").
    const locate = useLocate(useCallback(() => setSnap("half"), []));
    const nearMode = locate.status === "near";
    const listSpots = nearMode ? locate.spots : spots;
    const user = useMemo(() => locate.point ? { ...locate.point, fix: locate.fix } : null, [locate.point, locate.fix]);
    const pinnedSpots = useMemo(
        () => spots.filter((spot) => getSpotLocationConfidence(spot.location).usableCoordinates),
        [spots]
    );
    const missingCount = spots.length - pinnedSpots.length;
    const { pins: indexPins, cards, loadCard } = usePinIndex(pinQuery);
    // The full index once it arrives; the listed spots (with photos) keep their data in it.
    const mapSpots = useMemo<PinSpot[]>(() => {
        if (!indexPins) return pinnedSpots;
        const keyLength = indexPins[0]?.key.length ?? 8;
        const listed = new Map(pinnedSpots.map((spot) => [spot.id.slice(0, keyLength), spot]));
        return indexPins.map((pin) => {
            const spot = listed.get(pin.key);
            if (spot) return { ...spot, id: pin.key, href: `/spots/${spot.id}` };
            return cards[pin.key] ?? stubPin(pin);
        });
    }, [indexPins, pinnedSpots, cards]);
    const dockSpots = useMemo(() => {
        if (!indexPins) return undefined;
        const keyLength = indexPins[0]?.key.length ?? 8;
        return pinnedSpots.map((spot) => ({ ...spot, id: spot.id.slice(0, keyLength), href: `/spots/${spot.id}` }));
    }, [indexPins, pinnedSpots]);

    // Desktop: bring the list + map split to the top. Phones show the map as a fixed full-screen layer.
    useEffect(() => {
        if (window.matchMedia?.("(min-width: 1024px)").matches) section.current?.scrollIntoView?.({ block: "start" });
    }, []);

    const selectPin = useCallback((id: string | null) => {
        setSelectedId(id);
        if (id && indexPins) loadCard(id);
        // Lower the sheet so the pin card has room on the map.
        if (id) setSnap("map");
    }, [indexPins, loadCard]);

    const travelOf = (sheet: HTMLElement) => Math.max(sheet.getBoundingClientRect().height - PEEK_PX, 1);

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const sheet = event.currentTarget.parentElement;
        if (!sheet || event.button > 0) return;
        const travel = travelOf(sheet);
        drag.current = { startY: event.clientY, startPx: SNAP_FRACTION[snap] * travel, travel,
            lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = drag.current;
        if (!state) return;
        const dt = event.timeStamp - state.lastT;
        if (dt > 0) state.velocity = (event.clientY - state.lastY) / dt;
        state.lastY = event.clientY;
        state.lastT = event.timeStamp;
        setDragPx(Math.min(Math.max(state.startPx + event.clientY - state.startY, 0), state.travel));
    };
    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = drag.current;
        drag.current = null;
        if (!state) return;
        const moved = Math.abs(event.clientY - state.startY);
        setDragPx(null);
        // A tap on the handle moves one position: list -> half -> map -> list.
        if (moved < 6) return setSnap(SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length]);
        const offset = Math.min(Math.max(state.startPx + event.clientY - state.startY, 0), state.travel);
        setSnap(nextSnap(snap, offset / state.travel, state.velocity));
    };

    const sheetY = dragPx !== null ? `${dragPx}px` : `calc((100% - ${PEEK_PX}px) * ${SNAP_FRACTION[snap]})`;
    const countLabel = nearMode
        ? `Near you · ${listSpots.length} ${listSpots.length === 1 ? "spot" : "spots"}`
        : indexPins
        ? `${indexPins.length.toLocaleString("en-US")} ${indexPins.length === 1 ? "spot" : "spots"} on the map`
        : `${spots.length} ${spots.length === 1 ? "spot" : "spots"}`;

    const peekSpots = listSpots.slice(0, 3);
    const pinKeyOf = (id: string) => indexPins?.length ? id.slice(0, indexPins[0].key.length) : id;

    return (
        <section ref={section} aria-label="Discovery map"
            className={cn(
                "fixed inset-x-0 bottom-[var(--ll-nav-clearance)] top-[var(--ll-topbar-height)] z-40 overflow-hidden",
                "lg:relative lg:inset-auto lg:z-auto lg:grid lg:h-[calc(100dvh-var(--ll-topbar-height)-2rem)] lg:scroll-mt-[calc(var(--ll-topbar-height)+1rem)]",
                "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5 lg:overflow-visible",
            )}>
            <div className="absolute inset-0 isolate bg-background max-lg:[--ll-map-bottom-inset:128px] lg:relative lg:order-2 lg:min-h-0 lg:overflow-hidden lg:rounded-2xl"
                role="region" aria-label="Map of the matching spots" data-pin-total={indexPins?.length}>
                {mapSpots.length > 0 ? (
                    <SpotPinMap spots={mapSpots} fitKey={indexPins ? `index${pinQuery}` : "page"} dockSpots={dockSpots}
                        selectedId={selectedId} onSelect={selectPin} bottomInset={sheetInset} user={user} />
                ) : (
                    <p role="status" className="grid h-full place-items-center p-6 text-center text-muted-foreground">
                        No map pins are available for this page. No locations have been estimated.
                    </p>
                )}
                <button type="button" onClick={locate.locate} aria-label="Show my location" data-testid="map-locate"
                    aria-busy={locate.status === "asking" || undefined}
                    style={{ bottom: `${sheetInset + 12}px` }}
                    className="absolute right-3 z-[5] grid size-11 place-items-center rounded-full bg-surface text-primary shadow-overlay transition-[bottom] duration-300 ease-out motion-reduce:transition-none lg:right-4">
                    <Navigation className={cn("size-5", locate.status === "asking" && "animate-pulse")} aria-hidden="true" />
                </button>
                {(locate.status === "asking" || nearMode) && (
                    <p role="status" className="sr-only">{nearMode ? countLabel : "Finding your location"}</p>
                )}
            </div>

            <div id={sheetId} data-snap={snap} data-dragging={dragPx !== null ? "" : undefined}
                style={{ ["--sheet-y" as string]: sheetY }}
                className={cn(
                    "absolute inset-x-0 bottom-0 top-3 z-10 flex flex-col rounded-t-3xl bg-surface shadow-overlay max-lg:top-[calc(var(--ll-map-filters-height,0px)+0.75rem)]",
                    "max-lg:[transform:translateY(var(--sheet-y))] max-lg:will-change-transform",
                    dragPx === null && "transition-transform duration-300 ease-out motion-reduce:transition-none",
                    "lg:static lg:order-1 lg:min-h-0 lg:rounded-2xl lg:shadow-none",
                )}>
                <div className="shrink-0 cursor-grab touch-none select-none px-5 pb-3 pt-2 active:cursor-grabbing lg:cursor-default lg:pt-4"
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}>
                    <button type="button" className="mx-auto -mt-2 grid h-6 w-16 place-items-center lg:hidden"
                        aria-controls={sheetId} aria-expanded={snap !== "map"}
                        aria-label={snap === "list" ? "Show the map" : snap === "half" ? "Show only the map" : "Show the list"}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setSnap(snap === "map" ? "list" : snap === "half" ? "map" : "half")}>
                        <span aria-hidden="true" className="block h-1.5 w-10 rounded-full bg-muted-foreground/40" />
                    </button>
                    {/* Handle row: count left, the way back to the page right (a word, not a third X). */}
                    <div className="flex min-h-11 items-center gap-3">
                        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold" data-testid="map-sheet-title">{countLabel}</p>
                        {nearMode && (
                            <button type="button" onClick={locate.reset} onPointerDown={(event) => event.stopPropagation()}
                                className="min-h-11 shrink-0 text-sm font-medium text-primary">
                                Show all spots
                            </button>
                        )}
                        {onClose && (
                            <button type="button" onClick={onClose} onPointerDown={(event) => event.stopPropagation()}
                                className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-primary hover:bg-raised lg:hidden"
                                aria-label="Close map">
                                List
                            </button>
                        )}
                    </div>
                    {missingCount > 0 && !indexPins && !nearMode && (
                        <p className="text-center text-[13px] text-muted-foreground lg:text-left">
                            {missingCount} without coordinates are listed but not on the map
                        </p>
                    )}
                </div>
                    {/* Peek: the first (or nearest) three places, so the lowered sheet is never an empty title. */}
                    {snap === "map" && dragPx === null && peekSpots.length > 0 && (
                        <ul aria-label={nearMode ? "Nearest spots" : "Top spots"} data-testid="map-sheet-peek"
                            className="-mt-1 flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
                            {peekSpots.map((spot) => (
                                <li key={spot.id} className="w-[46%] max-w-48 shrink-0">
                                    <button type="button" onClick={() => selectPin(pinKeyOf(spot.id))}
                                        className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-raised p-1.5 pr-3 text-left">
                                        <PeekThumb spot={spot} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-semibold leading-tight">{spot.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {"distanceM" in spot && typeof spot.distanceM === "number" ? formatDistance(spot.distanceM) : spot.category}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                <ul aria-label={nearMode ? "Spots near you" : "Spots on this page"}
                    className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6",
                        snap === "map" && dragPx === null && "max-lg:invisible")}>
                    {listSpots.map((spot, index) => (
                        <li key={spot.id} aria-current={selectedId && spot.id.startsWith(selectedId) ? "true" : undefined}
                            className="rounded-2xl">
                            {"distanceM" in spot && typeof spot.distanceM === "number" && (
                                <p className="px-1 pb-1 text-[13px] font-medium text-muted-foreground">{formatDistance(spot.distanceM)} away</p>
                            )}
                            {/* The first card is the LCP image in map view. */}
                            <SpotCard spot={spot} priority={index === 0} />
                        </li>
                    ))}
                    {footer && !nearMode && <li className="list-none">{footer}</li>}
                </ul>
            </div>
            {/* Above the sheet (z-10): the map region is its own stacking context, so the message lives here. */}
            <LocateMessage status={locate.status} cities={cities} onRetry={locate.locate} onDismiss={locate.reset} />
        </section>
    );
}

const LOCATE_MESSAGES: Partial<Record<LocateStatus, { title: string; body?: string; retry?: boolean }>> = {
    denied: {
        title: "Location is off for Localley.",
        body: "On iPhone: Settings > Privacy & Security > Location Services > Safari Websites > While Using. Then tap the location button again.",
    },
    off: { title: "Your phone did not share a location.", body: "Turn on Location Services and try again.", retry: true },
    timeout: { title: "We could not find you in 10 seconds.", body: "Try again near a window or outside.", retry: true },
    empty: { title: `No Localley spots within ${NEAR_RADIUS_KM} km of you yet.` },
    error: { title: "Nearby spots did not load.", retry: true },
};

/** One short message when "My location" cannot help, with a city picker as the way on. */
function LocateMessage({ status, cities, onRetry, onDismiss }: {
    status: LocateStatus; cities: Array<{ slug: string; name: string }>; onRetry: () => void; onDismiss: () => void;
}) {
    const message = LOCATE_MESSAGES[status];
    if (!message) return null;
    return (
        <div role="alert" data-testid="map-locate-message" data-status={status}
            className="absolute inset-x-3 bottom-3 z-20 space-y-2 rounded-2xl bg-raised p-4 text-sm shadow-overlay lg:left-auto lg:right-4 lg:bottom-4 lg:w-96">
            <p className="font-semibold">{message.title}</p>
            {message.body && <p className="text-muted-foreground">{message.body}</p>}
            {cities.length > 0 && (
                <>
                    <p className="text-muted-foreground">Or pick a city:</p>
                    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Cities">
                        {cities.map((city) => (
                            <li key={city.slug} className="shrink-0">
                                <Link href={`/spots?city=${city.slug}&view=map`} prefetch={false}
                                    className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 font-medium">
                                    {city.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <div className="flex gap-2">
                {message.retry && (
                    <button type="button" onClick={onRetry} className="min-h-11 rounded-xl bg-primary px-4 font-medium text-primary-foreground">
                        Try again
                    </button>
                )}
                <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl px-4 font-medium text-primary">OK</button>
            </div>
        </div>
    );
}

/** A pin from the index before its card is fetched: category tile, no photo, no link yet. */
function stubPin(pin: DecodedPin): PinSpot {
    const category = pin.category ?? "Spot";
    return {
        id: pin.key,
        name: `${category} spot`,
        category,
        location: { lat: pin.lat, lng: pin.lng, address: "" },
        photos: [],
        localleyScore: pin.score ?? undefined,
        meta: "Loading…",
        href: null,
    };
}

/**
 * The full pin index for the active filter: one request when the map opens (edge and browser cached), then
 * one small card request per tapped pin.
 */
function usePinIndex(query: string | undefined) {
    const [state, setState] = useState<{ query: string; pins: DecodedPin[] } | null>(null);
    const [cards, setCards] = useState<Record<string, PinSpot>>({});
    const requested = useRef(new Set<string>());
    useEffect(() => {
        if (query === undefined) return;
        const controller = new AbortController();
        fetch(`/api/spots/pins${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() as Promise<PinIndex> : null))
            .then((index) => { if (index?.v === 1) setState({ query, pins: decodePinIndex(index) }); })
            .catch(() => undefined);
        return () => controller.abort();
    }, [query]);
    const loadCard = useCallback((key: string) => {
        if (requested.current.has(key)) return;
        requested.current.add(key);
        fetch(`/api/spots/pins/${encodeURIComponent(key)}`)
            .then((response) => (response.ok ? response.json() as Promise<{ spot: Spot }> : null))
            .then((data) => {
                if (!data?.spot) throw new Error("no card");
                const spot = data.spot;
                setCards((current) => ({ ...current, [key]: { ...spot, id: key, href: `/spots/${spot.id}` } }));
            })
            .catch(() => { requested.current.delete(key); });
    }, []);
    return { pins: state && state.query === query ? state.pins : null, cards, loadCard };
}

/**
 * Visible phone sheet height: it starts `top` px below the section top (12px + the floating search bar)
 * and moves down by (sheet height - PEEK_PX) * fraction.
 */
export function sheetInset(height: number, snap: SheetSnap, top = 12): number {
    const sheet = height - top;
    return Math.max(0, Math.round(sheet - (sheet - PEEK_PX) * SNAP_FRACTION[snap]));
}

/**
 * Height of the phone sheet over the map at a snap position (0 on desktop, where the list sits
 * beside the map), so the map fits its pins into the part that stays visible.
 */
function useSheetInset(section: { current: HTMLElement | null }, snap: SheetSnap): number {
    const [inset, setInset] = useState(0);
    useEffect(() => {
        const element = section.current;
        if (!element) return;
        const measure = () => {
            if (window.matchMedia?.("(min-width: 1024px)").matches) return setInset(0);
            const floating = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ll-map-filters-height")) || 0;
            setInset(sheetInset(element.clientHeight, snap, 12 + floating));
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [section, snap]);
    return inset;
}

/** 40px thumb of a peek row: the pin-size photo (same cached URL as the pin), else the category tone tile. */
function PeekThumb({ spot }: { spot: Spot }) {
    const tone = pinTone(spot.category);
    const Icon = TONE_ICONS[tone];
    const card = getDirectVenuePhotos(cardSpotPhotos({ ownPhoto: spot.ownPhoto, photos: spot.photos, googlePlaceId: spot.googlePlaceId }))[0]?.url;
    const photo = card ? spotPhotoPinPath(card) : undefined;
    const [failed, setFailed] = useState<string | null>(null);
    if (photo && failed !== photo) {
        // eslint-disable-next-line @next/next/no-img-element -- the pin's own small thumbnail, lazy.
        return <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(photo)}
            className="size-8 shrink-0 rounded-lg object-cover" />;
    }
    return (
        <span aria-hidden="true" data-tone={tone} className="ll-photo-tile size-8 shrink-0 rounded-lg">
            <Icon className="size-4" />
        </span>
    );
}
