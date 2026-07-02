import type { SupabaseClient } from "@supabase/supabase-js";
import type { MultiLanguageField } from "@/types";
import {
    getLocalizedFieldValue,
    getSpotPlacePhotoIdentityStatus,
    needsSpotPlaceIdentityBackfill,
    normalizeStoredSpotPhotoUrls,
    summarizeSpotPhotos,
} from "@/lib/place-images";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import {
    getPublicSpotQualityIssue,
    shouldShowPublicSpot,
} from "@/lib/spots/public-quality";
import { getSpotLocationConfidence, hasUsableCoordinates } from "@/lib/spots/location-confidence";
import {
    buildSpotQualitySchemaStatus,
    type SpotQualitySchemaStatus,
} from "@/lib/admin/spot-quality-action-plan";

export type SpotQualityIssue =
    | "missing_real_photo"
    | "inexact_location"
    | "missing_place_id"
    | "mismatched_place_photo_identity"
    | "broad_place_name"
    | "missing_name";

export interface SpotQualityRow {
    id: string;
    name: MultiLanguageField;
    address: MultiLanguageField;
    description?: MultiLanguageField;
    photos: string[] | null;
    category: string | null;
    location: unknown;
    google_place_id?: string | null;
    created_at?: string | null;
}

export interface SpotQualityItem {
    id: string;
    name: string;
    address: string;
    description: string;
    category: string | null;
    photos: string[];
    photoSummary: ReturnType<typeof summarizeSpotPhotos>;
    placePhotoIdentity: ReturnType<typeof getSpotPlacePhotoIdentityStatus>;
    photoReadiness: SpotPhotoReadiness;
    lat: number | null;
    lng: number | null;
    googlePlaceId: string | null;
    locationConfidence: ReturnType<typeof getSpotLocationConfidence>;
    publicQualityIssue: ReturnType<typeof getPublicSpotQualityIssue>;
    issues: SpotQualityIssue[];
    publicReady: boolean;
    createdAt: string | null;
}

export interface SpotPhotoReadiness {
    status: "ready" | "place_ready" | "manual_review" | "backfill_ready";
    label: string;
    description: string;
    tone: "good" | "warn" | "danger";
    realPhotoCount: number;
    canAutoBackfill: boolean;
}

export interface SpotQualityQueueSummary {
    total: number;
    publicReady: number;
    needsWork: number;
    missingRealPhoto: number;
    inexactLocation: number;
    missingPlaceId: number;
    mismatchedPlacePhotoIdentity: number;
    broadPlaceName: number;
    missingName: number;
}

export interface SpotQualityQueue {
    generatedAt: string;
    hasGooglePlaceIdColumn: boolean;
    schema: SpotQualitySchemaStatus;
    city: string | null;
    issue: SpotQualityIssue | "all";
    limit: number;
    filteredSummary: SpotQualityQueueSummary;
    visibleSummary: SpotQualityQueueSummary;
    summary: SpotQualityQueueSummary;
    items: SpotQualityItem[];
}

export interface SpotQualityPatchInput {
    address?: string;
    lat?: number;
    lng?: number;
    photos?: string[];
    googlePlaceId?: string | null;
}

export interface SpotQualityPatchPayload {
    address?: Record<string, string>;
    location?: string;
    photos?: string[];
    google_place_id?: string | null;
}

const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getQueueLimit(value: string | null | undefined): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function getText(field: MultiLanguageField): string {
    return getLocalizedFieldValue(field).trim();
}

function normalizeAddressField(current: MultiLanguageField, nextAddress: string): Record<string, string> {
    if (current && typeof current === "object") {
        return {
            ...current,
            en: nextAddress,
        };
    }

    return { en: nextAddress };
}

function normalizePhotos(photos: string[] | undefined): string[] | undefined {
    if (!photos) return undefined;

    const cleaned = photos
        .map((photo) => photo.trim())
        .filter(Boolean);

    if (cleaned.length === 0) {
        throw new Error("At least one photo URL is required when updating photos.");
    }

    if (cleaned.length > 6) {
        throw new Error("Use 6 or fewer spot photos.");
    }

    const normalized = normalizeStoredSpotPhotoUrls(cleaned);

    const invalid = normalized.find((photo) => {
        if (photo.startsWith("/api/places/photo?")) return false;
        if (photo.startsWith("/images/") && !photo.toLowerCase().includes("placeholder")) return false;
        try {
            const url = new URL(photo);
            return url.protocol !== "https:";
        } catch {
            return true;
        }
    });

    if (invalid) {
        throw new Error(`Invalid photo URL: ${invalid}`);
    }

    return Array.from(new Set(normalized));
}

