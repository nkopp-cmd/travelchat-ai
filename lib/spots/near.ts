import type { Spot } from "@/types";

/** "My location" on the /spots map: search radius and list size for the "Near you" sheet. */
export const NEAR_RADIUS_KM = 5;
export const NEAR_LIMIT = 12;
/** The browser gives up on a position after this; the map then shows the fallback message. */
export const LOCATE_TIMEOUT_MS = 10_000;

export type NearSpot = Spot & { distanceM: number };
export type NearSpotsResponse = { status: "ok"; spots: NearSpot[] } | { status: "unavailable"; spots: [] };

/** "350 m" below 1 km, else "1.2 km". */
export function formatDistance(meters: number): string {
    return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}
