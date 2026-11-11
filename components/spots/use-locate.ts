"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCATE_TIMEOUT_MS, type NearSpot, type NearSpotsResponse } from "@/lib/spots/near";

export type LocateStatus = "idle" | "asking" | "near" | "empty" | "denied" | "off" | "timeout" | "error";
export interface UserPoint { lat: number; lng: number }

/** Session only: closing the tab forgets it. Rounded to ~110 m, as the server query. */
export const LAST_POSITION_KEY = "ll-last-position";

function readSessionPoint(): UserPoint | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(LAST_POSITION_KEY) ?? "null") as UserPoint | null;
        return value && Number.isFinite(value.lat) && Number.isFinite(value.lng) ? value : null;
    } catch {
        return null;
    }
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * "My location" for the /spots map (localley-mobile-map-ux-asia-growth.md item 2). Asks the browser for the
 * position only when called (a tap), never on load. One request for the nearest spots after a fix.
 */
export function useLocate(onNear?: () => void) {
    const [status, setStatus] = useState<LocateStatus>("idle");
    const [point, setPoint] = useState<UserPoint | null>(null);
    // Increments on each fix, so the map recentres on every tap, also at the same point.
    const [fix, setFix] = useState(0);
    const [spots, setSpots] = useState<NearSpot[]>([]);
    const run = useRef(0);
    const onNearRef = useRef(onNear);
    useEffect(() => { onNearRef.current = onNear; }, [onNear]);

    // A position from earlier in this session shows the dot again (no prompt, no recentre).
    useEffect(() => {
        const saved = readSessionPoint();
        if (saved) queueMicrotask(() => setPoint((current) => current ?? saved));
    }, []);

    const locate = useCallback(() => {
        const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
        if (!geo) return setStatus("off");
        const id = ++run.current;
        setStatus("asking");
        // Some browsers never call back when the prompt is ignored: our own timer ends the wait.
        const timer = setTimeout(() => { if (run.current === id) { run.current++; setStatus("timeout"); } }, LOCATE_TIMEOUT_MS);
        geo.getCurrentPosition((position) => {
            if (run.current !== id) return;
            clearTimeout(timer);
            const next = { lat: round(position.coords.latitude), lng: round(position.coords.longitude) };
            try { sessionStorage.setItem(LAST_POSITION_KEY, JSON.stringify(next)); } catch { /* private mode */ }
            fetch(`/api/spots/near?lat=${next.lat}&lng=${next.lng}`)
                .then((response) => response.json() as Promise<NearSpotsResponse>)
                .then((body) => {
                    if (run.current !== id) return;
                    if (body.status !== "ok") return setStatus("error");
                    setSpots(body.spots);
                    setPoint(next);
                    setFix((value) => value + 1);
                    setStatus(body.spots.length > 0 ? "near" : "empty");
                    if (body.spots.length > 0) onNearRef.current?.();
                })
                .catch(() => { if (run.current === id) setStatus("error"); });
        }, (error) => {
            if (run.current !== id) return;
            clearTimeout(timer);
            setStatus(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "off");
        }, { enableHighAccuracy: false, maximumAge: 300_000, timeout: LOCATE_TIMEOUT_MS });
    }, []);

    /** Leaves "Near you" and hides the message; the dot stays. */
    const reset = useCallback(() => { run.current++; setStatus("idle"); }, []);

    return { status, point, fix, spots, locate, reset };
}