function formatPoint(lng: number, lat: number): string {
    return `POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
}

export function buildSpotQualityPatchPayload(
    current: Pick<SpotQualityRow, "address">,
    input: SpotQualityPatchInput,
    hasGooglePlaceIdColumn: boolean
): SpotQualityPatchPayload {
    const payload: SpotQualityPatchPayload = {};
    const address = input.address?.trim();

    if (address) {
        payload.address = normalizeAddressField(current.address, address);
    }

    const hasLat = typeof input.lat === "number";
    const hasLng = typeof input.lng === "number";
    if (hasLat || hasLng) {
        if (!hasLat || !hasLng || !hasUsableCoordinates(input.lat, input.lng)) {
            throw new Error("Provide both valid latitude and longitude values.");
        }

        payload.location = formatPoint(input.lng!, input.lat!);
    }

    const photos = normalizePhotos(input.photos);
    if (photos) {
        payload.photos = photos;
    }

    if ("googlePlaceId" in input) {
        if (!hasGooglePlaceIdColumn) {
            throw new Error("The spots.google_place_id migration must be applied before saving place IDs.");
        }

        const placeId = input.googlePlaceId?.trim() || null;
        payload.google_place_id = placeId;
    }

    if (Object.keys(payload).length === 0) {
        throw new Error("No spot quality updates were provided.");
    }

    return payload;
}

export function getSpotPhotoReadiness(
    photoSummary: ReturnType<typeof summarizeSpotPhotos>,
    googlePlaceId: string | null,
    hasGooglePlaceIdColumn: boolean
): SpotPhotoReadiness {
    const realPhotoCount =
        photoSummary.kinds.proxy +
        photoSummary.kinds.remote_https +
        photoSummary.kinds.local_asset;
    const hasPlacePhotoIdentityMismatch = Boolean(
        googlePlaceId &&
        photoSummary.googlePlacePhotoIds.length > 0 &&
        !photoSummary.googlePlacePhotoIds.includes(googlePlaceId)
    );

    if (hasPlacePhotoIdentityMismatch) {
        return {
            status: "manual_review",
            label: "Place photo mismatch",
            description: "The stored Google Place ID does not match the proxied place photo source. Reconcile this before trusting directions.",
            tone: "danger",
            realPhotoCount,
            canAutoBackfill: true,
        };
    }

    if (photoSummary.kinds.proxy > 0 && (!hasGooglePlaceIdColumn || googlePlaceId)) {
        return {
            status: "ready",
            label: "Real place image ready",
            description: "This spot has proxied place photos and durable place identity.",
            tone: "good",
            realPhotoCount,
            canAutoBackfill: false,
        };
    }

    if (photoSummary.hasRealPhoto) {
        return {
            status: hasGooglePlaceIdColumn && !googlePlaceId ? "place_ready" : "ready",
            label: hasGooglePlaceIdColumn && !googlePlaceId ? "Image ready, Place ID missing" : "Real image ready",
            description: hasGooglePlaceIdColumn && !googlePlaceId
                ? "The image can ship, but the durable Google Place ID should still be saved."
                : "This spot has a non-placeholder image that can ship.",
            tone: hasGooglePlaceIdColumn && !googlePlaceId ? "warn" : "good",
            realPhotoCount,
            canAutoBackfill: hasGooglePlaceIdColumn && !googlePlaceId,
        };
    }

    if (
        photoSummary.kinds.unsplash > 0 ||
        photoSummary.kinds.remote_untrusted > 0 ||
        photoSummary.kinds.invalid > 0 ||
        photoSummary.kinds.direct_google > 0
    ) {
        return {
            status: "manual_review",
            label: "Photo needs review",
            description: "This spot has image data, but it is not stored in a production-safe Localley format yet.",
            tone: "warn",
            realPhotoCount,
            canAutoBackfill: true,
        };
    }

    return {
        status: "backfill_ready",
        label: "Needs real spot image",
        description: "No real spot photo is stored yet. Run a Google Places dry run before updating live data.",
        tone: "danger",
        realPhotoCount,
        canAutoBackfill: true,
    };
}

export function toSpotQualityItem(row: SpotQualityRow, hasGooglePlaceIdColumn: boolean): SpotQualityItem {
    const name = getText(row.name);
    const address = getText(row.address);
    const description = getText(row.description);
    const photos = row.photos || [];
    const normalizedPhotos = normalizeStoredSpotPhotoUrls(photos);
    const photoSummary = summarizeSpotPhotos(normalizedPhotos);
    const googlePlaceId = row.google_place_id || null;
    const placePhotoIdentity = getSpotPlacePhotoIdentityStatus(normalizedPhotos, googlePlaceId);
    const coordinates = parseSpotCoordinates(row.location);
    const lat = coordinates?.lat ?? null;
    const lng = coordinates?.lng ?? null;
    const locationConfidence = getSpotLocationConfidence({ address, lat, lng });
    const photoReadiness = getSpotPhotoReadiness(
        photoSummary,
        googlePlaceId,
        hasGooglePlaceIdColumn
    );
    const publicQualityIssue = getPublicSpotQualityIssue({
        name: row.name,
        address: row.address,
        location: row.location,
        photos: normalizedPhotos,
        google_place_id: row.google_place_id,
    });
    const issues: SpotQualityIssue[] = [];

    if (!name) issues.push("missing_name");
    if (publicQualityIssue === "broad_place_name") issues.push("broad_place_name");
    if (publicQualityIssue === "mismatched_place_photo_identity") {
        issues.push("mismatched_place_photo_identity");
    }
    if (!photoSummary.hasRealPhoto) issues.push("missing_real_photo");
    if (!locationConfidence.exactAddress) issues.push("inexact_location");
    if (
        hasGooglePlaceIdColumn &&
        photoSummary.hasRealPhoto &&
        needsSpotPlaceIdentityBackfill(normalizedPhotos, googlePlaceId)
    ) {
        issues.push("missing_place_id");
    }

    return {
        id: row.id,
        name,
        address,
        description,
        category: row.category,
        photos,
        photoSummary,
        placePhotoIdentity,
        photoReadiness,
        lat,
        lng,
        googlePlaceId,
        locationConfidence,
        publicQualityIssue,
        issues,
        publicReady: shouldShowPublicSpot({
            name: row.name,
            address: row.address,
            location: row.location,
            photos: normalizedPhotos,
            google_place_id: row.google_place_id,
        }) && (!hasGooglePlaceIdColumn || !issues.includes("missing_place_id")),
        createdAt: row.created_at || null,
    };
}

export function summarizeSpotQualityItems(items: SpotQualityItem[]): SpotQualityQueueSummary {
    return {
        total: items.length,
        publicReady: items.filter((item) => item.publicReady).length,
        needsWork: items.filter((item) => !item.publicReady).length,
        missingRealPhoto: items.filter((item) => item.issues.includes("missing_real_photo")).length,
        inexactLocation: items.filter((item) => item.issues.includes("inexact_location")).length,
        missingPlaceId: items.filter((item) => item.issues.includes("missing_place_id")).length,
        mismatchedPlacePhotoIdentity: items.filter((item) => item.issues.includes("mismatched_place_photo_identity")).length,
        broadPlaceName: items.filter((item) => item.issues.includes("broad_place_name")).length,
        missingName: items.filter((item) => item.issues.includes("missing_name")).length,
    };
}

export function buildSpotQualityQueueFromItems({
    items,
    hasGooglePlaceIdColumn,
    city,
    issue,
    limit,
    generatedAt = new Date().toISOString(),
}: {
    items: SpotQualityItem[];
    hasGooglePlaceIdColumn: boolean;
    city: string | null;
    issue: SpotQualityIssue | "all";
    limit: number;
    generatedAt?: string;
}): SpotQualityQueue {
    const selectedIssue = issue === "all" ? null : issue;
    const matchingItems = items
        .filter((item) => !item.publicReady)
        .filter((item) => !selectedIssue || item.issues.includes(selectedIssue))
        .sort((left, right) => {
            if (left.issues.length !== right.issues.length) return right.issues.length - left.issues.length;
            return (right.createdAt || "").localeCompare(left.createdAt || "");
        });
    const visibleItems = matchingItems.slice(0, limit);

    return {
        generatedAt,
        hasGooglePlaceIdColumn,
        schema: buildSpotQualitySchemaStatus(hasGooglePlaceIdColumn),
        city,
        issue,
        limit,
        summary: summarizeSpotQualityItems(items),
        filteredSummary: summarizeSpotQualityItems(matchingItems),
        visibleSummary: summarizeSpotQualityItems(visibleItems),
        items: visibleItems,
    };
}

async function fetchSpotQualityRows(
    supabase: SupabaseClient,
    city: string | null
): Promise<{ rows: SpotQualityRow[]; hasGooglePlaceIdColumn: boolean }> {
    const rows: SpotQualityRow[] = [];
    let hasGooglePlaceIdColumn = true;

    for (let from = 0; ; from += PAGE_SIZE) {
        const columns = hasGooglePlaceIdColumn
            ? "id, name, address, description, photos, category, location, google_place_id, created_at"
            : "id, name, address, description, photos, category, location, created_at";
        let query = supabase
            .from("spots")
            .select(columns)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;
        if (error) {
            if (hasGooglePlaceIdColumn && /google_place_id/i.test(error.message)) {
                hasGooglePlaceIdColumn = false;
                from -= PAGE_SIZE;
                continue;
            }

            throw new Error(`Failed to fetch spots: ${error.message}`);
        }

        rows.push(...(((data || []) as unknown) as SpotQualityRow[]));
        if (!data || data.length < PAGE_SIZE) break;
    }

    return { rows, hasGooglePlaceIdColumn };
}

export async function getSpotQualityQueue(
    supabase: SupabaseClient,
    options: {
        city?: string | null;
        issue?: SpotQualityIssue | "all" | null;
        limit?: number;
    } = {}
): Promise<SpotQualityQueue> {
    const city = options.city?.trim() || null;
    const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit || DEFAULT_LIMIT));
    const { rows, hasGooglePlaceIdColumn } = await fetchSpotQualityRows(supabase, city);
    const allItems = rows.map((row) => toSpotQualityItem(row, hasGooglePlaceIdColumn));
    const issue = options.issue && options.issue !== "all" ? options.issue : "all";

    return buildSpotQualityQueueFromItems({
        items: allItems,
        hasGooglePlaceIdColumn,
        city,
        issue,
        limit,
    });
}
