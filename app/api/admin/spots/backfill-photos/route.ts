import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    buildSpotPhotoUrls,
    findBestGooglePlacePhotos,
    getGooglePlacesApiKey,
    getLocalizedFieldValue,
    getSpotPhotoBackfillNeeds,
    SpotPhotoBackfillRow,
} from "@/lib/place-images";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 15;
const MAX_PROCESSED = 250;
const DEFAULT_PROCESSED_MULTIPLIER = 3;
const GOOGLE_LOOKUP_TIMEOUT_MS = 12_000;
const SPOT_PAGE_SIZE = 1000;

interface BackfillRequestBody {
    limit?: number;
    maxProcessed?: number;
    city?: string;
    spotId?: string;
    dryRun?: boolean;
    upgradeToPlacePhotos?: boolean;
}

interface BackfillResult {
    id: string;
    name: string;
    address: string;
    status: "updated" | "would_update" | "skipped" | "failed";
    reason?: string;
    placeId?: string | null;
    placeName?: string | null;
    query?: string | null;
    photoCount?: number;
    needsPhotoBackfill?: boolean;
    needsPlaceIdBackfill?: boolean;
    needsPlacePhotoUpgrade?: boolean;
    hasIdentityMismatch?: boolean;
    updatedFields?: string[];
}

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

