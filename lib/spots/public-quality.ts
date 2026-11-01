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
    "%Alley Bars%",
    "%Office Lunch%",
    "%Working District%",
    "%Station Area%",
    "%-dong Lunch%",
    "%-ga Pojangmacha%",
    "%Jewelry District%",
    "%Local Dining%",
    "%Neighborhood Walk%",
    "%Cafe Street%",
    "% Local",
    "% Local Scene%",
    "% Industry%",
    "% Industrial",
    "%Industrial Area%",
    "%Walking Route%",
    "%Day Trip%",
    "%Bar Crawl%",
    "%Market Crawl%",
    "%Various%",
    "%Multiple%",
] as const;

export const PUBLIC_SPOT_VISIBILITY_CACHE_VERSION = "public-spot-visibility-v9";

const PUBLIC_BROAD_SPOT_NAME_PATTERN =
    /\b(?:residential(?:\s+area)?|(?:office|working)\s+district|station\s+area|office\s+lunch|local\s+dining|local\s+scene|neighborhood\s+walk|cafe\s+street|jewelry\s+district|alley\s+bars|industrial\s+area|walking\s+route|day\s+trip|bar\s+crawl|market\s+crawl|various|multiple)\b|\b(?:[\p{L}\p{N}'-]+-)?(?:dong|ga)\s+(?:industry|lunch|pojangmacha)\b|\blocal$|\b(?:industrial|industry)$/iu;

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

function getPublicSpotLocationIssue(
    spot: PublicSpotQualityInput,
    options: { allowPinnedPlacePhotoAddress?: boolean } = {}
): string | null {
    if (!("address" in spot)) return null;

    const address = getPublicSpotText(spot.address).trim();
    const { lat, lng } = getSpotCoordinateValues(spot.location);
    const confidence = getSpotLocationConfidence({ address, lat, lng });

    if (confidence.exactAddress) return null;
    if (options.allowPinnedPlacePhotoAddress && confidence.usableCoordinates) return null;

    return "inexact_location";
}

const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

function hasRuntimeListingPhoto(spot: PublicSpotQualityInput): boolean {
    const placeId = (spot.google_place_id || spot.googlePlaceId || "").trim();
    return GOOGLE_PLACE_ID_PATTERN.test(placeId) && "address" in spot;
}

export function getPublicSpotQualityIssue(
    spot: PublicSpotQualityInput
): string | null {
    const name = getPublicSpotText(spot.name).trim();

    if (!name) return "missing_name";
    if (PUBLIC_BROAD_SPOT_NAME_PATTERN.test(name)) return "broad_place_name";
    let allowPinnedPlacePhotoAddress = false;

    if ("photos" in spot) {
        const photos = normalizeStoredSpotPhotoUrls(spot.photos);
        const photoSummary = summarizeSpotPhotos(photos);
        if (!photoSummary.hasRealPhoto) {
            // A spot with a valid Google place ID and an exact street address shows its listing
            // photos at runtime (/api/spots/[id]/photos checks city and coordinates first), so no
            // photo reference is stored for it (Places terms). Before this rule no visible or
            // hidden spot had a place ID without photos, so the visibility version stays v9.
            // Stock or placeholder photos still hide the spot: the rule covers only spots with no
            // stored photo at all.
            if (photos.length > 0 || !hasRuntimeListingPhoto(spot)) return "missing_real_photo";
            return getPublicSpotLocationIssue(spot);
        }

        const placeIdentity = getSpotPlacePhotoIdentityStatus(
            photos,
            spot.google_place_id || spot.googlePlaceId || null,
        );
        if (placeIdentity.hasIdentityMismatch) {
            return "mismatched_place_photo_identity";
        }

        allowPinnedPlacePhotoAddress =
            photoSummary.hasGooglePlacePhoto &&
            placeIdentity.hasOwnPlacePhoto &&
            !placeIdentity.hasIdentityMismatch;
    }
    const locationIssue = getPublicSpotLocationIssue(spot, {
        allowPinnedPlacePhotoAddress,
    });
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
