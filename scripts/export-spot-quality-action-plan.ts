/**
 * Export a prioritized, read-only action plan for spot image/location/place-id cleanup.
 *
 * Usage:
 *   npx tsx scripts/export-spot-quality-action-plan.ts
 *   npx tsx scripts/export-spot-quality-action-plan.ts --city=Tokyo --limit=120
 *   npx tsx scripts/export-spot-quality-action-plan.ts --out=reports/spot-quality-action-plan.json --csv=reports/spot-quality-action-plan.csv
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
    summarizeSpotQualityItems,
    toSpotQualityItem,
    type SpotQualityIssue,
    type SpotQualityItem,
    type SpotQualityRow,
} from "../lib/admin/spot-quality";
import { buildSpotQualityItemResearchLinks } from "../lib/admin/spot-quality-research";

dotenv.config({ path: ".env.local", quiet: true });

const PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 250;
const DEFAULT_OUT_PATH = "reports/spot-quality-action-plan.json";
const DEFAULT_CSV_PATH = "reports/spot-quality-action-plan.csv";

interface Args {
    city?: string;
    limit: number;
    outPath: string;
    csvPath: string;
    json: boolean;
}

interface ActionPlanItem extends SpotQualityItem {
    priority: number;
    recommendedAction: string;
    researchQuery: string;
    researchFocus: string;
    mapsResearchUrl: string;
    imageResearchUrl: string;
    placeIdGuideUrl: string;
    adminUrl: string;
    publicUrl: string;
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
        limit: parsePositiveInt(getValue("--limit"), DEFAULT_LIMIT),
        outPath: getValue("--out") || DEFAULT_OUT_PATH,
        csvPath: getValue("--csv") || DEFAULT_CSV_PATH,
        json: argv.includes("--json"),
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

async function fetchRows(
    supabase: SupabaseClient,
    city: string | undefined
): Promise<{ rows: SpotQualityRow[]; hasGooglePlaceIdColumn: boolean }> {
    const rows: SpotQualityRow[] = [];
    let hasGooglePlaceIdColumn = true;

    for (let from = 0; ; from += PAGE_SIZE) {
        const columns = hasGooglePlaceIdColumn
            ? "id, name, address, description, photos, category, location, google_place_id, created_at"
            : "id, name, address, description, photos, category, location, created_at";
        let query = supabase
            .from("spots")
            .select(columns)
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

        rows.push(...(((data || []) as unknown) as SpotQualityRow[]));
        if (!data || data.length < PAGE_SIZE) break;
    }

    return { rows, hasGooglePlaceIdColumn };
}

function scoreIssue(issue: SpotQualityIssue): number {
    switch (issue) {
        case "missing_real_photo":
            return 100;
        case "inexact_location":
            return 90;
        case "missing_place_id":
            return 70;
        case "broad_place_name":
            return 60;
        case "missing_name":
            return 60;
        default:
            return 10;
    }
}

function getPriority(item: SpotQualityItem): number {
    const issueScore = item.issues.reduce((sum, issue) => sum + scoreIssue(issue), 0);
    const realPhotoBoost = item.photoSummary.hasRealPhoto ? 0 : 20;
    const locationBoost = item.locationConfidence.usableCoordinates ? 0 : 15;
    return issueScore + realPhotoBoost + locationBoost;
}

function getRecommendedAction(item: SpotQualityItem, hasGooglePlaceIdColumn: boolean): string {
    if (item.issues.includes("missing_real_photo") && item.issues.includes("inexact_location")) {
        return "manual_exact_place_research_with_photo_and_coordinates";
    }
    if (item.issues.includes("missing_real_photo")) return "add_reviewed_real_spot_photo";
    if (item.issues.includes("inexact_location")) return "add_exact_address_and_coordinates";
    if (item.issues.includes("missing_place_id")) return "save_google_place_id";
    if (item.issues.includes("broad_place_name") || item.issues.includes("missing_name")) {
        return "rename_or_remove_broad_spot";
    }
    if (!hasGooglePlaceIdColumn) return "apply_google_place_id_migration_before_identity_backfill";
    return "review";
}

function toActionPlanItem(
    item: SpotQualityItem,
    hasGooglePlaceIdColumn: boolean,
    baseUrl: string
): ActionPlanItem {
    const researchLinks = buildSpotQualityItemResearchLinks(item);

    return {
        ...item,
        priority: getPriority(item),
        recommendedAction: getRecommendedAction(item, hasGooglePlaceIdColumn),
        researchQuery: researchLinks.query,
        researchFocus: researchLinks.recommendedFocus,
        mapsResearchUrl: researchLinks.mapsUrl,
        imageResearchUrl: researchLinks.imageSearchUrl,
        placeIdGuideUrl: researchLinks.placeIdSearchUrl,
        adminUrl: `${baseUrl}/admin/spots/quality?spot=${encodeURIComponent(item.id)}`,
        publicUrl: `${baseUrl}/spots/${encodeURIComponent(item.id)}`,
    };
}

function csvEscape(value: unknown): string {
    const text = value == null ? "" : String(value);
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(items: ActionPlanItem[], hasGooglePlaceIdColumn: boolean): string {
    const headers = [
        "priority",
        "id",
        "name",
        "category",
        "address",
        "issues",
        "recommendedAction",
        "researchFocus",
        "researchQuery",
        "mapsResearchUrl",
        "imageResearchUrl",
        "placeIdGuideUrl",
        "hasGooglePlaceIdColumn",
        "googlePlaceId",
        "photoCount",
        "primaryPhotoKind",
        "lat",
        "lng",
        "locationConfidence",
        "publicReady",
        "adminUrl",
        "publicUrl",
    ];

    const rows = items.map((item) => [
        item.priority,
        item.id,
        item.name,
        item.category || "",
        item.address,
        item.issues.join("|"),
        item.recommendedAction,
        item.researchFocus,
        item.researchQuery,
        item.mapsResearchUrl,
        item.imageResearchUrl,
        item.placeIdGuideUrl,
        hasGooglePlaceIdColumn,
        item.googlePlaceId || "",
        item.photoSummary.total,
        item.photoSummary.primaryKind,
        item.lat ?? "",
        item.lng ?? "",
        item.locationConfidence.label,
        item.publicReady,
        item.adminUrl,
        item.publicUrl,
    ]);

    return [headers, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\n") + "\n";
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { url, key } = getSupabaseCredentials();
    const supabase = createClient(url, key);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.localley.io").replace(/\/$/, "");
    const generatedAt = new Date().toISOString();
    const { rows, hasGooglePlaceIdColumn } = await fetchRows(supabase, args.city);
    const items = rows.map((row) => toSpotQualityItem(row, hasGooglePlaceIdColumn));
    const actionItems = items
        .filter((item) => !item.publicReady)
        .map((item) => toActionPlanItem(item, hasGooglePlaceIdColumn, baseUrl))
        .sort((left, right) => {
            if (right.priority !== left.priority) return right.priority - left.priority;
            return (right.createdAt || "").localeCompare(left.createdAt || "");
        })
        .slice(0, args.limit);

    const report = {
        generatedAt,
        filters: {
            city: args.city || null,
            limit: args.limit,
        },
        schema: {
            hasGooglePlaceIdColumn,
            migrationRequired: !hasGooglePlaceIdColumn,
            migrationPath: hasGooglePlaceIdColumn
                ? null
                : "supabase/migrations/006_spots_google_place_id.sql",
        },
        summary: summarizeSpotQualityItems(items),
        actionItemCount: actionItems.length,
        actionItems,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.mkdirSync(path.dirname(args.csvPath), { recursive: true });
    fs.writeFileSync(args.csvPath, toCsv(actionItems, hasGooglePlaceIdColumn));

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(
        [
            `Spot quality action plan written to ${args.outPath}`,
            `Spot quality CSV written to ${args.csvPath}`,
            `Google Place ID column: ${hasGooglePlaceIdColumn ? "present" : "missing"}`,
            `Scanned spots: ${items.length}`,
            `Public ready: ${report.summary.publicReady}`,
            `Needs work: ${report.summary.needsWork}`,
            `Action items exported: ${actionItems.length}`,
            `Missing images: ${report.summary.missingRealPhoto}`,
            `Inexact locations: ${report.summary.inexactLocation}`,
            `Missing Place IDs: ${report.summary.missingPlaceId}`,
        ].join("\n")
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
