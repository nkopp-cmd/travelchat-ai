import type { MultiLanguageField } from "@/types";

export interface SpotPhotoBackfillRow {
    id: string;
    name: MultiLanguageField;
    address: MultiLanguageField;
    photos: string[] | null;
    category?: string | null;
    google_place_id?: string | null;
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
    location: {
        latitude: number;
        longitude: number;
    } | null;
    types: string[];
    photos: GooglePlacePhotoCandidate[];
}

export interface FindGooglePlacePhotosOptions {
    timeoutMs?: number;
    maxResults?: number;
}

export interface BestGooglePlacePhotoResult {
    place: PlacePhotoSearchResult | null;
    quality: ReturnType<typeof getPlacePhotoMatchQuality> | null;
    query: string | null;
    rejectedPlace?: PlacePhotoSearchResult | null;
    rejectedQuality?: ReturnType<typeof getPlacePhotoMatchQuality> | null;
}

export type BestGooglePlaceMatchResult = BestGooglePlacePhotoResult;

export type SpotPhotoKind =
    | "proxy"
    | "remote_https"
    | "remote_untrusted"
    | "local_asset"
    | "direct_google"
    | "unsplash"
    | "placeholder"
    | "invalid"
    | "empty";

export interface SpotPhotoSummary {
    total: number;
    kinds: Record<SpotPhotoKind, number>;
    hasAnyPhoto: boolean;
    hasRealPhoto: boolean;
    hasGooglePlacePhoto: boolean;
    googlePlacePhotoIds: string[];
    needsBackfill: boolean;
    primaryKind: SpotPhotoKind | "none";
}

export interface SpotPhotoBackfillNeeds {
    needsPhotoBackfill: boolean;
    needsPlaceIdBackfill: boolean;
    needsPlacePhotoUpgrade: boolean;
    hasIdentityMismatch: boolean;
    shouldBackfill: boolean;
    placePhotoIdentity: ReturnType<typeof getSpotPlacePhotoIdentityStatus>;
}

const GOOGLE_PHOTO_PROXY_PATH = "/api/places/photo";
const GOOGLE_PHOTO_PROXY_VERSION = "2";
export const DEFAULT_SPOT_PHOTO_FALLBACK = "/images/placeholders/default.svg";
const MAX_PHOTOS_PER_SPOT = 3;
const DEFAULT_GOOGLE_PLACES_TIMEOUT_MS = 12_000;
const DEFAULT_GOOGLE_PLACES_SEARCH_RESULTS = 5;
const MAX_GOOGLE_PLACES_SEARCH_RESULTS = 10;
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
const BROAD_SPOT_QUALIFIER_WORDS = new Set(["district", "office", "residential"]);

function isTrustedRemoteSpotPhotoHost(host: string): boolean {
    return host === "localley.io" || host.endsWith(".localley.io");
}

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
    const params = new URLSearchParams({
        w: String(width),
        v: GOOGLE_PHOTO_PROXY_VERSION,
    });

    if (photoName.startsWith("places/")) {
        params.set("name", photoName);
    } else {
        params.set("ref", photoName);
    }

    return `${GOOGLE_PHOTO_PROXY_PATH}?${params.toString()}`;
}

export function addFallbackToPlacePhotoUrl(photo: string, fallbackPhoto: string | null | undefined): string {
    if (!fallbackPhoto || !photo.startsWith(GOOGLE_PHOTO_PROXY_PATH)) return photo;

    try {
        const url = new URL(photo, "https://www.localley.io");
        if (url.pathname !== GOOGLE_PHOTO_PROXY_PATH) return photo;
        if (!url.searchParams.has("fallback")) {
            url.searchParams.set("fallback", fallbackPhoto);
        }

        return `${url.pathname}?${url.searchParams.toString()}`;
    } catch {
        return photo;
    }
}

