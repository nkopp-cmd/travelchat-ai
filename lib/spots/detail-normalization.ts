import { LocalleyScale } from "@/types";
import type { SpotLocationConfidence } from "@/lib/spots/location-confidence";
import { isKoreanLocation } from "@/lib/spots/map-links";
import {
    getGooglePlaceIdFromSpotPhotos,
    getSpotPlacePhotoIdentityStatus,
} from "@/lib/place-images";

interface SpotPhotoEvidenceInput {
    hasRealPhoto: boolean;
    realPhotoCount: number;
    googlePlaceId?: string | null;
}

interface SpotCoordinateEvidenceInput {
    address: string;
    tone: SpotLocationConfidence["tone"];
    usableCoordinates: boolean;
}

interface SpotNavigationModeInput {
    tone: SpotLocationConfidence["tone"];
    isKorea: boolean;
    hasMatchedGooglePlace: boolean;
    usableCoordinates: boolean;
}

interface SpotNavigationTargetInput {
    status: SpotNavigationMode["status"];
    fallbackQuery: string;
    lat?: number | null;
    lng?: number | null;
}

interface TrustedSpotGooglePlaceIdInput {
    photos: string[] | null | undefined;
    storedGooglePlaceId?: string | null;
}

export interface SpotVisitPlanInput {
    category: string;
    city: string;
    primaryArea: string;
    localleyScore: LocalleyScale;
    localPercentage: number;
    bestTime: string;
    locationTone: SpotLocationConfidence["tone"];
    hasRealPhoto: boolean;
    realPhotoCount: number;
}

export interface SpotVisitPlan {
    localReason: string;
    bestUse: string;
    routePairing: string;
    evidence: string;
}

export interface SpotNavigationMode {
    status: "exact_place_id" | "exact_coordinate_directions" | "exact_address_search" | "search_first_pin" | "search_first_area";
    label: string;
    targetLabel: string;
    helper: string;
}

export interface SpotRecordConfidenceInput {
    hasRealPhoto: boolean;
    realPhotoCount: number;
    locationTone: SpotLocationConfidence["tone"];
    hasTrustedGooglePlaceId: boolean;
    verified: boolean;
}

export interface SpotRecordConfidenceCheck {
    label: string;
    value: string;
    ready: boolean;
}

