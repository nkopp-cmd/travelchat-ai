"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { SpotCard } from "@/components/spots/spot-card";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import { cn } from "@/lib/utils";
import { X } from "@/components/ui/icons";
import type { Spot } from "@/types";

// Leaflet and the pin layer load with the map view, not with the spots page.
const SpotPinMap = dynamic(() => import("./spot-pin-map"), {
    ssr: false,
    loading: () => <p role="status" className="grid h-full place-items-center text-muted-foreground">Loading map...</p>,
});

interface SpotsMapProps {
    spots: Spot[];
    city?: string;
    currentPage: number;
    /** Pagination, shown at the end of the list sheet. */
    footer?: ReactNode;
    /** Leaves the map view (phones cover the page with the map, so the sheet carries the way back). */
    onClose?: () => void;
}

/** Sheet positions on phones: the whole list, list and map shared, or the map with a peeking handle. */
export type SheetSnap = "list" | "half" | "map";
const SNAP_ORDER: SheetSnap[] = ["list", "half", "map"];
const SNAP_FRACTION: Record<SheetSnap, number> = { list: 0, half: 0.5, map: 1 };
/** Visible sheet height in the map position: handle plus the result count. */
const PEEK_PX = 88;
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
export default function SpotsMap({ spots, footer, onClose }: SpotsMapProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [snap, setSnap] = useState<SheetSnap>("half");
    const [dragPx, setDragPx] = useState<number | null>(null);
    const drag = useRef<{ startY: number; startPx: number; travel: number; lastY: number; lastT: number; velocity: number } | null>(null);
    const section = useRef<HTMLElement | null>(null);
    const sheetId = useId();
    const sheetInset = useSheetInset(section, snap);
    const pinnedSpots = useMemo(
        () => spots.filter((spot) => getSpotLocationConfidence(spot.location).usableCoordinates),
        [spots]
    );
    const missingCount = spots.length - pinnedSpots.length;

    // Desktop: bring the list + map split to the top. Phones show the map as a fixed full-screen layer.
    useEffect(() => {
        if (window.matchMedia?.("(min-width: 1024px)").matches) section.current?.scrollIntoView?.({ block: "start" });
    }, []);

    const selectPin = useCallback((id: string | null) => {
        setSelectedId(id);
        // Lower the sheet so the pin card has room on the map.
        if (id) setSnap("map");
    }, []);

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
    const countLabel = `${spots.length} ${spots.length === 1 ? "spot" : "spots"}`;

    return (
        <section ref={section} aria-label="Discovery map"
            className={cn(
                "fixed inset-x-0 bottom-[var(--ll-nav-clearance)] top-[var(--ll-topbar-height)] z-40 overflow-hidden",
                "lg:relative lg:inset-auto lg:z-auto lg:grid lg:h-[calc(100dvh-var(--ll-topbar-height)-2rem)] lg:scroll-mt-[calc(var(--ll-topbar-height)+1rem)]",
                "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5 lg:overflow-visible",
            )}>
            <div className="absolute inset-0 isolate bg-background max-lg:[--ll-map-bottom-inset:88px] lg:relative lg:order-2 lg:min-h-0 lg:overflow-hidden lg:rounded-2xl"
                role="region" aria-label="Map of this page's spots">
                {pinnedSpots.length > 0 ? (
                    <SpotPinMap spots={pinnedSpots} selectedId={selectedId} onSelect={selectPin} bottomInset={sheetInset} />
                ) : (
                    <p role="status" className="grid h-full place-items-center p-6 text-center text-muted-foreground">
                        No map pins are available for this page. No locations have been estimated.
                    </p>
                )}
            </div>

            <div id={sheetId} data-snap={snap} data-dragging={dragPx !== null ? "" : undefined}
                style={{ ["--sheet-y" as string]: sheetY }}
                className={cn(
                    "absolute inset-x-0 bottom-0 top-3 z-10 flex flex-col rounded-t-3xl bg-surface shadow-overlay",
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
                    <div className="relative">
                        <p className="text-center text-[15px] font-semibold lg:text-left">{countLabel}</p>
                        {onClose && (
                            <button type="button" onClick={onClose} onPointerDown={(event) => event.stopPropagation()}
                                className="absolute -top-1 right-0 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-raised hover:text-foreground lg:hidden"
                                aria-label="Close map">
                                <X className="size-5" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    {missingCount > 0 && (
                        <p className="text-center text-[13px] text-muted-foreground lg:text-left">
                            {missingCount} without coordinates are listed but not on the map
                        </p>
                    )}
                </div>
                <ul aria-label="Spots on this page"
                    className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6",
                        snap === "map" && dragPx === null && "max-lg:invisible")}>
                    {spots.map((spot, index) => (
                        <li key={spot.id} aria-current={spot.id === selectedId ? "true" : undefined}
                            className="rounded-2xl">
                            {/* The first card is the LCP image in map view. */}
                            <SpotCard spot={spot} priority={index === 0} />
                        </li>
                    ))}
                    {footer && <li className="list-none">{footer}</li>}
                </ul>
            </div>
        </section>
    );
}

/** Visible phone sheet height: it starts 12px below the top (top-3) and moves down by (height - PEEK_PX) * fraction. */
export function sheetInset(height: number, snap: SheetSnap): number {
    return Math.max(0, Math.round(height - 12 - (height - PEEK_PX) * SNAP_FRACTION[snap]));
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
            setInset(sheetInset(element.clientHeight, snap));
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [section, snap]);
    return inset;
}
