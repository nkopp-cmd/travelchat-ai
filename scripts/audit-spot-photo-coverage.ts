/**
 * Audit how many spots have real, production-safe images.
 *
 * Usage:
 *   npx tsx scripts/audit-spot-photo-coverage.ts
 *   npx tsx scripts/audit-spot-photo-coverage.ts --env-file=/tmp/localley.env
 *   npx tsx scripts/audit-spot-photo-coverage.ts --city=Seoul
 *   npx tsx scripts/audit-spot-photo-coverage.ts --out=reports/spot-photo-coverage.json --json
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
    getLocalizedFieldValue,
    getSpotPlacePhotoIdentityStatus,
    needsSpotPlaceIdentityBackfill,
    SpotPhotoBackfillRow,
    SpotPhotoKind,
    summarizeSpotPhotos,
} from "../lib/place-images";

const PAGE_SIZE = 1000;
const DEFAULT_OUT_PATH = "reports/spot-photo-coverage.json";
const DEFAULT_SAMPLE_LIMIT = 50;

interface SpotPhotoAuditArgs {
    city?: string;
    envFile: string;
    json: boolean;
    outPath: string;
    sampleLimit: number;
}

interface SpotPhotoAuditRow extends SpotPhotoBackfillRow {
    created_at?: string | null;
}

interface CoverageBucket {
    total: number;
    realPhotoSpots: number;
    needsBackfill: number;
    placeIdentitySpots: number;
    needsPlaceIdentityBackfill: number;
    googlePlacePhotoSpots: number;
    ownPlacePhotoSpots: number;
    ownPlaceReadySpots: number;
    placePhotoIdentityMismatches: number;
    anyPhotoSpots: number;
    noPhotoSpots: number;
}

interface BackfillCandidateSample {
    id: string;
    name: string;
    address: string;
    category: string | null;
    location: string;
    reason: string;
    needsPhotoBackfill: boolean;
    needsPlaceIdBackfill: boolean;
    placePhotoIdentity: ReturnType<typeof getSpotPlacePhotoIdentityStatus>;
    photoCount: number;
    primaryKind: SpotPhotoKind | "none";
    kinds: Record<SpotPhotoKind, number>;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function parseArgs(argv: string[]): SpotPhotoAuditArgs {
    const getValue = (name: string) => {
        const arg = argv.find((value) => value.startsWith(`${name}=`));
        return arg ? arg.slice(name.length + 1).trim() : undefined;
    };

    return {
        city: getValue("--city"),
        envFile: getValue("--env-file") || ".env.local",
        json: argv.includes("--json"),
        outPath: getValue("--out") || DEFAULT_OUT_PATH,
        sampleLimit: parsePositiveInt(getValue("--sample-limit"), DEFAULT_SAMPLE_LIMIT),
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

function createBucket(): CoverageBucket {
    return {
        total: 0,
        realPhotoSpots: 0,
        needsBackfill: 0,
        placeIdentitySpots: 0,
        needsPlaceIdentityBackfill: 0,
        googlePlacePhotoSpots: 0,
        ownPlacePhotoSpots: 0,
        ownPlaceReadySpots: 0,
        placePhotoIdentityMismatches: 0,
        anyPhotoSpots: 0,
        noPhotoSpots: 0,
    };
}

function addToBucket(
    bucket: CoverageBucket,
    hasAnyPhoto: boolean,
    hasRealPhoto: boolean,
    hasPlaceIdentity: boolean,
    placePhotoIdentity: ReturnType<typeof getSpotPlacePhotoIdentityStatus>
) {
    bucket.total++;
    if (hasAnyPhoto) bucket.anyPhotoSpots++;
    if (!hasAnyPhoto) bucket.noPhotoSpots++;
    if (hasRealPhoto) bucket.realPhotoSpots++;
    if (!hasRealPhoto) bucket.needsBackfill++;
    if (hasPlaceIdentity) bucket.placeIdentitySpots++;
    if (!hasPlaceIdentity) bucket.needsPlaceIdentityBackfill++;
    if (placePhotoIdentity.hasGooglePlacePhoto) bucket.googlePlacePhotoSpots++;
    if (placePhotoIdentity.hasOwnPlacePhoto) bucket.ownPlacePhotoSpots++;
    if (placePhotoIdentity.ready) bucket.ownPlaceReadySpots++;
    if (placePhotoIdentity.hasIdentityMismatch) bucket.placePhotoIdentityMismatches++;
}

function createKindCounts(): Record<SpotPhotoKind, number> {
    return {
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
}

function extractLocationLabel(address: string): string {
    const parts = address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0] || "Unknown";
}

function getBackfillReason(summary: ReturnType<typeof summarizeSpotPhotos>): string {
    if (summary.total === 0 || !summary.hasAnyPhoto) return "no_photos";
    if (summary.kinds.placeholder > 0) return "placeholder_only_or_primary";
    if (summary.kinds.unsplash > 0) return "unsplash_fallback";
    if (summary.kinds.remote_untrusted > 0) return "untrusted_remote_photo";
    if (summary.kinds.direct_google > 0) return "direct_google_url";
    if (summary.kinds.invalid > 0 || summary.kinds.empty > 0) return "invalid_or_empty_photo";
    return "no_real_photo_source";
}

function percent(value: number, total: number): number {
    if (total === 0) return 0;
    return Number(((value / total) * 100).toFixed(1));
}

function sortBucketEntries(buckets: Record<string, CoverageBucket>) {
    return Object.fromEntries(
        Object.entries(buckets).sort(([, left], [, right]) => {
            if (right.needsBackfill !== left.needsBackfill) {
                return right.needsBackfill - left.needsBackfill;
            }

            return right.total - left.total;
        })
    );
}

async function fetchAllSpots(
    supabase: SupabaseClient,
    city: string | undefined
): Promise<{ rows: SpotPhotoAuditRow[]; hasGooglePlaceIdColumn: boolean }> {
    const rows: SpotPhotoAuditRow[] = [];
    let hasGooglePlaceIdColumn = true;

    for (let from = 0; ; from += PAGE_SIZE) {
        const selectColumns = hasGooglePlaceIdColumn
            ? "id, name, address, photos, category, google_place_id, created_at"
            : "id, name, address, photos, category, created_at";
        let query = supabase
            .from("spots")
            .select(selectColumns)
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

        rows.push(...(((data || []) as unknown) as SpotPhotoAuditRow[]));
        if (!data || data.length < PAGE_SIZE) break;
    }

    return { rows, hasGooglePlaceIdColumn };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    dotenv.config({ path: args.envFile, quiet: true });
    const { url, key } = getSupabaseCredentials();
    const supabase = createClient(url, key);
    const generatedAt = new Date().toISOString();
    const { rows: spots, hasGooglePlaceIdColumn } = await fetchAllSpots(supabase, args.city);
    const summary = createBucket();
    const byLocation: Record<string, CoverageBucket> = {};
    const byCategory: Record<string, CoverageBucket> = {};
    const photoKinds = createKindCounts();
    const backfillCandidates: BackfillCandidateSample[] = [];

    for (const spot of spots) {
        const name = getLocalizedFieldValue(spot.name);
        const address = getLocalizedFieldValue(spot.address);
        const category = spot.category || "Uncategorized";
        const location = extractLocationLabel(address);
        const photoSummary = summarizeSpotPhotos(spot.photos);
        const placePhotoIdentity = getSpotPlacePhotoIdentityStatus(
            spot.photos,
            spot.google_place_id
        );
        const needsPlaceIdBackfill = needsSpotPlaceIdentityBackfill(
            spot.photos,
            spot.google_place_id
        );
        const hasPlaceIdentity = !needsPlaceIdBackfill;

        addToBucket(summary, photoSummary.hasAnyPhoto, photoSummary.hasRealPhoto, hasPlaceIdentity, placePhotoIdentity);
        byLocation[location] ||= createBucket();
        byCategory[category] ||= createBucket();
        addToBucket(byLocation[location], photoSummary.hasAnyPhoto, photoSummary.hasRealPhoto, hasPlaceIdentity, placePhotoIdentity);
        addToBucket(byCategory[category], photoSummary.hasAnyPhoto, photoSummary.hasRealPhoto, hasPlaceIdentity, placePhotoIdentity);

        for (const [kind, count] of Object.entries(photoSummary.kinds)) {
            photoKinds[kind as SpotPhotoKind] += count;
        }

        if (
            (photoSummary.needsBackfill || needsPlaceIdBackfill) &&
            backfillCandidates.length < args.sampleLimit
        ) {
            backfillCandidates.push({
                id: spot.id,
                name,
                address,
                category: spot.category || null,
                location,
                reason: [
                    photoSummary.needsBackfill ? getBackfillReason(photoSummary) : null,
                    needsPlaceIdBackfill ? "missing_google_place_id" : null,
                ].filter(Boolean).join("+"),
                needsPhotoBackfill: photoSummary.needsBackfill,
                needsPlaceIdBackfill,
                placePhotoIdentity,
                photoCount: photoSummary.total,
                primaryKind: photoSummary.primaryKind,
                kinds: photoSummary.kinds,
            });
        }
    }

    const report = {
        generatedAt,
        filters: {
            city: args.city || null,
        },
        schema: {
            hasGooglePlaceIdColumn,
        },
        summary: {
            ...summary,
            realPhotoCoveragePct: percent(summary.realPhotoSpots, summary.total),
            backfillNeededPct: percent(summary.needsBackfill, summary.total),
            placeIdentityCoveragePct: percent(summary.placeIdentitySpots, summary.total),
            placeIdentityBackfillNeededPct: percent(summary.needsPlaceIdentityBackfill, summary.total),
            ownPlacePhotoCoveragePct: percent(summary.ownPlacePhotoSpots, summary.total),
            ownPlaceReadyPct: percent(summary.ownPlaceReadySpots, summary.total),
        },
        photoKinds,
        byLocation: sortBucketEntries(byLocation),
        byCategory: sortBucketEntries(byCategory),
        backfillCandidates,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(
        [
            `Spot photo coverage audit written to ${args.outPath}`,
            `Google Place ID column: ${hasGooglePlaceIdColumn ? "present" : "missing"}`,
            `Spots: ${summary.total}`,
            `Real-photo coverage: ${report.summary.realPhotoCoveragePct}% (${summary.realPhotoSpots}/${summary.total})`,
            `Own Google Place photo coverage: ${report.summary.ownPlacePhotoCoveragePct}% (${summary.ownPlacePhotoSpots}/${summary.total})`,
            `Own place image + stored ID ready: ${report.summary.ownPlaceReadyPct}% (${summary.ownPlaceReadySpots}/${summary.total})`,
            `Place identity coverage: ${report.summary.placeIdentityCoveragePct}% (${summary.placeIdentitySpots}/${summary.total})`,
            `Place photo identity mismatches: ${summary.placePhotoIdentityMismatches}`,
            `Needs backfill: ${summary.needsBackfill}`,
            `Needs place identity backfill: ${summary.needsPlaceIdentityBackfill}`,
            `No photos: ${summary.noPhotoSpots}`,
            `Backfill samples: ${backfillCandidates.length}`,
        ].join("\n")
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
