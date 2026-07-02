/**
 * Review and optionally apply strict Google Places address/coordinate backfills.
 *
 * Usage:
 *   npx tsx scripts/review-spot-location-backfill.ts --limit=10
 *   npx tsx scripts/review-spot-location-backfill.ts --env-file=.env.vercel.local --city=Tokyo --limit=5
 *   npx tsx scripts/review-spot-location-backfill.ts --spot-id=<uuid>
 *   npx tsx scripts/review-spot-location-backfill.ts --include-photos --apply --spot-ids=<uuid>,<uuid>
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
    buildSpotPhotoUrls,
    findBestGooglePlaceMatch,
    getGooglePlacesApiKey,
    getLocalizedFieldValue,
    getSpotPhotoBackfillNeeds,
    type SpotPhotoBackfillRow,
} from "../lib/place-images";
import { parseSpotCoordinates } from "../lib/spots/coordinates";
import { getSpotLocationConfidence } from "../lib/spots/location-confidence";

const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_CANDIDATES = 100;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_OUT_PATH = "reports/spot-location-backfill-review.json";

interface Args {
    apply: boolean;
    city?: string;
    envFile: string;
    includePhotos: boolean;
    limit: number;
    maxCandidates: number;
    outPath: string;
    spotId?: string;
    spotIds: string[];
    timeoutMs: number;
}

type LocationBackfillStatus = "updated" | "would_update" | "skipped" | "failed";

interface LocationBackfillRow extends SpotPhotoBackfillRow {
    location?: unknown;
}

interface LocationBackfillResult {
    id: string;
    name: string;
    address: string;
    status: LocationBackfillStatus;
    reason?: string;
    query?: string | null;
    placeId?: string | null;
    placeName?: string | null;
    formattedAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    photoCount?: number;
    updatedFields?: string[];
    hasGooglePlaceIdColumn?: boolean;
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

function getArgValue(argv: string[], name: string): string | undefined {
    const arg = argv.find((value) => value.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1).trim() : undefined;
}

function parseSpotIds(value: string | undefined): string[] {
    if (!value) return [];
    return Array.from(
        new Set(
            value
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
        ),
    ).slice(0, DEFAULT_MAX_CANDIDATES);
}

function parseArgs(argv: string[]): Args {
    return {
        apply: argv.includes("--apply"),
        city: getArgValue(argv, "--city"),
        envFile: getArgValue(argv, "--env-file") || ".env.local",
        includePhotos: argv.includes("--include-photos"),
        limit: parsePositiveInt(getArgValue(argv, "--limit"), DEFAULT_LIMIT),
        maxCandidates: parsePositiveInt(getArgValue(argv, "--max-candidates"), DEFAULT_MAX_CANDIDATES),
        outPath: getArgValue(argv, "--out") || DEFAULT_OUT_PATH,
        spotId: getArgValue(argv, "--spot-id"),
        spotIds: parseSpotIds(getArgValue(argv, "--spot-ids")),
        timeoutMs: parsePositiveInt(getArgValue(argv, "--timeout-ms"), DEFAULT_TIMEOUT_MS),
    };
}

function getSupabaseCredentials(): { url: string; key: string } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!url || !key) {
        throw new Error(
            "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        );
    }

    return { url, key };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPoint(lng: number, lat: number): string {
    return `POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
}

function selectColumns(hasGooglePlaceIdColumn: boolean): string {
    return hasGooglePlaceIdColumn
        ? "id, name, address, photos, category, location, google_place_id, created_at"
        : "id, name, address, photos, category, location, created_at";
}

function normalizeAddressField(
    current: SpotPhotoBackfillRow["address"],
    nextAddress: string,
): Record<string, string> {
    if (current && typeof current === "object") {
        return {
            ...current,
            en: nextAddress,
        };
    }

    return { en: nextAddress };
}

function needsLocationBackfill(
    spot: LocationBackfillRow,
    includePhotos: boolean,
    hasGooglePlaceIdColumn: boolean,
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
        (includePhotos &&
            (photoNeeds.needsPhotoBackfill ||
                photoNeeds.hasIdentityMismatch ||
                photoNeeds.needsPlacePhotoUpgrade))
    );
}

function coordinatesChanged(
    current: ReturnType<typeof parseSpotCoordinates>,
    nextLat: number,
    nextLng: number,
): boolean {
    if (!current) return true;
    return (
        Math.abs(current.lat - nextLat) > 0.0001 ||
        Math.abs(current.lng - nextLng) > 0.0001
    );
}

async function fetchRows(
    supabase: SupabaseClient,
    args: Args,
): Promise<{ candidates: LocationBackfillRow[]; scanned: number; hasGooglePlaceIdColumn: boolean }> {
    let hasGooglePlaceIdColumn = true;
    let scanned = 0;

    if (args.spotId || args.spotIds.length > 0) {
        const ids = args.spotId ? [args.spotId] : args.spotIds;
        let result = await supabase
            .from("spots")
            .select(selectColumns(hasGooglePlaceIdColumn))
            .in("id", ids);

        if (result.error && /google_place_id/i.test(result.error.message)) {
            hasGooglePlaceIdColumn = false;
            result = await supabase
                .from("spots")
                .select(selectColumns(hasGooglePlaceIdColumn))
                .in("id", ids);
        }

        if (result.error) throw new Error(`Failed to fetch spots: ${result.error.message}`);

        const rows = ((result.data || []) as unknown) as LocationBackfillRow[];
        const rowById = new Map(rows.map((row) => [row.id, row]));
        const orderedRows = ids
            .map((id) => rowById.get(id))
            .filter((row): row is LocationBackfillRow => Boolean(row));

        return {
            candidates: orderedRows,
            scanned: rows.length,
            hasGooglePlaceIdColumn,
        };
    }

    const candidates: LocationBackfillRow[] = [];
    for (let from = 0; candidates.length < args.maxCandidates; from += PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select(selectColumns(hasGooglePlaceIdColumn))
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (args.city) {
            query = query.ilike("address->>en", `%${args.city}%`);
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

        const rows = ((data || []) as unknown) as LocationBackfillRow[];
        scanned += rows.length;
        candidates.push(
            ...rows.filter((spot) =>
                needsLocationBackfill(spot, args.includePhotos, hasGooglePlaceIdColumn),
            ),
        );

        if (rows.length < PAGE_SIZE) break;
    }

    return {
        candidates: candidates.slice(0, args.maxCandidates),
        scanned,
        hasGooglePlaceIdColumn,
    };
}

function toQuality(quality: LocationBackfillResult["quality"] | undefined | null) {
    if (!quality) return null;
    return {
        reason: quality.reason,
        nameScore: quality.nameScore,
        addressScore: quality.addressScore,
    };
}

async function processSpot({
    supabase,
    spot,
    apiKey,
    args,
    hasGooglePlaceIdColumn,
}: {
    supabase: SupabaseClient;
    spot: LocationBackfillRow;
    apiKey: string;
    args: Args;
    hasGooglePlaceIdColumn: boolean;
}): Promise<LocationBackfillResult> {
    const name = getLocalizedFieldValue(spot.name);
    const address = getLocalizedFieldValue(spot.address);
    const base = {
        id: spot.id,
        name,
        address,
        hasGooglePlaceIdColumn,
    };

    if (!name || !address) {
        return {
            ...base,
            status: "skipped",
            reason: "missing_name_or_address",
        };
    }

    try {
        const match = await findBestGooglePlaceMatch(name, address, spot.category, apiKey, {
            timeoutMs: args.timeoutMs,
        });
        const place = match.place;

        if (!place) {
            return {
                ...base,
                status: "skipped",
                reason: `low_confidence:${match.rejectedQuality?.reason || "no_match"}`,
                query: match.query,
                rejected: {
                    reason: match.rejectedQuality?.reason,
                    placeId: match.rejectedPlace?.placeId || null,
                    placeName: match.rejectedPlace?.displayName || null,
                    formattedAddress: match.rejectedPlace?.formattedAddress || null,
                    photoCount: match.rejectedPlace?.photos.length || 0,
                    nameScore: match.rejectedQuality?.nameScore,
                    addressScore: match.rejectedQuality?.addressScore,
                },
            };
        }

        if (!place.formattedAddress || !place.location) {
            return {
                ...base,
                status: "skipped",
                reason: "matched_place_missing_address_or_location",
                query: match.query,
                placeId: place.placeId,
                placeName: place.displayName,
                formattedAddress: place.formattedAddress,
                photoCount: place.photos.length,
                quality: toQuality(match.quality),
            };
        }

        const lat = place.location.latitude;
        const lng = place.location.longitude;
        const currentCoordinates = parseSpotCoordinates(spot.location);
        const currentConfidence = getSpotLocationConfidence({
            address,
            lat: currentCoordinates?.lat,
            lng: currentCoordinates?.lng,
        });
        const nextConfidence = getSpotLocationConfidence({
            address: place.formattedAddress,
            lat,
            lng,
        });
        const photoUrls = buildSpotPhotoUrls(place.photos);
        const photoNeeds = getSpotPhotoBackfillNeeds(spot.photos, spot.google_place_id, {
            upgradeToPlacePhotos: args.includePhotos,
        });
        const shouldUpdateLocation =
            (!currentConfidence.exactAddress && nextConfidence.exactAddress) ||
            !currentConfidence.usableCoordinates ||
            coordinatesChanged(currentCoordinates, lat, lng);
        const shouldSavePlaceId = hasGooglePlaceIdColumn && !spot.google_place_id?.trim();
        const shouldReplacePhotos =
            args.includePhotos &&
            photoUrls.length > 0 &&
            (photoNeeds.needsPhotoBackfill ||
                photoNeeds.hasIdentityMismatch ||
                photoNeeds.needsPlacePhotoUpgrade);
        const updatePayload: {
            address?: Record<string, string>;
            location?: string;
            google_place_id?: string | null;
            photos?: string[];
        } = {};

        if (shouldUpdateLocation) {
            updatePayload.address = normalizeAddressField(spot.address, place.formattedAddress);
            updatePayload.location = formatPoint(lng, lat);
        }

        if (shouldSavePlaceId) {
            updatePayload.google_place_id = place.placeId || null;
        }

        if (shouldReplacePhotos) {
            updatePayload.photos = photoUrls;
        }

        const updatedFields = Object.keys(updatePayload);
        if (updatedFields.length === 0) {
            return {
                ...base,
                status: "skipped",
                reason: "matched_place_does_not_improve_address_location_or_photos",
                query: match.query,
                placeId: place.placeId,
                placeName: place.displayName,
                formattedAddress: place.formattedAddress,
                lat,
                lng,
                photoCount: photoUrls.length,
                quality: toQuality(match.quality),
            };
        }

        if (args.apply) {
            const { error } = await supabase
                .from("spots")
                .update(updatePayload)
                .eq("id", spot.id);

            if (error) {
                return {
                    ...base,
                    status: "failed",
                    reason: error.message,
                    query: match.query,
                    placeId: place.placeId,
                    placeName: place.displayName,
                    formattedAddress: place.formattedAddress,
                    lat,
                    lng,
                    photoCount: photoUrls.length,
                    updatedFields,
                    quality: toQuality(match.quality),
                };
            }
        }

        return {
            ...base,
            status: args.apply ? "updated" : "would_update",
            query: match.query,
            placeId: place.placeId,
            placeName: place.displayName,
            formattedAddress: place.formattedAddress,
            lat,
            lng,
            photoCount: photoUrls.length,
            updatedFields,
            quality: toQuality(match.quality),
        };
    } catch (error) {
        return {
            ...base,
            status: "failed",
            reason: error instanceof Error ? error.message : "unknown_error",
        };
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    dotenv.config({ path: args.envFile, quiet: true });
    const { url, key } = getSupabaseCredentials();
    const apiKey = getGooglePlacesApiKey();

    if (!apiKey) {
        throw new Error("Missing GOOGLE_PLACES_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
    }

    const supabase = createClient(url, key);
    const startedAt = new Date().toISOString();
    const { candidates, scanned, hasGooglePlaceIdColumn } = await fetchRows(supabase, args);
    const results: LocationBackfillResult[] = [];
    let successfulCandidates = 0;

    for (const spot of candidates) {
        if (successfulCandidates >= args.limit) break;

        const result = await processSpot({
            supabase,
            spot,
            apiKey,
            args,
            hasGooglePlaceIdColumn,
        });
        results.push(result);

        if (result.status === "would_update" || result.status === "updated") {
            successfulCandidates++;
        }

        await sleep(150);
    }

    const report = {
        startedAt,
        finishedAt: new Date().toISOString(),
        dryRun: !args.apply,
        includePhotos: args.includePhotos,
        city: args.city || null,
        spotId: args.spotId || null,
        spotIds: args.spotIds.length > 0 ? args.spotIds : null,
        hasGooglePlaceIdColumn,
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
