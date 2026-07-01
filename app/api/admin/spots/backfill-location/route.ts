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
    type SpotPhotoBackfillRow,
} from "@/lib/place-images";

const GOOGLE_LOOKUP_TIMEOUT_MS = 12_000;

interface LocationBackfillRequestBody {
    spotId?: string;
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

function formatPoint(lng: number, lat: number): string {
    return `POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
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
): Promise<{ spot: SpotPhotoBackfillRow | null; error: string | null; hasGooglePlaceIdColumn: boolean }> {
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
        return {
            spot: null,
            error: result.error?.message || "Spot not found",
            hasGooglePlaceIdColumn,
        };
    }

    return {
        spot: result.data as unknown as SpotPhotoBackfillRow,
        error: null,
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
    if (!spotId) {
        return NextResponse.json({ error: "Spot id is required" }, { status: 400 });
    }

    const dryRun = body.dryRun !== false;
    const includePhotos = body.includePhotos === true;
    const supabase = createSupabaseAdmin();
    const { spot, error, hasGooglePlaceIdColumn } = await fetchSpot(supabase, spotId);

    if (error || !spot) {
        return NextResponse.json(
            { error: "Failed to fetch spot", details: error || "missing_row" },
            { status: 404 }
        );
    }

    const name = getLocalizedFieldValue(spot.name);
    const address = getLocalizedFieldValue(spot.address);
    const baseResult = {
        id: spot.id,
        name,
        address,
        hasGooglePlaceIdColumn,
    };

    if (!name || !address) {
        return NextResponse.json({
            success: true,
            dryRun,
            includePhotos,
            result: {
                ...baseResult,
                status: "skipped",
                reason: "missing_name_or_address",
            } satisfies LocationBackfillResult,
        });
    }

    try {
        const match = await findBestGooglePlacePhotos(name, address, spot.category, apiKey, {
            timeoutMs: GOOGLE_LOOKUP_TIMEOUT_MS,
        });
        const place = match.place;

        if (!place) {
            return NextResponse.json({
                success: true,
                dryRun,
                includePhotos,
                result: {
                    ...baseResult,
                    status: "skipped",
                    reason: `low_confidence:${match.rejectedQuality?.reason || "no_match"}`,
                    placeId: match.rejectedPlace?.placeId || null,
                    placeName: match.rejectedPlace?.displayName || null,
                    formattedAddress: match.rejectedPlace?.formattedAddress || null,
                    photoCount: match.rejectedPlace?.photos.length || 0,
                } satisfies LocationBackfillResult,
            });
        }

        if (!place.formattedAddress || !place.location) {
            return NextResponse.json({
                success: true,
                dryRun,
                includePhotos,
                result: {
                    ...baseResult,
                    status: "skipped",
                    reason: "matched_place_missing_address_or_location",
                    placeId: place.placeId,
                    placeName: place.displayName,
                    formattedAddress: place.formattedAddress,
                    query: match.query,
                    photoCount: place.photos.length,
                } satisfies LocationBackfillResult,
            });
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
                return NextResponse.json({
                    success: false,
                    dryRun,
                    includePhotos,
                    result: {
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
                    } satisfies LocationBackfillResult,
                }, { status: 500 });
            }

            revalidateTag("spots", "default");
        }

        return NextResponse.json({
            success: true,
            dryRun,
            includePhotos,
            result: {
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
            } satisfies LocationBackfillResult,
        });
    } catch (matchError) {
        return NextResponse.json(
            {
                success: false,
                dryRun,
                includePhotos,
                result: {
                    ...baseResult,
                    status: "failed",
                    reason: matchError instanceof Error ? matchError.message : "unknown_error",
                } satisfies LocationBackfillResult,
            },
            { status: 500 }
        );
    }
}
