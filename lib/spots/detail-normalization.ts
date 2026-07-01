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

interface TrustedSpotGooglePlaceIdInput {
    photos: string[] | null | undefined;
    storedGooglePlaceId?: string | null;
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
    if (!input.usableCoordinates) return "Imported coordinate";
    if (isKoreanLocation(input.address)) return "Saved Kakao route pin";
    if (input.tone === "exact") return "Exact map coordinate";
    if (input.tone === "pinned") return "Stored map pin";
    return "Approximate imported pin";
}

export function getSpotDirectionsButtonLabel(
    tone: SpotLocationConfidence["tone"],
    isKorea: boolean
): string {
    if (tone === "exact") {
        return isKorea ? "Search exact spot in Kakao" : "Get exact directions";
    }

    if (tone === "pinned") {
        return isKorea ? "Search area in Kakao" : "Search name in Maps";
    }

    return isKorea ? "Search name in Kakao" : "Search area in Maps";
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
