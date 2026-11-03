"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { dockRect, edgeDock, type DockDot } from "@/lib/spots/edge-dock";
import { pinTone } from "@/lib/spots/pin-clusters";

/** Dots on the screen edge for places that left the map; one frame per map move. */
export function EdgeDockLayer<T extends { id: string; name: string; category: string; location: { lat: number; lng: number } }>({
    map, spots, bottomInset, renderFace, onPick,
}: {
    map: MapLibreMap | null;
    spots: T[];
    bottomInset: number;
    renderFace: (spot: T) => ReactNode;
    onPick: (spot: T) => void;
}) {
    const [dots, setDots] = useState<DockDot[]>([]);
    const spotsRef = useRef(spots);
    const insetRef = useRef(bottomInset);
    const updateRef = useRef<() => void>(() => {});

    useEffect(() => {
        spotsRef.current = spots;
        insetRef.current = bottomInset;
        updateRef.current();
    }, [spots, bottomInset]);

    useEffect(() => {
        if (!map) return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            const box = map.getContainer();
            const width = box.clientWidth;
            const height = box.clientHeight;
            if (!width || !height) return setDots([]);
            const rect = dockRect(width, height, { bottom: insetRef.current });
            const points = spotsRef.current.map((spot) => {
                const point = map.project([spot.location.lng, spot.location.lat]);
                return { id: spot.id, x: point.x, y: point.y };
            });
            const next = edgeDock(points, rect, { fadeOut: width * 1.5, minGap: 22 });
            setDots((previous) => sameDots(previous, next) ? previous : next);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
        updateRef.current = schedule;
        map.on("move", schedule);
        map.on("resize", schedule);
        schedule();
        return () => {
            if (frame) cancelAnimationFrame(frame);
            map.off("move", schedule);
            map.off("resize", schedule);
            updateRef.current = () => {};
        };
    }, [map]);

    if (!dots.length) return null;
    const byId = new Map(spots.map((spot) => [spot.id, spot]));
    return (
        <div className="ll-pin-dock-layer" data-testid="edge-dock">
            {dots.map((dot) => {
                const spot = byId.get(dot.id);
                if (!spot) return null;
                return (
                    <button key={dot.id} type="button" className="ll-pin-dock" data-tone={pinTone(spot.category)} data-dock-id={spot.id}
                        aria-label={`${spot.name}, off the map. Show it`}
                        style={{ transform: `translate(${dot.x}px, ${dot.y}px) translate(-50%, -50%)`, opacity: dot.opacity }}
                        onClick={() => onPick(spot)}>
                        {renderFace(spot)}
                    </button>
                );
            })}
        </div>
    );
}

function sameDots(a: DockDot[], b: DockDot[]) {
    if (a.length !== b.length) return false;
    return a.every((dot, i) => dot.id === b[i].id && Math.abs(dot.x - b[i].x) < 0.5 && Math.abs(dot.y - b[i].y) < 0.5
        && Math.abs(dot.opacity - b[i].opacity) < 0.02);
}