export function getProxiedGooglePhotoUrl(photo: string, width = 1200): string | null {
    try {
        const url = new URL(photo, "https://www.localley.io");
        const host = url.hostname.toLowerCase();

        if (url.pathname === GOOGLE_PHOTO_PROXY_PATH) {
            const photoName = url.searchParams.get("name");
            const photoRef = url.searchParams.get("ref");
            if (photoName) return buildPlacePhotoProxyUrl(photoName, width);
            if (photoRef) return buildPlacePhotoProxyUrl(photoRef, width);
            return photo;
        }

        if (host === "places.googleapis.com") {
            const match = url.pathname.match(/^\/v1\/(places\/[^/]+\/photos\/[^/]+)(?:\/media)?$/);
            return match ? buildPlacePhotoProxyUrl(match[1], width) : null;
        }

        if (host === "maps.googleapis.com" && url.pathname === "/maps/api/place/photo") {
            const photoRef = url.searchParams.get("photo_reference");
            return photoRef ? buildPlacePhotoProxyUrl(photoRef, width) : null;
        }

        return null;
    } catch {
        return null;
    }
}

export function normalizeStoredSpotPhotoUrls(
    photos: string[] | null | undefined,
    width = 1200
): string[] {
    return (photos || []).map((photo) => getProxiedGooglePhotoUrl(photo, width) || photo);
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

export function getGooglePlaceIdFromPhotoUrl(photo: string): string | null {
    if (!photo) return null;

    try {
        const url = new URL(photo, "https://www.localley.io");
        let photoName: string | null = null;

        if (url.pathname === GOOGLE_PHOTO_PROXY_PATH) {
            photoName = url.searchParams.get("name");
        } else if (url.hostname.toLowerCase() === "places.googleapis.com") {
            const match = url.pathname.match(/^\/v1\/(places\/[^/]+)\/photos\/[^/]+(?:\/media)?$/);
            photoName = match ? match[1] : null;
        }

        const match = photoName?.match(/^places\/([^/]+)(?:\/photos\/[^/]+)?$/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

export function getGooglePlaceIdFromSpotPhotos(photos: string[] | null | undefined): string | null {
    return getGooglePlaceIdsFromSpotPhotos(photos)[0] || null;
}

export function getGooglePlaceIdsFromSpotPhotos(photos: string[] | null | undefined): string[] {
    const placeIds = new Set<string>();

    for (const photo of photos || []) {
        const placeId = getGooglePlaceIdFromPhotoUrl(photo);
        if (placeId) placeIds.add(placeId);
    }

    return [...placeIds];
}

export function classifySpotPhoto(photo: string | null | undefined): SpotPhotoKind {
    const value = photo?.trim();
    if (!value) return "empty";

    const isRelativeAsset = value.startsWith("/") && !value.startsWith("//");
    const hasHttpProtocol = /^https?:\/\//i.test(value);
    if (!isRelativeAsset && !hasHttpProtocol) return "invalid";

    try {
        const url = new URL(value, "https://www.localley.io");
        const host = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();

        if (path.includes("placeholder")) return "placeholder";
        if (isBackfilledPlacePhotoUrl(value)) return "proxy";
        if (host.includes("unsplash.com")) return "unsplash";
        if (host === "places.googleapis.com" || host === "maps.googleapis.com") {
            return "direct_google";
        }
        if (isRelativeAsset) return "local_asset";
        if (url.protocol === "https:") {
            return isTrustedRemoteSpotPhotoHost(host)
                ? "remote_https"
                : "remote_untrusted";
        }

        return "invalid";
    } catch {
        return "invalid";
    }
}

export function isRealSpotPhotoKind(kind: SpotPhotoKind): boolean {
    return kind === "proxy" || kind === "remote_https" || kind === "local_asset";
}

export function summarizeSpotPhotos(photos: string[] | null | undefined): SpotPhotoSummary {
    const kinds: Record<SpotPhotoKind, number> = {
        proxy: 0,
        remote_https: 0,
        remote_untrusted: 0,
        local_asset: 0,
        direct_google: 0,
        unsplash: 0,
        placeholder: 0,
        invalid: 0,
        empty: 0,
    };

    for (const photo of photos || []) {
        kinds[classifySpotPhoto(photo)]++;
    }

    const primaryKind = photos?.length ? classifySpotPhoto(photos[0]) : "none";
    const hasRealPhoto = (Object.keys(kinds) as SpotPhotoKind[]).some(
        (kind) => isRealSpotPhotoKind(kind) && kinds[kind] > 0
    );
    const googlePlacePhotoIds = getGooglePlaceIdsFromSpotPhotos(photos);

    return {
        total: photos?.length || 0,
        kinds,
        hasAnyPhoto: Boolean(photos?.some((photo) => photo?.trim())),
        hasRealPhoto,
        hasGooglePlacePhoto: googlePlacePhotoIds.length > 0,
        googlePlacePhotoIds,
        needsBackfill: !hasRealPhoto,
        primaryKind,
    };
}

export function getSpotPlacePhotoIdentityStatus(
    photos: string[] | null | undefined,
    googlePlaceId?: string | null
): {
    photoPlaceIds: string[];
    storedPlaceId: string | null;
    hasGooglePlacePhoto: boolean;
    hasStoredPlaceId: boolean;
    hasOwnPlacePhoto: boolean;
    hasIdentityMismatch: boolean;
    ready: boolean;
} {
    const photoPlaceIds = getGooglePlaceIdsFromSpotPhotos(photos);
    const storedPlaceId = googlePlaceId?.trim() || null;
    const hasStoredPlaceId = Boolean(storedPlaceId);
    const hasGooglePlacePhoto = photoPlaceIds.length > 0;
    const hasOwnPlacePhoto = hasGooglePlacePhoto && (!storedPlaceId || photoPlaceIds.includes(storedPlaceId));
    const hasIdentityMismatch = Boolean(storedPlaceId && hasGooglePlacePhoto && !photoPlaceIds.includes(storedPlaceId));

    return {
        photoPlaceIds,
        storedPlaceId,
        hasGooglePlacePhoto,
        hasStoredPlaceId,
        hasOwnPlacePhoto,
        hasIdentityMismatch,
        ready: hasOwnPlacePhoto && hasStoredPlaceId && !hasIdentityMismatch,
    };
}

export function needsSpotPhotoBackfill(photos: string[] | null | undefined): boolean {
    return summarizeSpotPhotos(photos).needsBackfill;
}

export function hasStoredGooglePlaceIdentity(
    photos: string[] | null | undefined,
    googlePlaceId?: string | null
): boolean {
    return Boolean(googlePlaceId?.trim() || getGooglePlaceIdFromSpotPhotos(photos));
}

export function needsSpotPlaceIdentityBackfill(
    photos: string[] | null | undefined,
    googlePlaceId?: string | null
): boolean {
    return !hasStoredGooglePlaceIdentity(photos, googlePlaceId);
}

export function needsSpotPhotoOrPlaceBackfill(
    photos: string[] | null | undefined,
    googlePlaceId?: string | null
): boolean {
    return (
        needsSpotPhotoBackfill(photos) ||
        needsSpotPlaceIdentityBackfill(photos, googlePlaceId)
    );
}

export function getSpotPhotoBackfillNeeds(
    photos: string[] | null | undefined,
    googlePlaceId?: string | null,
    options: { upgradeToPlacePhotos?: boolean } = {}
): SpotPhotoBackfillNeeds {
    const placePhotoIdentity = getSpotPlacePhotoIdentityStatus(photos, googlePlaceId);
    const needsPhotoBackfill = needsSpotPhotoBackfill(photos);
    const needsPlaceIdBackfill = !placePhotoIdentity.hasStoredPlaceId;
    const needsPlacePhotoUpgrade = !placePhotoIdentity.ready;
    const hasIdentityMismatch = placePhotoIdentity.hasIdentityMismatch;

    return {
        needsPhotoBackfill,
        needsPlaceIdBackfill,
        needsPlacePhotoUpgrade,
        hasIdentityMismatch,
        shouldBackfill:
            needsPhotoBackfill ||
            needsPlaceIdBackfill ||
            hasIdentityMismatch ||
            Boolean(options.upgradeToPlacePhotos && needsPlacePhotoUpgrade),
        placePhotoIdentity,
    };
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

function rawComparableWords(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter((word) => word.length >= 3)
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

function hasMissingBroadSpotQualifier(spotName: string, placeName: string | null): boolean {
    const spotWords = rawComparableWords(spotName);
    const placeWords = rawComparableWords(placeName || "");

    return [...BROAD_SPOT_QUALIFIER_WORDS].some(
        (word) => spotWords.has(word) && !placeWords.has(word)
    );
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

    if (hasMissingBroadSpotQualifier(spotName, place.displayName || "")) {
        return {
            acceptable: false,
            reason: "missing_broad_spot_qualifier",
            nameScore,
            addressScore,
        };
    }

    if (!weakSingleWordNameMatch && hasNonLatinPlaceName && addressScore >= 0.55) {
        return { acceptable: true, reason: "accepted", nameScore, addressScore };
    }

    if (
        !weakSingleWordNameMatch &&
        hasNonLatinPlaceName &&
        addressScore >= 0.33 &&
        placeTypes.has("tourist_attraction")
    ) {
        return { acceptable: true, reason: "accepted_non_latin_address_anchor", nameScore, addressScore };
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
            (nameScore >= 0.5 && addressScore >= 0.33)
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
    const places = await findGooglePlacePhotoCandidatesByQuery(textQuery, apiKey, options);
    return places[0] || null;
}

async function findGooglePlacePhotoCandidatesByQuery(
    textQuery: string,
    apiKey: string,
    options: FindGooglePlacePhotosOptions = {}
): Promise<PlacePhotoSearchResult[]> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_GOOGLE_PLACES_TIMEOUT_MS;
    const maxResultCount = Math.min(
        MAX_GOOGLE_PLACES_SEARCH_RESULTS,
        Math.max(1, options.maxResults ?? DEFAULT_GOOGLE_PLACES_SEARCH_RESULTS)
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.types",
            },
            body: JSON.stringify({
                textQuery,
                maxResultCount,
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
            location?: {
                latitude?: number;
                longitude?: number;
            };
            photos?: GooglePlacePhotoCandidate[];
            types?: string[];
        }>;
    };
    return (data.places || []).map((place) => ({
        placeId: place.id || null,
        displayName: place.displayName?.text || null,
        formattedAddress: place.formattedAddress || null,
        location:
            typeof place.location?.latitude === "number" &&
            typeof place.location?.longitude === "number"
                ? {
                    latitude: place.location.latitude,
                    longitude: place.location.longitude,
                }
                : null,
        types: place.types || [],
        photos: (place.photos || []).filter((photo) => Boolean(photo.name)),
    }));
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
        const places = await findGooglePlacePhotoCandidatesByQuery(query, apiKey, options);
        if (places.length === 0) continue;

        for (const place of places) {
            if (place.photos.length === 0) continue;

            const quality = getPlacePhotoMatchQuality(name, address, category, place);
            if (quality.acceptable) {
                return { place, quality, query };
            }

            rejectedPlace = place;
            rejectedQuality = quality;
        }
    }

    return {
        place: null,
        quality: null,
        query: null,
        rejectedPlace,
        rejectedQuality,
    };
}

export async function findBestGooglePlaceMatch(
    name: string,
    address: string,
    category: string | null | undefined,
    apiKey: string,
    options: FindGooglePlacePhotosOptions = {}
): Promise<BestGooglePlaceMatchResult> {
    let rejectedPlace: PlacePhotoSearchResult | null = null;
    let rejectedQuality: ReturnType<typeof getPlacePhotoMatchQuality> | null = null;

    for (const query of buildPlacePhotoSearchQueries(name, address)) {
        const places = await findGooglePlacePhotoCandidatesByQuery(query, apiKey, options);
        if (places.length === 0) continue;

        for (const place of places) {
            const quality = getPlacePhotoMatchQuality(name, address, category, place);
            if (quality.acceptable) {
                return { place, quality, query };
            }

            rejectedPlace = place;
            rejectedQuality = quality;
        }
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