export interface SpotRecordConfidence {
    label: string;
    helper: string;
    actionLabel: string;
    actionHelper: string;
    tone: "emerald" | "sky" | "amber";
    checks: SpotRecordConfidenceCheck[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function getLocalizedTextValue(value: unknown): string {
    if (typeof value === "string") return value.trim();

    if (isRecord(value)) {
        const englishValue = normalizeText(value.en);
        if (englishValue) return englishValue;

        for (const candidate of Object.values(value)) {
            const text = normalizeText(candidate);
            if (text) return text;
        }
    }

    return "";
}

export function getSpotBestTime(bestTimes: unknown, bestTime?: unknown): string {
    return getLocalizedTextValue(bestTimes) || getLocalizedTextValue(bestTime) || "Anytime";
}

export function normalizeSpotTips(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(normalizeText).filter(Boolean);
    }

    if (typeof value === "string") {
        return value.trim() ? [value.trim()] : [];
    }

    if (!isRecord(value)) return [];

    const preferredValue = value.en ?? Object.values(value).find((candidate) => {
        if (Array.isArray(candidate)) return candidate.some((tip) => normalizeText(tip));
        return Boolean(normalizeText(candidate));
    });

    if (Array.isArray(preferredValue)) {
        return preferredValue.map(normalizeText).filter(Boolean);
    }

    const preferredText = normalizeText(preferredValue);
    return preferredText ? [preferredText] : [];
}

export function normalizeLocalleyScore(value: unknown): LocalleyScale {
    if (value === null || value === undefined || value === "") return LocalleyScale.MIXED_CROWD;

    const score = Number(value);
    if (!Number.isFinite(score)) return LocalleyScale.MIXED_CROWD;

    return Math.min(
        LocalleyScale.LEGENDARY_ALLEY,
        Math.max(LocalleyScale.TOURIST_TRAP, Math.round(score))
    ) as LocalleyScale;
}

export function normalizeLocalPercentage(value: unknown): number {
    if (value === null || value === undefined || value === "") return 50;

    const percentage = Number(value);
    if (!Number.isFinite(percentage)) return 50;

    return Math.min(100, Math.max(0, Math.round(percentage)));
}

export function getSpotPhotoEvidenceLabel(input: SpotPhotoEvidenceInput): string {
    if (!input.hasRealPhoto || input.realPhotoCount <= 0) return "Image fallback";

    const sourceLabel = input.googlePlaceId ? "place photo" : "real photo";
    return input.realPhotoCount === 1
        ? `1 ${sourceLabel} source`
        : `${input.realPhotoCount} ${sourceLabel} sources`;
}

export function getSpotPhotoEvidenceHelper(input: SpotPhotoEvidenceInput): string {
    if (input.hasRealPhoto && input.googlePlaceId) {
        return "Uses place-matched imagery for this spot rather than a category placeholder.";
    }

    if (input.hasRealPhoto) {
        return "Uses stored real imagery rather than a category placeholder.";
    }

    return "Showing a city fallback until a verified spot photo is backfilled.";
}

export function getSpotCoordinateEvidenceLabel(
    input: SpotCoordinateEvidenceInput
): string {
    if (!input.usableCoordinates) return "No verified coordinate";
    if (isKoreanLocation(input.address)) return "Saved Kakao route pin";
    if (input.tone === "exact") return "Exact map coordinate";
    if (input.tone === "pinned") return "Stored map pin";
    return "Approximate imported pin";
}

export function getSpotNavigationMode(input: SpotNavigationModeInput): SpotNavigationMode {
    if (!input.isKorea && input.hasMatchedGooglePlace) {
        return {
            status: "exact_place_id",
            label: "Exact Place ID",
            targetLabel: "Map target",
            helper: "Directions use a matched Google Place ID, so Maps can route to the specific destination instead of a broad imported pin.",
        };
    }

    if (input.tone === "exact") {
        if (!input.isKorea && input.usableCoordinates) {
            return {
                status: "exact_coordinate_directions",
                label: "Exact coordinate",
                targetLabel: "Route target",
                helper: "Directions use the saved exact coordinate, with the spot name and address shown as context on the page.",
            };
        }

        return {
            status: "exact_address_search",
            label: input.isKorea ? "Exact Kakao search" : "Exact Maps search",
            targetLabel: "Map target",
            helper: input.isKorea
                ? "Kakao searches the exact spot name and address so the selected place stays tied to the real record."
                : "Maps searches the exact spot name and address first so the selected place stays tied to the real record.",
        };
    }

    if (input.usableCoordinates) {
        return {
            status: "search_first_pin",
            label: input.isKorea ? "Pinned Kakao search" : "Pinned Maps search",
            targetLabel: "Search target",
            helper: "This record has a saved coordinate, but the address is still area-level. Search opens first so the user can confirm the exact local result before routing.",
        };
    }

    return {
        status: "search_first_area",
        label: input.isKorea ? "Area Kakao search" : "Area Maps search",
        targetLabel: "Search target",
        helper: "This record still needs exact address and coordinate enrichment. Search opens first so the user can choose the correct place before routing.",
    };
}

export function getSpotNavigationTargetValue(input: SpotNavigationTargetInput): string {
    if (
        input.status === "exact_coordinate_directions" &&
        typeof input.lat === "number" &&
        typeof input.lng === "number" &&
        Number.isFinite(input.lat) &&
        Number.isFinite(input.lng)
    ) {
        return `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`;
    }

    return input.fallbackQuery;
}

export function getSpotDirectionsButtonLabel(
    tone: SpotLocationConfidence["tone"],
    isKorea: boolean,
    hasMatchedGooglePlace = false
): string {
    if (!isKorea && hasMatchedGooglePlace) return "Get exact directions";

    if (tone === "exact") {
        if (isKorea) return "Search exact spot in Kakao";
        return "Get exact directions";
    }

    if (tone === "pinned") {
        return isKorea ? "Search area in Kakao" : "Search name in Maps";
    }

    return isKorea ? "Search name in Kakao" : "Search area in Maps";
}

export function getSpotRecordConfidence(input: SpotRecordConfidenceInput): SpotRecordConfidence {
    const imageReady = input.hasRealPhoto && input.realPhotoCount > 0;
    const routeReady = input.hasTrustedGooglePlaceId || input.locationTone === "exact";
    const imageValue = imageReady
        ? `${input.realPhotoCount} real photo${input.realPhotoCount === 1 ? "" : "s"}`
        : "Needs photo";
    const routeValue = input.hasTrustedGooglePlaceId
        ? "Place matched"
        : input.locationTone === "exact"
            ? "Exact address"
            : input.locationTone === "pinned"
                ? "Pinned area"
                : "Area search";

    const checks: SpotRecordConfidenceCheck[] = [
        {
            label: "Image",
            value: imageValue,
            ready: imageReady,
        },
        {
            label: "Map target",
            value: routeValue,
            ready: routeReady,
        },
        {
            label: "Curation",
            value: input.verified ? "Verified" : "Curated",
            ready: true,
        },
    ];

    if (imageReady && routeReady) {
        return {
            label: input.verified ? "Verified route-ready record" : "Route-ready record",
            helper: "This spot has real image evidence and a specific map target for trip planning.",
            actionLabel: "Plan with confidence",
            actionHelper: "Use this as a route anchor and open directions directly when you are ready to go.",
            tone: "emerald",
            checks,
        };
    }

    if (routeReady) {
        return {
            label: "Route-ready, image pending",
            helper: "The map target is specific, but the visual record still needs a reviewed real spot image.",
            actionLabel: "Use route, review photo",
            actionHelper: "Directions are specific enough for planning; treat the image as temporary until photo review finishes.",
            tone: "sky",
            checks,
        };
    }

    if (imageReady) {
        return {
            label: "Image-ready, route needs review",
            helper: "The spot has real imagery, but directions should stay search-first until the address is exact.",
            actionLabel: "Search before routing",
            actionHelper: "Use the saved name and address to confirm the map result before starting directions.",
            tone: "amber",
            checks,
        };
    }

    return {
        label: "Needs photo and route review",
        helper: "This record should stay search-first until a real image and exact location evidence are added.",
        actionLabel: "Keep as research lead",
        actionHelper: "Treat this as a candidate until the exact address and real spot imagery are backfilled.",
        tone: "amber",
        checks,
    };
}

export function getTrustedSpotGooglePlaceId(
    input: TrustedSpotGooglePlaceIdInput
): string | null {
    const storedGooglePlaceId = input.storedGooglePlaceId?.trim() || null;
    const identity = getSpotPlacePhotoIdentityStatus(
        input.photos,
        storedGooglePlaceId,
    );

    if (identity.hasIdentityMismatch) return null;

    return storedGooglePlaceId || getGooglePlaceIdFromSpotPhotos(input.photos);
}

function getCategoryVisitUse(category: string): string {
    const normalized = category.toLowerCase();

    if (normalized.includes("cafe")) {
        return "Use it as a slow first stop or reset between denser walking pockets.";
    }

    if (
        normalized.includes("food") ||
        normalized.includes("restaurant") ||
        normalized.includes("market")
    ) {
        return "Anchor a meal here, then keep the route light before and after it.";
    }

    if (normalized.includes("night") || normalized.includes("bar")) {
        return "Save it for the evening when the local crowd signal matters most.";
    }

    if (normalized.includes("shopping") || normalized.includes("store")) {
        return "Treat it as a browse-and-wander stop instead of a rushed errand.";
    }

    if (
        normalized.includes("outdoor") ||
        normalized.includes("park") ||
        normalized.includes("beach")
    ) {
        return "Give it breathing room in the route so the stop does not feel squeezed.";
    }

    return "Use it as a flexible local anchor around nearby food, coffee, or evening stops.";
}

function getRoutePairing(category: string, primaryArea: string, city: string): string {
    const normalized = category.toLowerCase();
    const area = primaryArea || city;

    if (normalized.includes("cafe")) {
        return `Pair it with a walk through ${area} and one nearby meal stop.`;
    }

    if (
        normalized.includes("food") ||
        normalized.includes("restaurant") ||
        normalized.includes("market")
    ) {
        return `Build a compact food route around ${area}, then add one quiet recovery stop.`;
    }

    if (normalized.includes("night") || normalized.includes("bar")) {
        return `Start nearby before sunset, then let ${area} carry the evening route.`;
    }

    if (normalized.includes("shopping") || normalized.includes("store")) {
        return `Use ${area} as a browsing pocket and keep the next stop walkable.`;
    }

    if (
        normalized.includes("outdoor") ||
        normalized.includes("park") ||
        normalized.includes("beach")
    ) {
        return `Keep the route around ${area} simple and weather-aware.`;
    }

    return `Build nearby time around ${area} before jumping across ${city}.`;
}

function getLocalReason(input: SpotVisitPlanInput): string {
    if (input.localleyScore >= LocalleyScale.LEGENDARY_ALLEY) {
        return `${input.localPercentage}% local signal makes this one of the strongest Localley stops in ${input.primaryArea}.`;
    }

    if (input.localleyScore >= LocalleyScale.HIDDEN_GEM) {
        return `${input.localPercentage}% local signal means it is worth planning around, not just saving as a maybe.`;
    }

    if (input.localleyScore >= LocalleyScale.LOCAL_FAVORITE) {
        return `${input.localPercentage}% local signal makes it a useful neighborhood anchor.`;
    }

    return `${input.localPercentage}% local signal gives it enough context for a nearby route.`;
}

function getEvidenceSummary(input: SpotVisitPlanInput): string {
    const photoLabel = input.hasRealPhoto
        ? `${input.realPhotoCount} real photo${input.realPhotoCount === 1 ? "" : "s"}`
        : "area fallback imagery";

    const locationLabel =
        input.locationTone === "exact"
            ? "exact address"
            : input.locationTone === "pinned"
                ? "pinned area"
                : "area-level address";

    return `${photoLabel} plus ${locationLabel} context.`;
}

export function getSpotVisitPlan(input: SpotVisitPlanInput): SpotVisitPlan {
    return {
        localReason: getLocalReason(input),
        bestUse: `${getCategoryVisitUse(input.category)} Best window: ${input.bestTime}.`,
        routePairing: getRoutePairing(input.category, input.primaryArea, input.city),
        evidence: getEvidenceSummary(input),
    };
}
