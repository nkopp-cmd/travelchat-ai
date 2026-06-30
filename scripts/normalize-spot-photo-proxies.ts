/**
 * Normalize stored spot photo URLs so Google Places photos always go through
 * Localley's proxy endpoint instead of direct Google URLs.
 *
 * Usage:
 *   npx tsx scripts/normalize-spot-photo-proxies.ts
 *   npx tsx scripts/normalize-spot-photo-proxies.ts --apply
 *   npx tsx scripts/normalize-spot-photo-proxies.ts --city=Tokyo --out=reports/spot-photo-proxy-normalization.json
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
    classifySpotPhoto,
    getLocalizedFieldValue,
    normalizeStoredSpotPhotoUrls,
    SpotPhotoBackfillRow,
} from "../lib/place-images";

dotenv.config({ path: ".env.local" });

const PAGE_SIZE = 1000;
const DEFAULT_OUT_PATH = "reports/spot-photo-proxy-normalization.json";

interface Args {
    apply: boolean;
    city?: string;
    outPath: string;
}

interface NormalizationResult {
    id: string;
    name: string;
    address: string;
    status: "updated" | "would_update" | "unchanged" | "failed";
    directGoogleBefore: number;
    proxyAfter: number;
    photoCount: number;
    reason?: string;
}

interface SpotPhotoRow extends SpotPhotoBackfillRow {
    created_at?: string | null;
}

function parseArgs(argv: string[]): Args {
    const getValue = (name: string) => {
        const arg = argv.find((value) => value.startsWith(`${name}=`));
        return arg ? arg.slice(name.length + 1).trim() : undefined;
    };

    return {
        apply: argv.includes("--apply"),
        city: getValue("--city"),
        outPath: getValue("--out") || DEFAULT_OUT_PATH,
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

async function fetchAllSpots(
    supabase: SupabaseClient,
    city: string | undefined
): Promise<SpotPhotoRow[]> {
    const rows: SpotPhotoRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select("id, name, address, photos, category, created_at")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch spots: ${error.message}`);

        rows.push(...((data || []) as SpotPhotoRow[]));
        if (!data || data.length < PAGE_SIZE) break;
    }

    return rows;
}

function countKind(photos: string[] | null | undefined, kind: ReturnType<typeof classifySpotPhoto>) {
    return (photos || []).filter((photo) => classifySpotPhoto(photo) === kind).length;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { url, key } = getSupabaseCredentials();
    const supabase = createClient(url, key);
    const startedAt = new Date().toISOString();
    const spots = await fetchAllSpots(supabase, args.city);
    const results: NormalizationResult[] = [];

    for (const spot of spots) {
        const originalPhotos = spot.photos || [];
        const normalizedPhotos = normalizeStoredSpotPhotoUrls(originalPhotos);
        const changed = JSON.stringify(originalPhotos) !== JSON.stringify(normalizedPhotos);
        const directGoogleBefore = countKind(originalPhotos, "direct_google");
        const proxyAfter = countKind(normalizedPhotos, "proxy");

        if (!changed) {
            continue;
        }

        const base = {
            id: spot.id,
            name: getLocalizedFieldValue(spot.name),
            address: getLocalizedFieldValue(spot.address),
            directGoogleBefore,
            proxyAfter,
            photoCount: normalizedPhotos.length,
        };

        if (args.apply) {
            const { error } = await supabase
                .from("spots")
                .update({ photos: normalizedPhotos })
                .eq("id", spot.id);

            results.push({
                ...base,
                status: error ? "failed" : "updated",
                reason: error?.message,
            });
        } else {
            results.push({
                ...base,
                status: "would_update",
            });
        }
    }

    const report = {
        startedAt,
        finishedAt: new Date().toISOString(),
        dryRun: !args.apply,
        city: args.city || null,
        scanned: spots.length,
        changed: results.length,
        updated: results.filter((result) => result.status === "updated").length,
        wouldUpdate: results.filter((result) => result.status === "would_update").length,
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
