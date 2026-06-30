import type { MultiLanguageField } from "@/types";

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
    formattedAddress: string | null;
    types: string[];
    photos: GooglePlacePhotoCandidate[];
}

export interface FindGooglePlacePhotosOptions {
    timeoutMs?: number;
}

export interface BestGooglePlacePhotoResult {
    place: PlacePhotoSearchResult | null;
    quality: ReturnType<typeof getPlacePhotoMatchQuality> | null;
    query: string | null;
    rejectedPlace?: PlacePhotoSearchResult | null;
    rejectedQuality?: ReturnType<typeof getPlacePhotoMatchQuality> | null;
}

const GOOGLE_PHOTO_PROXY_PATH = "/api/places/photo";
const MAX_PHOTOS_PER_SPOT = 3;
const DEFAULT_GOOGLE_PLACES_TIMEOUT_MS = 12_000;
const GENERIC_SPOT_WORDS = new Set([
    "alley",
    "center",
    "centre",
    "district",
    "dong",
    "dori",
    "food",
    "hotel",
    "local",
    "lunch",
    "market",
    "night",
    "office",
    "park",
    "restaurant",
    "road",
    "residential",
    "scene",
    "shopping",
    "soi",
    "street",
    "town",
    "trail",
    "village",
]);
const TRANSIT_TYPES = new Set([
    "airport",
    "bus_station",
    "subway_station",
    "train_station",
    "transit_station",
]);
const LODGING_TYPES = new Set(["lodging"]);
const BUSINESS_PLACE_TYPES = new Set([
    "furniture_store",
    "home_goods_store",
    "store",
]);
const COMMERCIAL_NAME_WORDS = new Set([
    "apartment",
    "apartments",
    "office",
    "shop",
    "store",
]);

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

function comparableWords(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter((word) => word.length >= 3 && !GENERIC_SPOT_WORDS.has(word))
    );
}

function wordOverlap(source: string, target: string): number {
    const sourceWords = comparableWords(source);
    if (sourceWords.size === 0) return 0;

    const targetWords = comparableWords(target);
    let matches = 0;

    sourceWords.forEach((word) => {
        if (targetWords.has(word)) matches++;
    });

    return matches / sourceWords.size;
}

function extraComparableWords(source: string, target: string): string[] {
    const sourceWords = comparableWords(source);
    return [...comparableWords(target)].filter((word) => !sourceWords.has(word));
}

function hasLocationAnchorMatch(spotName: string, spotAddress: string, placeAddress: string): boolean {
    const nameWords = comparableWords(spotName);
    const addressWords = [...comparableWords(spotAddress)].filter((word) => !nameWords.has(word));

    if (addressWords.length === 0) return true;

    const placeAddressWords = comparableWords(placeAddress);
    return addressWords.some((word) => placeAddressWords.has(word));
}

function hasWeakSingleWordNameMatch(source: string, target: string, addressScore: number): boolean {
    const sourceWords = comparableWords(source);
    if (sourceWords.size !== 1 || addressScore >= 0.75) return false;

    const targetWords = comparableWords(target);
    const extraTargetWords = [...targetWords].filter((word) => !sourceWords.has(word));

    return extraTargetWords.length > 0;
}

function hasSpecificBusinessMismatch(
    spotName: string,
    category: string | null | undefined,
    place: Pick<PlacePhotoSearchResult, "displayName" | "types">
): boolean {
    const placeTypes = new Set(place.types || []);
    const hasBusinessType = [...BUSINESS_PLACE_TYPES].some((type) => placeTypes.has(type));
    const placeExtraWords = extraComparableWords(spotName, place.displayName || "");
    const hasCommercialExtraWord = placeExtraWords.some((word) => COMMERCIAL_NAME_WORDS.has(word));

    if (!hasBusinessType && !hasCommercialExtraWord) return false;

    return category !== "Shopping";
}

function hasTransitNameMismatch(
    category: string | null | undefined,
    place: Pick<PlacePhotoSearchResult, "displayName" | "formattedAddress">
): boolean {
    if (category === "Transportation") return false;
    return /\b(airport|station|terminal)\b/i.test(
        [place.displayName, place.formattedAddress].filter(Boolean).join(" ")
    );
}

