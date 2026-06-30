/**
 * Review and optionally apply strict Google Places photo backfills for spots.
 *
 * Usage:
 *   npx tsx scripts/review-spot-photo-backfill.ts --limit=20
 *   npx tsx scripts/review-spot-photo-backfill.ts --city=Bangkok --limit=10
 *   npx tsx scripts/review-spot-photo-backfill.ts --apply --limit=10
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
    buildSpotPhotoUrls,
    findBestGooglePlacePhotos,
    getGooglePlacesApiKey,
    getLocalizedFieldValue,
    needsSpotPhotoBackfill,
    SpotPhotoBackfillRow,
} from "../lib/place-images";

dotenv.config({ path: ".env.local" });

const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_CANDIDATES = 250;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_OUT_PATH = "reports/spot-photo-backfill-review.json";

interface Args {
    apply: boolean;
    city?: string;
    limit: number;
    maxCandidates: number;
    outPath: string;
    timeoutMs: number;
}

interface ReviewResult {
    id: string;
    name: string;
    address: string;
    category: string | null;
    status: "updated" | "would_update" | "skipped" | "failed";
    reason?: string;
    query?: string | null;
    placeId?: string | null;
    placeName?: string | null;
    formattedAddress?: string | null;
    photoCount?: number;
    quality?: {
        reason: string;
        nameScore: number;
        addressScore: number;
    } | null;
    rejected?: {
        reason?: string;
        placeId?: string | null;
        placeName?: string | null;
        formattedAddress?: string | null;
        photoCount?: number;
        nameScore?: number;
        addressScore?: number;
    };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function parseArgs(argv: string[]): Args {
    const getValue = (name: string) => {
        const arg = argv.find((value) => value.startsWith(`${name}=`));
        return arg ? arg.slice(name.length + 1).trim() : undefined;
    };

    return {
        apply: argv.includes("--apply"),
        city: getValue("--city"),
        limit: parsePositiveInt(getValue("--limit"), DEFAULT_LIMIT),
        maxCandidates: parsePositiveInt(getValue("--max-candidates"), DEFAULT_MAX_CANDIDATES),
        outPath: getValue("--out") || DEFAULT_OUT_PATH,
        timeoutMs: parsePositiveInt(getValue("--timeout-ms"), DEFAULT_TIMEOUT_MS),
    };
}

function getSupabaseCredentials(): { url: string; key: string } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!url || !key) {
        throw new Error(
            "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        );
    }

    return { url, key };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCandidates(
    supabase: SupabaseClient,
    city: string | undefined,
    maxCandidates: number
): Promise<{ candidates: SpotPhotoBackfillRow[]; scanned: number }> {
    const candidates: SpotPhotoBackfillRow[] = [];
    let scanned = 0;

    for (let from = 0; candidates.length < maxCandidates; from += PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select("id, name, address, photos, category")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch spots: ${error.message}`);

        const rows = (data || []) as SpotPhotoBackfillRow[];
        scanned += rows.length;
        candidates.push(...rows.filter((spot) => needsSpotPhotoBackfill(spot.photos)));

        if (rows.length < PAGE_SIZE) break;
    }

    return { candidates: candidates.slice(0, maxCandidates), scanned };
}

function toQuality(
    quality: ReviewResult["quality"] | undefined | null
): ReviewResult["quality"] {
    if (!quality) return null;
    return {
        reason: quality.reason,
        nameScore: quality.nameScore,
        addressScore: quality.addressScore,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { url, key } = getSupabaseCredentials();
    const apiKey = getGooglePlacesApiKey();

    if (!apiKey) {
        throw new Error("Missing GOOGLE_PLACES_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
    }

    const supabase = createClient(url, key);
    const startedAt = new Date().toISOString();
    const { candidates, scanned } = await fetchCandidates(
        supabase,
        args.city,
        args.maxCandidates
    );
    const results: ReviewResult[] = [];
    let successfulCandidates = 0;

    for (const spot of candidates) {
        if (successfulCandidates >= args.limit) break;

        const name = getLocalizedFieldValue(spot.name);
        const address = getLocalizedFieldValue(spot.address);
        const base = {
            id: spot.id,
            name,
            address,
            category: spot.category || null,
        };

        if (!name || !address) {
            results.push({
                ...base,
                status: "skipped",
                reason: "missing_name_or_address",
            });
            continue;
        }

        try {
            const match = await findBestGooglePlacePhotos(name, address, spot.category, apiKey, {
                timeoutMs: args.timeoutMs,
            });
            const place = match.place;
            const photoUrls = place ? buildSpotPhotoUrls(place.photos) : [];

            if (!place && match.rejectedPlace) {
                results.push({
                    ...base,
                    status: "skipped",
                    reason: `low_confidence:${match.rejectedQuality?.reason || "rejected"}`,
                    query: match.query,
                    rejected: {
                        reason: match.rejectedQuality?.reason,
                        placeId: match.rejectedPlace.placeId,
                        placeName: match.rejectedPlace.displayName,
                        formattedAddress: match.rejectedPlace.formattedAddress,
                        photoCount: match.rejectedPlace.photos.length,
                        nameScore: match.rejectedQuality?.nameScore,
                        addressScore: match.rejectedQuality?.addressScore,
                    },
                });
                await sleep(150);
                continue;
            }

            if (photoUrls.length === 0) {
                results.push({
                    ...base,
                    status: "skipped",
                    reason: "no_google_place_photos_found",
                    query: match.query,
                    placeId: place?.placeId || null,
                    placeName: place?.displayName || null,
                    formattedAddress: place?.formattedAddress || null,
                    photoCount: place?.photos.length || 0,
                });
                await sleep(150);
                continue;
            }

            if (args.apply) {
                const { error } = await supabase
                    .from("spots")
                    .update({
                        photos: photoUrls,
                        google_place_id: place?.placeId || null,
                    })
                    .eq("id", spot.id);

                if (error) {
                    results.push({
                        ...base,
                        status: "failed",
                        reason: error.message,
                        query: match.query,
                        placeId: place?.placeId || null,
                        placeName: place?.displayName || null,
                        formattedAddress: place?.formattedAddress || null,
                        photoCount: photoUrls.length,
                        quality: toQuality(match.quality),
                    });
                    await sleep(150);
                    continue;
                }
            }

            results.push({
                ...base,
                status: args.apply ? "updated" : "would_update",
                query: match.query,
                placeId: place?.placeId || null,
                placeName: place?.displayName || null,
                formattedAddress: place?.formattedAddress || null,
                photoCount: photoUrls.length,
                quality: toQuality(match.quality),
            });
            successfulCandidates++;
        } catch (error) {
            results.push({
                ...base,
                status: "failed",
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }

        await sleep(150);
    }

    const report = {
        startedAt,
        finishedAt: new Date().toISOString(),
        dryRun: !args.apply,
        city: args.city || null,
        limit: args.limit,
        maxCandidates: args.maxCandidates,
        scanned,
        candidates: candidates.length,
        processed: results.length,
        updated: results.filter((result) => result.status === "updated").length,
        wouldUpdate: results.filter((result) => result.status === "would_update").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
        results,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
