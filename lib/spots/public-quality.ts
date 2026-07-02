import type { MultiLanguageField } from "@/types";
import {
    getSpotPlacePhotoIdentityStatus,
    normalizeStoredSpotPhotoUrls,
    summarizeSpotPhotos,
} from "@/lib/place-images";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";

type PublicSpotTextField = MultiLanguageField | string | null | undefined;

export interface PublicSpotQualityInput {
    name: PublicSpotTextField;
    address?: PublicSpotTextField;
    location?: unknown;
    photos?: string[] | null;
    google_place_id?: string | null;
    googlePlaceId?: string | null;
}

export const PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS = [
    "%Residential%",
    "%Office District%",
    "%Working District%",
    "%Station Area%",
    "% Local",
    "% Local Scene%",
    "% Industrial",
    "%Industrial Area%",
    "%Walking Route%",
    "%Day Trip%",
    "%Bar Crawl%",
    "%Market Crawl%",
    "%Various%",
    "%Multiple%",
] as const;

export const PUBLIC_SPOT_VISIBILITY_CACHE_VERSION = "public-spot-visibility-v8";

const PUBLIC_BROAD_SPOT_NAME_PATTERN =
    /\b(?:residential(?:\s+area)?|(?:office|working)\s+district|station\s+area|local\s+scene|industrial\s+area|walking\s+route|day\s+trip|bar\s+crawl|market\s+crawl|various|multiple)\b|\blocal$|\bindustrial$/i;

type PublicSpotFilterBuilder<TQuery> = {
    not: (column: string, operator: string, value: string | null) => TQuery;
};

function getPublicSpotText(field: PublicSpotTextField): string {
    if (!field) return "";

    if (typeof field === "object") {
        return field.en || Object.values(field)[0] || "";
    }

    return field;
}

function getPublicSpotLocationIssue(spot: PublicSpotQualityInput): string | null {
    if (!("address" in spot)) return null;

    const address = getPublicSpotText(spot.address).trim();
    const { lat, lng } = getSpotCoordinateValues(spot.location);
    const confidence = getSpotLocationConfidence({ address, lat, lng });

    return confidence.exactAddress ? null : "inexact_location";
}

export function getPublicSpotQualityIssue(
    spot: PublicSpotQualityInput
): string | null {
    const name = getPublicSpotText(spot.name).trim();

    if (!name) return "missing_name";
    if (PUBLIC_BROAD_SPOT_NAME_PATTERN.test(name)) return "broad_place_name";
    if ("photos" in spot) {
        const photos = normalizeStoredSpotPhotoUrls(spot.photos);
        const photoSummary = summarizeSpotPhotos(photos);
        if (!photoSummary.hasRealPhoto) {
            return "missing_real_photo";
        }

        const placeIdentity = getSpotPlacePhotoIdentityStatus(
            photos,
            spot.google_place_id || spot.googlePlaceId || null,
        );
        if (placeIdentity.hasIdentityMismatch) {
            return "mismatched_place_photo_identity";
        }
    }
    const locationIssue = getPublicSpotLocationIssue(spot);
    if (locationIssue) return locationIssue;

    return null;
}

export function shouldShowPublicSpot(spot: PublicSpotQualityInput): boolean {
    return getPublicSpotQualityIssue(spot) === null;
}

export function applyPublicSpotVisibilityFilters<
    TQuery extends PublicSpotFilterBuilder<TQuery>,
>(
    query: TQuery
): TQuery {
    let currentQuery = query;

    for (const pattern of PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS) {
        currentQuery = currentQuery.not("name->>en", "ilike", pattern);
    }

    return currentQuery
        .not("photos", "is", null)
        .not("photos", "eq", "{}");
}
