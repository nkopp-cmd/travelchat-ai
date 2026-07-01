import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    buildSpotPhotoUrls,
    findBestGooglePlaceMatch,
    getGooglePlacesApiKey,
    getLocalizedFieldValue,
    getSpotPhotoBackfillNeeds,
    type SpotPhotoBackfillRow,
} from "@/lib/place-images";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";

const GOOGLE_LOOKUP_TIMEOUT_MS = 12_000;
const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 5;
const MAX_PROCESSED = 150;
const DEFAULT_PROCESSED_MULTIPLIER = 4;
const SPOT_PAGE_SIZE = 1000;

interface LocationBackfillRequestBody {
    spotId?: string;
    spotIds?: string[];
    city?: string;
    limit?: number;
    maxProcessed?: number;
    dryRun?: boolean;
    includePhotos?: boolean;
}

type LocationBackfillStatus = "updated" | "would_update" | "skipped" | "failed";

interface LocationBackfillResult {
    id: string;
    name: string;
    address: string;
    status: LocationBackfillStatus;
    reason?: string;
    placeId?: string | null;
    placeName?: string | null;
    formattedAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    query?: string | null;
    photoCount?: number;
    updatedFields?: string[];
    hasGooglePlaceIdColumn?: boolean;
}

type LocationBackfillRow = SpotPhotoBackfillRow & {
    location?: unknown;
};

