import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    buildSpotPhotoUrls,
    findGooglePlacePhotos,
    getGooglePlacesApiKey,
    getLocalizedFieldValue,
    needsSpotPhotoBackfill,
    SpotPhotoBackfillRow,
} from "@/lib/place-images";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 15;

interface BackfillRequestBody {
    limit?: number;
    city?: string;
    dryRun?: boolean;
}

interface BackfillResult {
    id: string;
    name: string;
    address: string;
    status: "updated" | "would_update" | "skipped" | "failed";
    reason?: string;
    placeId?: string | null;
    placeName?: string | null;
    photoCount?: number;
}

function getLimit(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    const dryRun = body.dryRun !== false;
    const city = body.city?.trim();
    const supabase = createSupabaseAdmin();

    let query = supabase
        .from("spots")
        .select("id, name, address, photos, category")
        .order("created_at", { ascending: false });

    if (city) {
        query = query.ilike("address->>en", `%${city}%`);
    }

    const { data, error } = await query.limit(250);

    if (error) {
        return NextResponse.json(
            { error: "Failed to fetch spots", details: error.message },
            { status: 500 }
        );
    }

    const candidates = ((data || []) as SpotPhotoBackfillRow[])
        .filter((spot) => needsSpotPhotoBackfill(spot.photos))
        .slice(0, limit);

    const results: BackfillResult[] = [];

    for (const spot of candidates) {
        const name = getLocalizedFieldValue(spot.name);
        const address = getLocalizedFieldValue(spot.address);

        if (!name || !address) {
            results.push({
                id: spot.id,
                name,
                address,
                status: "skipped",
                reason: "missing_name_or_address",
            });
            continue;
        }

        try {
            const place = await findGooglePlacePhotos(name, address, apiKey);
            const photoUrls = place ? buildSpotPhotoUrls(place.photos) : [];

            if (photoUrls.length === 0) {
                results.push({
                    id: spot.id,
                    name,
                    address,
                    status: "skipped",
                    reason: "no_google_place_photos_found",
                    placeId: place?.placeId || null,
                    placeName: place?.displayName || null,
                });
                await sleep(150);
                continue;
            }

            if (!dryRun) {
                const { error: updateError } = await supabase
                    .from("spots")
                    .update({ photos: photoUrls })
                    .eq("id", spot.id);

                if (updateError) {
                    results.push({
                        id: spot.id,
                        name,
                        address,
                        status: "failed",
                        reason: updateError.message,
                        placeId: place?.placeId || null,
                        placeName: place?.displayName || null,
                        photoCount: photoUrls.length,
                    });
                    await sleep(150);
                    continue;
                }
            }

            results.push({
                id: spot.id,
                name,
                address,
                status: dryRun ? "would_update" : "updated",
                placeId: place?.placeId || null,
                placeName: place?.displayName || null,
                photoCount: photoUrls.length,
            });
        } catch (error) {
            results.push({
                id: spot.id,
                name,
                address,
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
        limit,
        city: city || null,
        scanned: data?.length || 0,
        candidates: candidates.length,
        updated: results.filter((result) => result.status === "updated").length,
        wouldUpdate: results.filter((result) => result.status === "would_update").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
        results,
    });
}
