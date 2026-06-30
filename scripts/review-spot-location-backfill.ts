/**
 * Review and optionally apply conservative coordinate backfills for weak spots.
 *
 * Usage:
 *   npx tsx scripts/review-spot-location-backfill.ts --limit=20
 *   npx tsx scripts/review-spot-location-backfill.ts --city=Tokyo --limit=10
 *   npx tsx scripts/review-spot-location-backfill.ts --apply --limit=10
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { inferCityFromAddress, type CityConfig } from "../lib/cities";
import { distanceKm, geocodeWithCascade, type GeocodingResult } from "../lib/geocoding";
import { getLocalizedFieldValue } from "../lib/place-images";
import {
    getSpotLocationConfidence,
    hasUsableCoordinates,
} from "../lib/spots/location-confidence";
import { parseSpotCoordinates } from "../lib/spots/coordinates";
import type { MultiLanguageField } from "../types";

dotenv.config({ path: ".env.local" });

const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_CANDIDATES = 250;
const DEFAULT_OUT_PATH = "reports/spot-location-backfill-review.json";
const DEFAULT_RATE_LIMIT_MS = 250;
const MIN_CONFIDENT_DISTANCE_FROM_CITY_CENTER_KM = 0.25;
const MAX_CONFIDENT_DISTANCE_KM = 75;
const BROAD_NAME_PATTERN = /\b(day trip|islands?|countryside|residential|town|street|road|area|district|neighbou?rhood|market crawl|bar crawl|walking route|walk|trail|tour|farms?|villages?|various|multiple)\b/i;
const BROAD_ADDRESS_PATTERN = /\b(various locations|multiple locations|around|near|area|areas|district|neighbou?rhood|countryside|region|zone)\b/i;
const SPECIFIC_PLACE_PATTERN = /\b(hotel|garden|theater|theatre|stadium|cafe|coffee|restaurant|bar|book|books|museum|gallery|temple|shrine|aquarium|market|mall|center|centre|house|farm|park|bridge|station)\b/i;

type ReviewStatus = "updated" | "would_update" | "skipped" | "failed";

interface Args {
    apply: boolean;
    city?: string;
    limit: number;
    maxCandidates: number;
    outPath: string;
    rateLimitMs: number;
}

interface RawSpot {
    id: string;
    name: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    location: unknown;
    created_at?: string | null;
}

interface CandidateSpot {
    raw: RawSpot;
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
    confidence: ReturnType<typeof getSpotLocationConfidence>;
    city: CityConfig | null;
}

interface ReviewResult {
    id: string;
    name: string;
    address: string;
    category: string | null;
    inferredCity: string | null;
    status: ReviewStatus;
    reason?: string;
    previousLocation: {
        lat: number | null;
        lng: number | null;
    };
    candidate?: {
        lat: number;
        lng: number;
        provider: GeocodingResult["provider"];
        distanceFromCityKm: number | null;
        wkt: string;
    };
    confidenceReasons: string[];
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
        rateLimitMs: parsePositiveInt(getValue("--rate-limit-ms"), DEFAULT_RATE_LIMIT_MS),
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

function toWktPoint(result: GeocodingResult): string {
    return `POINT(${Number(result.lng.toFixed(6))} ${Number(result.lat.toFixed(6))})`;
}

function getDistanceFromCity(result: GeocodingResult, city: CityConfig | null): number | null {
    if (!city) return null;
    return Number(
        distanceKm(result.lat, result.lng, city.center.lat, city.center.lng).toFixed(1)
    );
}

function isUnsafeBroadPlace(name: string, address: string): boolean {
    const broadName = BROAD_NAME_PATTERN.test(name);
    const broadAddress = BROAD_ADDRESS_PATTERN.test(address);
    const looksSpecific = SPECIFIC_PLACE_PATTERN.test(name);

    return broadAddress || (broadName && !looksSpecific);
}

function getSkipReason(candidate: CandidateSpot): string | null {
    if (!candidate.name || !candidate.address) return "missing_name_or_address";
    if (!candidate.city) return "unsupported_or_unrecognized_city";
    if (hasUsableCoordinates(candidate.lat, candidate.lng)) return "already_has_usable_coordinates";
    if (!candidate.confidence.reasons.includes("area_level_address")) {
        return "not_area_level_address_candidate";
    }
    if (isUnsafeBroadPlace(candidate.name, candidate.address)) return "broad_or_ambiguous_place";
    return null;
}

async function fetchCandidates(
    supabase: SupabaseClient,
    city: string | undefined,
    maxCandidates: number
): Promise<{ candidates: CandidateSpot[]; scanned: number }> {
    const candidates: CandidateSpot[] = [];
    let scanned = 0;

    for (let from = 0; candidates.length < maxCandidates; from += PAGE_SIZE) {
        let query = supabase
            .from("spots")
            .select("id, name, address, category, location, created_at")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (city) {
            query = query.ilike("address->>en", `%${city}%`);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch spots: ${error.message}`);

        const rows = (data || []) as RawSpot[];
        scanned += rows.length;

        for (const row of rows) {
            const name = getLocalizedFieldValue(row.name);
            const address = getLocalizedFieldValue(row.address);
            const coordinates = parseSpotCoordinates(row.location);
            const lat = coordinates?.lat ?? null;
            const lng = coordinates?.lng ?? null;
            const confidence = getSpotLocationConfidence({ address, lat, lng });

            if (confidence.tone !== "area") continue;

            candidates.push({
                raw: row,
                name,
                address,
                lat,
                lng,
                confidence,
                city: inferCityFromAddress(address) || null,
            });

            if (candidates.length >= maxCandidates) break;
        }

        if (rows.length < PAGE_SIZE) break;
    }

    return { candidates, scanned };
}

function baseResult(candidate: CandidateSpot, status: ReviewStatus): ReviewResult {
    return {
        id: candidate.raw.id,
        name: candidate.name,
        address: candidate.address,
        category: candidate.raw.category || null,
        inferredCity: candidate.city?.name || null,
        status,
        previousLocation: {
            lat: candidate.lat,
            lng: candidate.lng,
        },
        confidenceReasons: candidate.confidence.reasons,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { url, key } = getSupabaseCredentials();
    const supabase = createClient(url, key);
    const startedAt = new Date().toISOString();
    const { candidates, scanned } = await fetchCandidates(
        supabase,
        args.city,
        args.maxCandidates
    );
    const results: ReviewResult[] = [];
    let actionableCandidates = 0;

    for (const candidate of candidates) {
        if (actionableCandidates >= args.limit) break;

        const skipReason = getSkipReason(candidate);
        if (skipReason) {
            results.push({
                ...baseResult(candidate, "skipped"),
                reason: skipReason,
            });
            continue;
        }

        const city = candidate.city;
        if (!city) {
            results.push({
                ...baseResult(candidate, "skipped"),
                reason: "unsupported_or_unrecognized_city",
            });
            continue;
        }

        try {
            const geocoded = await geocodeWithCascade(candidate.address, city.name, candidate.name);

            if (!geocoded) {
                results.push({
                    ...baseResult(candidate, "skipped"),
                    reason: "geocode_not_found",
                });
                await sleep(args.rateLimitMs);
                continue;
            }

            const distanceFromCityKm = getDistanceFromCity(geocoded, city);
            if (
                distanceFromCityKm !== null &&
                distanceFromCityKm < MIN_CONFIDENT_DISTANCE_FROM_CITY_CENTER_KM
            ) {
                results.push({
                    ...baseResult(candidate, "skipped"),
                    reason: "geocode_city_center_fallback",
                    candidate: {
                        ...geocoded,
                        distanceFromCityKm,
                        wkt: toWktPoint(geocoded),
                    },
                });
                await sleep(args.rateLimitMs);
                continue;
            }

            if (distanceFromCityKm !== null && distanceFromCityKm > MAX_CONFIDENT_DISTANCE_KM) {
                results.push({
                    ...baseResult(candidate, "skipped"),
                    reason: "geocode_too_far_from_city",
                    candidate: {
                        ...geocoded,
                        distanceFromCityKm,
                        wkt: toWktPoint(geocoded),
                    },
                });
                await sleep(args.rateLimitMs);
                continue;
            }

            if (args.apply) {
                const { error } = await supabase
                    .from("spots")
                    .update({ location: toWktPoint(geocoded) })
                    .eq("id", candidate.raw.id);

                if (error) {
                    results.push({
                        ...baseResult(candidate, "failed"),
                        reason: error.message,
                    });
                    await sleep(args.rateLimitMs);
                    continue;
                }
            }

            results.push({
                ...baseResult(candidate, args.apply ? "updated" : "would_update"),
                reason: args.apply ? "applied_coordinate_backfill" : "dry_run_coordinate_backfill",
                candidate: {
                    ...geocoded,
                    distanceFromCityKm,
                    wkt: toWktPoint(geocoded),
                },
            });
            actionableCandidates++;
        } catch (error) {
            results.push({
                ...baseResult(candidate, "failed"),
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }

        await sleep(args.rateLimitMs);
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