export function getPlacePhotoMatchQuality(
    spotName: string,
    spotAddress: string,
    category: string | null | undefined,
    place: Pick<PlacePhotoSearchResult, "displayName" | "formattedAddress" | "types">
): { acceptable: boolean; reason: string; nameScore: number; addressScore: number } {
    const placeTypes = new Set(place.types || []);
    const hasTransitType = [...TRANSIT_TYPES].some((type) => placeTypes.has(type));
    const allowsTransit = category === "Transportation";
    const hasLodgingType = [...LODGING_TYPES].some((type) => placeTypes.has(type));

    if (hasTransitType && !allowsTransit) {
        return {
            acceptable: false,
            reason: "transit_place_for_non_transit_spot",
            nameScore: 0,
            addressScore: 0,
        };
    }

    if (hasLodgingType) {
        return {
            acceptable: false,
            reason: "lodging_place_for_local_spot",
            nameScore: 0,
            addressScore: 0,
        };
    }

    if (hasTransitNameMismatch(category, place)) {
        return {
            acceptable: false,
            reason: "transit_named_place_for_non_transit_spot",
            nameScore: 0,
            addressScore: 0,
        };
    }

    if (hasSpecificBusinessMismatch(spotName, category, place)) {
        return {
            acceptable: false,
            reason: "specific_business_for_broader_spot",
            nameScore: 0,
            addressScore: 0,
        };
    }

    const nameScore = wordOverlap(spotName, place.displayName || "");
    const addressScore = wordOverlap(spotAddress, place.formattedAddress || "");
    const placeNameWordCount = comparableWords(place.displayName || "").size;
    const hasNonLatinPlaceName = Boolean(place.displayName?.trim()) && placeNameWordCount === 0;
    const weakSingleWordNameMatch = hasWeakSingleWordNameMatch(
        spotName,
        place.displayName || "",
        addressScore
    );
    const locationAnchorMatches = hasLocationAnchorMatch(
        spotName,
        spotAddress,
        place.formattedAddress || ""
    );

    if (!locationAnchorMatches) {
        return {
            acceptable: false,
            reason: "missing_location_anchor_match",
            nameScore,
            addressScore,
        };
    }

    if (nameScore < 0.67 && addressScore < 0.75) {
        return {
            acceptable: false,
            reason: "partial_name_without_strong_address_match",
            nameScore,
            addressScore,
        };
    }

    if (
        !weakSingleWordNameMatch &&
        (
            (nameScore >= 0.67 && addressScore >= 0.2) ||
            (nameScore >= 0.5 && addressScore >= 0.33) ||
            (hasNonLatinPlaceName && addressScore >= 0.55)
        )
    ) {
        return { acceptable: true, reason: "accepted", nameScore, addressScore };
    }

    return {
        acceptable: false,
        reason: "low_name_and_address_match",
        nameScore,
        addressScore,
    };
}

export async function findGooglePlacePhotos(
    name: string,
    address: string,
    apiKey: string,
    options: FindGooglePlacePhotosOptions = {}
): Promise<PlacePhotoSearchResult | null> {
    const textQuery = [name, address].filter(Boolean).join(", ");
    if (!textQuery) return null;

    return findGooglePlacePhotosByQuery(textQuery, apiKey, options);
}

function getAddressParts(address: string): string[] {
    return address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

export function buildPlacePhotoSearchQueries(name: string, address: string): string[] {
    const parts = getAddressParts(address);
    const cityCountry = parts.slice(-2).join(", ");
    const city = parts.length > 1 ? parts[parts.length - 2] : "";

    return [
        [name, address].filter(Boolean).join(", "),
        [name, cityCountry].filter(Boolean).join(", "),
        [name, city].filter(Boolean).join(", "),
        name,
    ]
        .map((query) => query.trim())
        .filter((query, index, queries) => query && queries.indexOf(query) === index);
}

async function findGooglePlacePhotosByQuery(
    textQuery: string,
    apiKey: string,
    options: FindGooglePlacePhotosOptions = {}
): Promise<PlacePhotoSearchResult | null> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_GOOGLE_PLACES_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.photos,places.types",
            },
            body: JSON.stringify({
                textQuery,
                maxResultCount: 1,
            }),
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`Google Places search timed out after ${timeoutMs}ms`);
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Google Places search failed with ${response.status}`);
    }

    const data = (await response.json()) as {
        places?: Array<{
            id?: string;
            displayName?: { text?: string };
            formattedAddress?: string;
            photos?: GooglePlacePhotoCandidate[];
            types?: string[];
        }>;
    };
    const place = data.places?.[0];

    if (!place) return null;

    return {
        placeId: place.id || null,
        displayName: place.displayName?.text || null,
        formattedAddress: place.formattedAddress || null,
        types: place.types || [],
        photos: (place.photos || []).filter((photo) => Boolean(photo.name)),
    };
}

export async function findBestGooglePlacePhotos(
    name: string,
    address: string,
    category: string | null | undefined,
    apiKey: string,
    options: FindGooglePlacePhotosOptions = {}
): Promise<BestGooglePlacePhotoResult> {
    let rejectedPlace: PlacePhotoSearchResult | null = null;
    let rejectedQuality: ReturnType<typeof getPlacePhotoMatchQuality> | null = null;

    for (const query of buildPlacePhotoSearchQueries(name, address)) {
        const place = await findGooglePlacePhotosByQuery(query, apiKey, options);
        if (!place || place.photos.length === 0) continue;

        const quality = getPlacePhotoMatchQuality(name, address, category, place);
        if (quality.acceptable) {
            return { place, quality, query };
        }

        rejectedPlace = place;
        rejectedQuality = quality;
    }

    return {
        place: null,
        quality: null,
        query: null,
        rejectedPlace,
        rejectedQuality,
    };
}

export function buildSpotPhotoUrls(photos: GooglePlacePhotoCandidate[]): string[] {
    return photos
        .slice(0, MAX_PHOTOS_PER_SPOT)
        .map((photo) => buildPlacePhotoProxyUrl(photo.name))
        .filter(Boolean);
}