async function fetchBackfillCandidates(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    city: string | undefined,
    maxProcessed: number,
    upgradeToPlacePhotos: boolean
): Promise<{ candidates: SpotPhotoBackfillRow[]; scanned: number; hasGooglePlaceIdColumn: boolean }> {
    const candidates: SpotPhotoBackfillRow[] = [];
    let scanned = 0;
    let hasGooglePlaceIdColumn = true;

    for (let from = 0; candidates.length < maxProcessed; from += SPOT_PAGE_SIZE) {
        const selectColumns = hasGooglePlaceIdColumn
            ? "id, name, address, photos, category, google_place_id"
            : "id, name, address, photos, category";
        let query = supabase
            .from("spots")
            .select(selectColumns as string)
            .order("created_at", { ascending: false })
            .range(from, from + SPOT_PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;

        if (error) {
            if (hasGooglePlaceIdColumn && /google_place_id/i.test(error.message)) {
                hasGooglePlaceIdColumn = false;
                from -= SPOT_PAGE_SIZE;
                continue;
            }

            throw new Error(`Failed to fetch spots: ${error.message}`);
        }

        const rows = ((data || []) as unknown) as SpotPhotoBackfillRow[];
        scanned += rows.length;

        candidates.push(
            ...rows.filter((spot) => {
                const needs = getSpotPhotoBackfillNeeds(spot.photos, spot.google_place_id, {
                    upgradeToPlacePhotos,
                });
                return needs.needsPhotoBackfill ||
                    needs.hasIdentityMismatch ||
                    (hasGooglePlaceIdColumn && needs.needsPlaceIdBackfill) ||
                    (upgradeToPlacePhotos && needs.needsPlacePhotoUpgrade);
            })
        );

        if (rows.length < SPOT_PAGE_SIZE) break;
    }

    return { candidates: candidates.slice(0, maxProcessed), scanned, hasGooglePlaceIdColumn };
}

async function fetchSingleBackfillCandidate(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    spotId: string,
    upgradeToPlacePhotos: boolean
): Promise<{ candidates: SpotPhotoBackfillRow[]; scanned: number; hasGooglePlaceIdColumn: boolean }> {
    let hasGooglePlaceIdColumn = true;
    let result = await supabase
        .from("spots")
        .select("id, name, address, photos, category, google_place_id")
        .eq("id", spotId)
        .single();

    if (result.error && /google_place_id/i.test(result.error.message)) {
        hasGooglePlaceIdColumn = false;
        result = await supabase
            .from("spots")
            .select("id, name, address, photos, category")
            .eq("id", spotId)
            .single();
    }

    if (result.error || !result.data) {
        throw new Error(result.error?.message || "Spot not found");
    }

    const row = result.data as unknown as SpotPhotoBackfillRow;
    const needs = getSpotPhotoBackfillNeeds(row.photos, row.google_place_id, {
        upgradeToPlacePhotos,
    });
    const needsBackfill =
        needs.needsPhotoBackfill ||
        needs.hasIdentityMismatch ||
        (
            hasGooglePlaceIdColumn &&
            needs.needsPlaceIdBackfill
        ) ||
        (upgradeToPlacePhotos && needs.needsPlacePhotoUpgrade);

    return {
        candidates: needsBackfill ? [row] : [],
        scanned: 1,
        hasGooglePlaceIdColumn,
    };
}

export async function POST(req: NextRequest) {
    const { response } = await requireAdmin(
        "/api/admin/spots/backfill-photos",
        "backfill-photos"
    );
    if (response) return response;

    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) {
        return NextResponse.json(
            { error: "GOOGLE_PLACES_API_KEY is not configured" },
            { status: 503 }
        );
    }

    let body: BackfillRequestBody = {};
    try {
        body = (await req.json()) as BackfillRequestBody;
    } catch {
        body = {};
    }

    const limit = getLimit(body.limit);
    const maxProcessed = getMaxProcessed(body.maxProcessed, limit);
    const dryRun = body.dryRun !== false;
    const upgradeToPlacePhotos = body.upgradeToPlacePhotos === true;
    const city = body.city?.trim();
    const spotId = body.spotId?.trim();
    const supabase = createSupabaseAdmin();

    let backfillRows: {
        candidates: SpotPhotoBackfillRow[];
        scanned: number;
        hasGooglePlaceIdColumn: boolean;
    };
    try {
        backfillRows = spotId
            ? await fetchSingleBackfillCandidate(supabase, spotId, upgradeToPlacePhotos)
            : await fetchBackfillCandidates(supabase, city, maxProcessed, upgradeToPlacePhotos);
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to fetch spots",
                details: error instanceof Error ? error.message : "unknown_error",
            },
            { status: 500 }
        );
    }

    const candidates = backfillRows.candidates;

    const results: BackfillResult[] = [];
    let successfulCandidates = 0;

    for (const spot of candidates) {
        if (successfulCandidates >= limit) break;

        const name = getLocalizedFieldValue(spot.name);
        const address = getLocalizedFieldValue(spot.address);
        const backfillNeeds = getSpotPhotoBackfillNeeds(spot.photos, spot.google_place_id, {
            upgradeToPlacePhotos,
        });
        const needsPhotoBackfill = backfillNeeds.needsPhotoBackfill;
        const needsPlaceIdBackfill =
            backfillNeeds.needsPlaceIdBackfill && backfillRows.hasGooglePlaceIdColumn;
        const needsPlacePhotoUpgrade = backfillNeeds.needsPlacePhotoUpgrade;
        const baseResult = {
            id: spot.id,
            name,
            address,
            needsPhotoBackfill,
            needsPlaceIdBackfill,
            needsPlacePhotoUpgrade,
            hasIdentityMismatch: backfillNeeds.hasIdentityMismatch,
        };

        if (!name || !address) {
            results.push({
                ...baseResult,
                status: "skipped",
                reason: "missing_name_or_address",
            });
            continue;
        }

        try {
            const match = await findBestGooglePlacePhotos(name, address, spot.category, apiKey, {
                timeoutMs: GOOGLE_LOOKUP_TIMEOUT_MS,
            });
            const place = match.place;
            const photoUrls = place ? buildSpotPhotoUrls(place.photos) : [];

            if (!place && match.rejectedPlace) {
                results.push({
                    ...baseResult,
                    status: "skipped",
                    reason: `low_confidence:${match.rejectedQuality?.reason || "rejected"}`,
                    placeId: match.rejectedPlace.placeId || null,
                    placeName: match.rejectedPlace.displayName || null,
                    photoCount: match.rejectedPlace.photos.length,
                });
                await sleep(150);
                continue;
            }

            if (photoUrls.length === 0) {
                results.push({
                    ...baseResult,
                    status: "skipped",
                    reason: "no_google_place_photos_found",
                    placeId: place?.placeId || null,
                    placeName: place?.displayName || null,
                    query: match.query,
                });
                await sleep(150);
                continue;
            }

            const storedPlaceId = spot.google_place_id?.trim() || null;
            const matchedPlaceId = place?.placeId || null;
            const shouldReplacePhotos =
                needsPhotoBackfill ||
                backfillNeeds.hasIdentityMismatch ||
                (upgradeToPlacePhotos && needsPlacePhotoUpgrade);
            const shouldSavePlaceId = needsPlaceIdBackfill && backfillRows.hasGooglePlaceIdColumn;

            if (
                shouldReplacePhotos &&
                storedPlaceId &&
                matchedPlaceId &&
                storedPlaceId !== matchedPlaceId
            ) {
                results.push({
                    ...baseResult,
                    status: "skipped",
                    reason: "place_id_conflict_for_photo_upgrade",
                    placeId: matchedPlaceId,
                    placeName: place?.displayName || null,
                    query: match.query,
                    photoCount: photoUrls.length,
                });
                await sleep(150);
                continue;
            }

            const updatePayload: {
                google_place_id?: string | null;
                photos?: string[];
            } = {};

            if (shouldSavePlaceId) {
                updatePayload.google_place_id = place?.placeId || null;
            }

            if (shouldReplacePhotos) {
                updatePayload.photos = photoUrls;
            }

            const updatedFields = Object.keys(updatePayload);

            if (!dryRun) {
                const { error: updateError } = await supabase
                    .from("spots")
                    .update(updatePayload)
                    .eq("id", spot.id);

                if (updateError) {
                    results.push({
                        ...baseResult,
                        status: "failed",
                        reason: updateError.message,
                        placeId: place?.placeId || null,
                        placeName: place?.displayName || null,
                        query: match.query,
                        photoCount: photoUrls.length,
                        updatedFields,
                    });
                    await sleep(150);
                    continue;
                }
            }

            results.push({
                ...baseResult,
                status: dryRun ? "would_update" : "updated",
                placeId: place?.placeId || null,
                placeName: place?.displayName || null,
                query: match.query,
                photoCount: photoUrls.length,
                updatedFields,
            });
            successfulCandidates++;
        } catch (error) {
            results.push({
                ...baseResult,
                status: "failed",
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }

        await sleep(150);
    }

    if (!dryRun && results.some((result) => result.status === "updated")) {
        revalidateTag("spots", "default");
    }

    return NextResponse.json({
        success: true,
        dryRun,
        upgradeToPlacePhotos,
        limit,
        maxProcessed,
        city: city || null,
        spotId: spotId || null,
        hasGooglePlaceIdColumn: backfillRows.hasGooglePlaceIdColumn,
        scanned: backfillRows.scanned,
        candidates: candidates.length,
        processed: results.length,
        updated: results.filter((result) => result.status === "updated").length,
        wouldUpdate: results.filter((result) => result.status === "would_update").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
        results,
    });
}
