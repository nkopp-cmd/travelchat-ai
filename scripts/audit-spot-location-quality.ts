/**
 * Audit spot address and coordinate quality for direction confidence.
 *
 * Usage:
 *   npx tsx scripts/audit-spot-location-quality.ts
 *   npx tsx scripts/audit-spot-location-quality.ts --city=Seoul --json
 *   npx tsx scripts/audit-spot-location-quality.ts --out=reports/spot-location-quality.json
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { getLocalizedFieldValue, summarizeSpotPhotos } from "../lib/place-images";
import {
    getSpotLocationConfidence,
    hasUsableCoordinates,
} from "../lib/spots/location-confidence";
import { parseSpotCoordinates } from "../lib/spots/coordinates";
import type { MultiLanguageField } from "../types";

dotenv.config({ path: ".env.local" });

const PAGE_SIZE = 1000;
const DEFAULT_OUT_PATH = "reports/spot-location-quality.json";
const DEFAULT_SAMPLE_LIMIT = 80;

interface Args {
    city?: string;
    json: boolean;
    outPath: string;
    sampleLimit: number;
}

interface RawSpot {
    id: string;
    name: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    location: unknown;
    photos: string[] | null;
    created_at?: string | null;
}

interface QualityBucket {
    total: number;
    exactAddress: number;
    areaLevelAddress: number;
    usableCoordinates: number;
    weakDirections: number;
    missingAddress: number;
    realPhotoSpots: number;
}

interface WeakLocationSample {
    id: string;
    name: string;
    address: string;
    category: string | null;
    location: string;
    lat: number | null;
    lng: number | null;
    reasons: string[];
    hasRealPhoto: boolean;
    photoCount: number;
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
        city: getValue("--city"),
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

function createBucket(): QualityBucket {
    return {
        total: 0,
        exactAddress: 0,
        areaLevelAddress: 0,
        usableCoordinates: 0,
        weakDirections: 0,
        missingAddress: 0,
        realPhotoSpots: 0,
    };
}

function addToBucket(
    bucket: QualityBucket,
    confidence: ReturnType<typeof getSpotLocationConfidence>,
    hasRealPhoto: boolean
) {
    bucket.total++;
    if (confidence.exactAddress) bucket.exactAddress++;
    if (!confidence.exactAddress) bucket.areaLevelAddress++;
    if (confidence.usableCoordinates) bucket.usableCoordinates++;
    if (!confidence.exactAddress && !confidence.usableCoordinates) bucket.weakDirections++;
    if (confidence.reasons.includes("missing_address")) bucket.missingAddress++;
    if (hasRealPhoto) bucket.realPhotoSpots++;
}

function percent(value: number, total: number): number {
    if (total === 0) return 0;
    return Number(((value / total) * 100).toFixed(1));
}

function extractLocationLabel(address: string): string {
    const parts = address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0] || "Unknown";
}

function addPercentages(bucket: QualityBucket) {
    return {
        ...bucket,
        exactAddressPct: percent(bucket.exactAddress, bucket.total),
        usableCoordinatesPct: percent(bucket.usableCoordinates, bucket.total),
        weakDirectionsPct: percent(bucket.weakDirections, bucket.total),
        realPhotoPct: percent(bucket.realPhotoSpots, bucket.total),
    };
}

function sortBuckets(buckets: Record<string, QualityBucket>) {
    return Object.fromEntries(
        Object.entries(buckets)
            .sort(([, left], [, right]) => {
                if (right.weakDirections !== left.weakDirections) {
                    return right.weakDirections - left.weakDirections;
                }

                return right.total - left.total;
            })
            .map(([key, bucket]) => [key, addPercentages(bucket)])
    );
}

async function fetchAllSpots(
    supabase: SupabaseClient,
    city: string | undefined
): Promise<RawSpot[]> {
    const rows: RawSpot[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select("id, name, address, category, location, photos, created_at")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch spots: ${error.message}`);

        rows.push(...((data || []) as RawSpot[]));
        if (!data || data.length < PAGE_SIZE) break;
    }

    return rows;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { url, key } = getSupabaseCredentials();
    const supabase = createClient(url, key);
    const generatedAt = new Date().toISOString();
    const spots = await fetchAllSpots(supabase, args.city);
    const summary = createBucket();
    const byLocation: Record<string, QualityBucket> = {};
    const byCategory: Record<string, QualityBucket> = {};
    const weakLocationSamples: WeakLocationSample[] = [];

    for (const spot of spots) {
        const name = getLocalizedFieldValue(spot.name);
        const address = getLocalizedFieldValue(spot.address);
        const coordinates = parseSpotCoordinates(spot.location);
        const lat = coordinates?.lat ?? null;
        const lng = coordinates?.lng ?? null;
        const confidence = getSpotLocationConfidence({ address, lat, lng });
        const photoSummary = summarizeSpotPhotos(spot.photos);
        const category = spot.category || "Uncategorized";
        const location = extractLocationLabel(address);

        addToBucket(summary, confidence, photoSummary.hasRealPhoto);
        byLocation[location] ||= createBucket();
        byCategory[category] ||= createBucket();
        addToBucket(byLocation[location], confidence, photoSummary.hasRealPhoto);
        addToBucket(byCategory[category], confidence, photoSummary.hasRealPhoto);

        if (
            (!confidence.exactAddress && !hasUsableCoordinates(lat, lng)) &&
            weakLocationSamples.length < args.sampleLimit
        ) {
            weakLocationSamples.push({
                id: spot.id,
                name,
                address,
                category: spot.category || null,
                location,
                lat,
                lng,
                reasons: confidence.reasons,
                hasRealPhoto: photoSummary.hasRealPhoto,
                photoCount: photoSummary.total,
            });
        }
    }

    const report = {
        generatedAt,
        filters: {
            city: args.city || null,
        },
        summary: addPercentages(summary),
        byLocation: sortBuckets(byLocation),
        byCategory: sortBuckets(byCategory),
        weakLocationSamples,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(
        [
            `Spot location quality audit written to ${args.outPath}`,
            `Spots: ${summary.total}`,
            `Exact-address coverage: ${report.summary.exactAddressPct}% (${summary.exactAddress}/${summary.total})`,
            `Usable-coordinate coverage: ${report.summary.usableCoordinatesPct}% (${summary.usableCoordinates}/${summary.total})`,
            `Weak direction records: ${summary.weakDirections}`,
            `Weak samples: ${weakLocationSamples.length}`,
        ].join("\n")
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
