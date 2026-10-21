import type { PinRoute, PinSpot } from "@/components/spots/spot-pin-map";

/** Day colours dark enough for white badge text (>= 4.5:1). */
export const ITINERARY_DAY_COLORS = [
    "#7c3aed", "#2563eb", "#047857", "#b45309", "#dc2626",
    "#db2777", "#0e7490", "#c2410c", "#4f46e5", "#0f766e",
];

/** Lighter tints of the same hues for the route lines, which must read on the dark map tiles. */
export const ITINERARY_ROUTE_COLORS = [
    "#c4b5fd", "#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5",
    "#f9a8d4", "#67e8f9", "#fdba74", "#a5b4fc", "#5eead4",
];

function dayIndex(day: number): number {
    return (Math.max(1, day) - 1) % ITINERARY_DAY_COLORS.length;
}

export function itineraryRouteColor(day: number): string {
    return ITINERARY_ROUTE_COLORS[dayIndex(day)];
}

export function itineraryDayColor(day: number): string {
    return ITINERARY_DAY_COLORS[dayIndex(day)];
}

export interface ItineraryStop {
    lat: number;
    lng: number;
    activityName: string;
    day: number;
    activityIndex: number;
    category?: string;
    time?: string;
    description?: string;
    address?: string;
    image?: string;
    spotId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Itinerary stops as photo pins: numbered per day in visit order, one dashed route per day. */
export function buildItineraryPins(stops: ItineraryStop[]): { spots: PinSpot[]; routes: PinRoute[] } {
    const ordered = [...stops].sort((left, right) => left.day - right.day || left.activityIndex - right.activityIndex);
    const perDay = new Map<number, number>();
    const spots = ordered.map((stop): PinSpot => {
        const order = (perDay.get(stop.day) ?? 0) + 1;
        perDay.set(stop.day, order);
        const catalogId = stop.spotId && UUID.test(stop.spotId) ? stop.spotId : null;
        return {
            id: `day${stop.day}-${stop.activityIndex}`,
            name: stop.activityName,
            category: stop.category || "Spot",
            location: { lat: stop.lat, lng: stop.lng, address: stop.address || "" },
            // Only stored first-party photos survive getDirectVenuePhotos; others fall back to the tone tile.
            photos: stop.image ? [stop.image] : [],
            // The map's description starts with "<time> - "; the card shows the time in meta already.
            description: stop.time && stop.description?.startsWith(`${stop.time} - `)
                ? stop.description.slice(stop.time.length + 3)
                : stop.description,
            meta: [`Day ${stop.day}`, stop.time].filter(Boolean).join(" · "),
            stop: { label: String(order), color: itineraryDayColor(stop.day), ariaPrefix: `Day ${stop.day}, stop ${order}` },
            href: catalogId ? `/spots/${catalogId}` : null,
        };
    });
    const routes = [...new Set(ordered.map((stop) => stop.day))].map((day) => ({
        key: `day${day}`,
        color: itineraryRouteColor(day),
        points: ordered.filter((stop) => stop.day === day).map((stop) => [stop.lat, stop.lng] as [number, number]),
    }));
    return { spots, routes };
}