function getLimit(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function getMaxProcessed(value: unknown, limit: number): number {
    const fallback = Math.min(MAX_PROCESSED, limit * DEFAULT_PROCESSED_MULTIPLIER);
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_PROCESSED, Math.max(limit, parsed));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPoint(lng: number, lat: number): string {
    return `POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
}

function getSpotIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .map((id) => typeof id === "string" ? id.trim() : "")
                .filter(Boolean)
        )
    ).slice(0, MAX_LIMIT);
}

function selectLocationBackfillColumns(hasGooglePlaceIdColumn: boolean): string {
    return hasGooglePlaceIdColumn
        ? "id, name, address, photos, category, location, google_place_id"
        : "id, name, address, photos, category, location";
}

function normalizeAddressField(
    current: SpotPhotoBackfillRow["address"],
    nextAddress: string
): Record<string, string> {
    if (current && typeof current === "object") {
        return {
            ...current,
            en: nextAddress,
        };
    }

    return { en: nextAddress };
}

async function fetchSpot(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    spotId: string
): Promise<{ spot: LocationBackfillRow | null; error: string | null; hasGooglePlaceIdColumn: boolean }> {
    let hasGooglePlaceIdColumn = true;
    let result = await supabase
        .from("spots")
        .select("id, name, address, photos, category, location, google_place_id")
        .eq("id", spotId)
        .single();

    if (result.error && /google_place_id/i.test(result.error.message)) {
        hasGooglePlaceIdColumn = false;
        result = await supabase
            .from("spots")
            .select("id, name, address, photos, category, location")
            .eq("id", spotId)
            .single();
    }

    if (result.error || !result.data) {
        return {
            spot: null,
            error: result.error?.message || "Spot not found",
            hasGooglePlaceIdColumn,
        };
    }

    return {
        spot: result.data as unknown as LocationBackfillRow,
        error: null,
        hasGooglePlaceIdColumn,
    };
}

async function processLocationBackfillSpot({
    supabase,
    spot,
    apiKey,
    dryRun,
    includePhotos,
    hasGooglePlaceIdColumn,
}: {
    supabase: ReturnType<typeof createSupabaseAdmin>;
    spot: LocationBackfillRow;
    apiKey: string;
    dryRun: boolean;
    includePhotos: boolean;
    hasGooglePlaceIdColumn: boolean;
}): Promise<LocationBackfillResult> {
    const name = getLocalizedFieldValue(spot.name);
    const address = getLocalizedFieldValue(spot.address);
    const baseResult = {
        id: spot.id,
        name,
        address,
        hasGooglePlaceIdColumn,
    };

    if (!name || !address) {
        return {
            ...baseResult,
            status: "skipped",
            reason: "missing_name_or_address",
        };
    }

    try {
        const match = await findBestGooglePlaceMatch(name, address, spot.category, apiKey, {
            timeoutMs: GOOGLE_LOOKUP_TIMEOUT_MS,
        });
        const place = match.place;

        if (!place) {
            return {
                ...baseResult,
                status: "skipped",
                reason: `low_confidence:${match.rejectedQuality?.reason || "no_match"}`,
                placeId: match.rejectedPlace?.placeId || null,
                placeName: match.rejectedPlace?.displayName || null,
                formattedAddress: match.rejectedPlace?.formattedAddress || null,
                photoCount: match.rejectedPlace?.photos.length || 0,
            };
        }

        if (!place.formattedAddress || !place.location) {
            return {
                ...baseResult,
                status: "skipped",
                reason: "matched_place_missing_address_or_location",
                placeId: place.placeId,
                placeName: place.displayName,
                formattedAddress: place.formattedAddress,
                query: match.query,
                photoCount: place.photos.length,
            };
        }

        const lat = place.location.latitude;
        const lng = place.location.longitude;
        const photoUrls = buildSpotPhotoUrls(place.photos);
        const photoNeeds = getSpotPhotoBackfillNeeds(spot.photos, spot.google_place_id, {
            upgradeToPlacePhotos: includePhotos,
        });
        const updatePayload: {
            address: Record<string, string>;
            location: string;
            google_place_id?: string | null;
            photos?: string[];
        } = {
            address: normalizeAddressField(spot.address, place.formattedAddress),
            location: formatPoint(lng, lat),
        };

        if (hasGooglePlaceIdColumn) {
            updatePayload.google_place_id = place.placeId || null;
        }

        if (
            includePhotos &&
            photoUrls.length > 0 &&
            (
                photoNeeds.needsPhotoBackfill ||
                photoNeeds.hasIdentityMismatch ||
                photoNeeds.needsPlacePhotoUpgrade
            )
        ) {
            updatePayload.photos = photoUrls;
        }

        const updatedFields = Object.keys(updatePayload);

        if (!dryRun) {
            const { error: updateError } = await supabase
                .from("spots")
                .update(updatePayload)
                .eq("id", spot.id);

            if (updateError) {
                return {
                    ...baseResult,
                    status: "failed",
                    reason: updateError.message,
                    placeId: place.placeId,
                    placeName: place.displayName,
                    formattedAddress: place.formattedAddress,
                    lat,
                    lng,
                    query: match.query,
                    photoCount: photoUrls.length,
                    updatedFields,
                };
            }
        }

        return {
            ...baseResult,
            status: dryRun ? "would_update" : "updated",
            placeId: place.placeId,
            placeName: place.displayName,
            formattedAddress: place.formattedAddress,
            lat,
            lng,
            query: match.query,
            photoCount: photoUrls.length,
            updatedFields,
        };
    } catch (matchError) {
        return {
            ...baseResult,
            status: "failed",
            reason: matchError instanceof Error ? matchError.message : "unknown_error",
        };
    }
}

function needsLocationBackfill(
    spot: LocationBackfillRow,
    includePhotos: boolean,
    hasGooglePlaceIdColumn: boolean
): boolean {
    const address = getLocalizedFieldValue(spot.address);
    const coordinates = parseSpotCoordinates(spot.location);
    const confidence = getSpotLocationConfidence({
        address,
        lat: coordinates?.lat,
        lng: coordinates?.lng,
    });
    const photoNeeds = getSpotPhotoBackfillNeeds(spot.photos, spot.google_place_id, {
        upgradeToPlacePhotos: includePhotos,
    });

    return (
        !confidence.exactAddress ||
        (hasGooglePlaceIdColumn && !spot.google_place_id?.trim()) ||
        (includePhotos && (
            photoNeeds.needsPhotoBackfill ||
            photoNeeds.hasIdentityMismatch ||
            photoNeeds.needsPlacePhotoUpgrade
        ))
    );
}

async function fetchBackfillCandidates(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    city: string | undefined,
    maxProcessed: number,
    includePhotos: boolean
): Promise<{ candidates: LocationBackfillRow[]; scanned: number; hasGooglePlaceIdColumn: boolean }> {
    const candidates: LocationBackfillRow[] = [];
    let scanned = 0;
    let hasGooglePlaceIdColumn = true;

    for (let from = 0; candidates.length < maxProcessed; from += SPOT_PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select(selectLocationBackfillColumns(hasGooglePlaceIdColumn));

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        query = query
            .order("created_at", { ascending: false })
            .range(from, from + SPOT_PAGE_SIZE - 1);

        const { data, error } = await query;

        if (error) {
            if (hasGooglePlaceIdColumn && /google_place_id/i.test(error.message)) {
                hasGooglePlaceIdColumn = false;
                from -= SPOT_PAGE_SIZE;
                continue;
            }

            throw new Error(`Failed to fetch spots: ${error.message}`);
        }

        const rows = ((data || []) as unknown) as LocationBackfillRow[];
        scanned += rows.length;
        candidates.push(
            ...rows.filter((spot) =>
                needsLocationBackfill(spot, includePhotos, hasGooglePlaceIdColumn)
            )
        );

        if (rows.length < SPOT_PAGE_SIZE) break;
    }

    return { candidates: candidates.slice(0, maxProcessed), scanned, hasGooglePlaceIdColumn };
}

async function fetchBackfillCandidatesByIds(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    spotIds: string[],
    includePhotos: boolean
): Promise<{ candidates: LocationBackfillRow[]; scanned: number; hasGooglePlaceIdColumn: boolean }> {
    let hasGooglePlaceIdColumn = true;
    let result = await supabase
        .from("spots")
        .select(selectLocationBackfillColumns(hasGooglePlaceIdColumn))
        .in("id", spotIds);

    if (result.error && /google_place_id/i.test(result.error.message)) {
        hasGooglePlaceIdColumn = false;
        result = await supabase
            .from("spots")
            .select(selectLocationBackfillColumns(hasGooglePlaceIdColumn))
            .in("id", spotIds);
    }

    if (result.error) {
        throw new Error(`Failed to fetch spots: ${result.error.message}`);
    }

    const rows = ((result.data || []) as unknown) as LocationBackfillRow[];
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = spotIds
        .map((id) => rowById.get(id))
        .filter((row): row is LocationBackfillRow => Boolean(row));

    return {
        candidates: orderedRows.filter((spot) =>
            needsLocationBackfill(spot, includePhotos, hasGooglePlaceIdColumn)
        ),
        scanned: rows.length,
        hasGooglePlaceIdColumn,
    };
}

export async function POST(req: NextRequest) {
    const { response } = await requireAdmin(
        "/api/admin/spots/backfill-location",
        "backfill-location"
    );
    if (response) return response;

    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) {
        return NextResponse.json(
            { error: "GOOGLE_PLACES_API_KEY is not configured" },
            { status: 503 }
        );
    }

    let body: LocationBackfillRequestBody = {};
    try {
        body = (await req.json()) as LocationBackfillRequestBody;
    } catch {
        body = {};
    }

    const spotId = body.spotId?.trim();
    const spotIds = getSpotIds(body.spotIds);
    const dryRun = body.dryRun !== false;
    const includePhotos = body.includePhotos === true;
    const limit = getLimit(body.limit);
    const maxProcessed = getMaxProcessed(body.maxProcessed, limit);
    const city = body.city?.trim();
    const supabase = createSupabaseAdmin();

    if (spotId) {
        const { spot, error, hasGooglePlaceIdColumn } = await fetchSpot(supabase, spotId);

        if (error || !spot) {
            return NextResponse.json(
                { error: "Failed to fetch spot", details: error || "missing_row" },
                { status: 404 }
            );
        }

        const result = await processLocationBackfillSpot({
            supabase,
            spot,
            apiKey,
            dryRun,
            includePhotos,
            hasGooglePlaceIdColumn,
        });

        if (!dryRun && result.status === "updated") {
            revalidateTag("spots", "default");
        }

        return NextResponse.json({
            success: result.status !== "failed",
            dryRun,
            includePhotos,
            result,
        }, { status: result.status === "failed" ? 500 : 200 });
    }

    let backfillRows: {
        candidates: LocationBackfillRow[];
        scanned: number;
        hasGooglePlaceIdColumn: boolean;
    };
    try {
        backfillRows = spotIds.length > 0
            ? await fetchBackfillCandidatesByIds(
                supabase,
                spotIds,
                includePhotos
            )
            : await fetchBackfillCandidates(
                supabase,
                city,
                maxProcessed,
                includePhotos
            );
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to fetch spots",
                details: error instanceof Error ? error.message : "unknown_error",
            },
            { status: 500 }
        );
    }

    const results: LocationBackfillResult[] = [];
    let successfulCandidates = 0;
    for (const spot of backfillRows.candidates) {
        if (successfulCandidates >= limit) break;

        const result = await processLocationBackfillSpot({
            supabase,
            spot,
            apiKey,
            dryRun,
            includePhotos,
            hasGooglePlaceIdColumn: backfillRows.hasGooglePlaceIdColumn,
        });
        results.push(result);
        if (result.status === "would_update" || result.status === "updated") {
            successfulCandidates++;
        }

        await sleep(150);
    }

    if (!dryRun && results.some((result) => result.status === "updated")) {
        revalidateTag("spots", "default");
    }

    return NextResponse.json({
        success: !results.some((result) => result.status === "failed"),
        dryRun,
        includePhotos,
        limit,
        maxProcessed,
        city: city || null,
        spotId: null,
        spotIds: spotIds.length > 0 ? spotIds : null,
        hasGooglePlaceIdColumn: backfillRows.hasGooglePlaceIdColumn,
        scanned: backfillRows.scanned,
        candidates: backfillRows.candidates.length,
        processed: results.length,
        updated: results.filter((result) => result.status === "updated").length,
        wouldUpdate: results.filter((result) => result.status === "would_update").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
        results,
    });
}
