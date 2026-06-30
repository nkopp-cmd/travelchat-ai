import { MultiLanguageField } from "@/types";

export interface SpotPhotoBackfillRow {
    id: string;
    name: MultiLanguageField;
    address: MultiLanguageField;
    photos: string[] | null;
    category?: string | null;
}

export interface GooglePlacePhotoCandidate {
    name: string;
    widthPx?: number;
    heightPx?: number;
}

export interface PlacePhotoSearchResult {
    placeId: string | null;
    displayName: string | null;
    photos: GooglePlacePhotoCandidate[];
}

const GOOGLE_PHOTO_PROXY_PATH = "/api/places/photo";
const MAX_PHOTOS_PER_SPOT = 3;

export function getGooglePlacesApiKey(): string | null {
    return (
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        null
    );
}

export function getLocalizedFieldValue(field: MultiLanguageField): string {
    if (!field) return "";
    if (typeof field === "string") return field;
    return field.en || Object.values(field).find(Boolean) || "";
}

export function buildPlacePhotoProxyUrl(photoName: string, width = 1200): string {
    const params = new URLSearchParams({ w: String(width) });

    if (photoName.startsWith("places/")) {
        params.set("name", photoName);
    } else {
        params.set("ref", photoName);
    }

    return `${GOOGLE_PHOTO_PROXY_PATH}?${params.toString()}`;
}

export function normalizePhotoWidth(value: string | null, fallback = 1200): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(1600, Math.max(240, parsed));
}

export function isBackfilledPlacePhotoUrl(photo: string): boolean {
    if (!photo) return false;

    try {
        const url = new URL(photo, "https://www.localley.io");
        return (
            url.pathname === GOOGLE_PHOTO_PROXY_PATH &&
            (url.searchParams.has("name") || url.searchParams.has("ref"))
        );
    } catch {
        return false;
    }
}

export function needsSpotPhotoBackfill(photos: string[] | null | undefined): boolean {
    if (!photos || photos.length === 0) return true;

    return !photos.some((photo) => {
        if (!photo) return false;
        if (isBackfilledPlacePhotoUrl(photo)) return true;

        try {
            const url = new URL(photo, "https://www.localley.io");
            const host = url.hostname.toLowerCase();
            const path = url.pathname.toLowerCase();

            if (path.includes("placeholder")) return false;
            if (host.includes("unsplash.com")) return false;
            if (host === "places.googleapis.com" || host === "maps.googleapis.com") {
                return false;
            }

            return url.protocol === "https:";
        } catch {
            return false;
        }
    });
}

export async function findGooglePlacePhotos(
    name: string,
    address: string,
    apiKey: string
): Promise<PlacePhotoSearchResult | null> {
    const textQuery = [name, address].filter(Boolean).join(", ");
    if (!textQuery) return null;

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
        },
        body: JSON.stringify({
            textQuery,
            maxResultCount: 1,
        }),
    });

    if (!response.ok) {
        throw new Error(`Google Places search failed with ${response.status}`);
    }

    const data = (await response.json()) as {
        places?: Array<{
            id?: string;
            displayName?: { text?: string };
            photos?: GooglePlacePhotoCandidate[];
        }>;
    };
    const place = data.places?.[0];

    if (!place) return null;

    return {
        placeId: place.id || null,
        displayName: place.displayName?.text || null,
        photos: (place.photos || []).filter((photo) => Boolean(photo.name)),
    };
}

export function buildSpotPhotoUrls(photos: GooglePlacePhotoCandidate[]): string[] {
    return photos
        .slice(0, MAX_PHOTOS_PER_SPOT)
        .map((photo) => buildPlacePhotoProxyUrl(photo.name))
        .filter(Boolean);
}
