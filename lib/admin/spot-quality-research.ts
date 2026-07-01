import type { SpotQualityItem, SpotQualityIssue } from "@/lib/admin/spot-quality";
import { buildSpotDirectionsUrl } from "@/lib/spots/map-links";

export interface SpotResearchInput {
    name: string;
    address: string;
    category: string | null;
    lat: number | null;
    lng: number | null;
    googlePlaceId?: string | null;
    issues: SpotQualityIssue[];
}

export interface SpotResearchLinks {
    query: string;
    mapsUrl: string;
    directionsUrl: string;
    imageSearchUrl: string;
    placeIdSearchUrl: string;
    coordinateText: string | null;
    recommendedFocus: string;
}

function cleanPart(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

function getCoordinateText(lat: number | null, lng: number | null): string | null {
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
}

export function buildSpotResearchQuery(input: SpotResearchInput): string {
    const parts = [
        cleanPart(input.name),
        cleanPart(input.address),
        cleanPart(input.category),
    ].filter(Boolean);

    return Array.from(new Set(parts)).join(" ");
}

export function getSpotResearchFocus(issues: SpotQualityIssue[]): string {
    if (issues.includes("missing_real_photo") && issues.includes("inexact_location")) {
        return "Find the exact business/place first, then add a real photo and precise coordinates.";
    }

    if (issues.includes("missing_real_photo")) {
        return "Find a real, review-safe spot image before the record appears as production-ready.";
    }

    if (issues.includes("inexact_location")) {
        return "Replace the area-level address with an exact mappable address and coordinates.";
    }

    if (issues.includes("missing_place_id")) {
        return "Add the durable Google Place ID after the Supabase column migration is live.";
    }

    if (issues.includes("broad_place_name") || issues.includes("missing_name")) {
        return "Replace the broad label with the actual place name travelers can search.";
    }

    return "Confirm the public card and details are still accurate.";
}

export function buildSpotResearchLinks(input: SpotResearchInput): SpotResearchLinks {
    const query = buildSpotResearchQuery(input);
    const encodedQuery = encodeURIComponent(query);

    return {
        query,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
        directionsUrl: buildSpotDirectionsUrl({
            name: cleanPart(input.name),
            address: cleanPart(input.address),
            lat: input.lat ?? undefined,
            lng: input.lng ?? undefined,
            googlePlaceId: cleanPart(input.googlePlaceId),
        }),
        imageSearchUrl: `https://www.google.com/search?tbm=isch&q=${encodedQuery}`,
        placeIdSearchUrl: `https://developers.google.com/maps/documentation/places/web-service/place-id#find-id`,
        coordinateText: getCoordinateText(input.lat, input.lng),
        recommendedFocus: getSpotResearchFocus(input.issues),
    };
}

export function buildSpotQualityItemResearchLinks(item: SpotQualityItem): SpotResearchLinks {
    return buildSpotResearchLinks({
        name: item.name,
        address: item.address,
        category: item.category,
        lat: item.lat,
        lng: item.lng,
        googlePlaceId: item.googlePlaceId,
        issues: item.issues,
    });
}
