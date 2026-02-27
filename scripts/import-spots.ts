/**
 * Spot Import Script with Validation and Quality Reporting
 *
 * Features:
 * - Upsert by (city + normalized_name + neighborhood)
 * - Duplicate detection
 * - Validation + quality report output
 * - Category and localness distribution checks
 *
 * Usage:
 *   npx tsx scripts/import-spots.ts <json-file> [--dry-run]
 *   npx tsx scripts/import-spots.ts data/spots-osaka.json
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
    getCityBySlug,
    getCityByName,
    REQUIRED_CATEGORIES,
    LOCALNESS_LABELS,
    LOCALNESS_TARGETS,
    CityConfig,
} from '../lib/cities';

dotenv.config({ path: '.env.local' });

// ============================================
// TYPES
// ============================================

interface SpotInput {
    name: string | { en: string; [key: string]: string };
    description: string | { en: string; [key: string]: string };
    city?: string;
    address: string | { en: string; [key: string]: string };
    neighborhood?: string;
    category: string;
    subcategories?: string[];
    localley_score: number;
    local_percentage?: number;
    best_times?: string | { en: string; [key: string]: string };
    photos?: string[];
    tips?: string[] | { en: string[]; [key: string]: string[] };
    verified?: boolean;
    trending_score?: number;
    latitude?: number;
    longitude?: number;
    price_tier?: "$" | "$$" | "$$$";
    time_of_day?: string[];
    best_for?: string[];
    source_meta?: string;
}

interface SpotRecord {
    id?: string;
    name: Record<string, string>;
    description: Record<string, string>;
    location: string; // PostGIS POINT format
    address: Record<string, string>;
    category: string;
    subcategories: string[];
    localley_score: number;
    local_percentage: number;
    best_times: Record<string, string>;
    photos: string[];
    tips: Record<string, string[]>;
    verified: boolean;
    trending_score: number;
}

interface ImportReport {
    timestamp: string;
    city: string;
    source: string;
    dryRun: boolean;
    summary: {
        totalInput: number;
        inserted: number;
        updated: number;
        skipped: number;
        duplicatesRemoved: number;
        errors: number;
    };
    categoryDistribution: Record<string, number>;
    localnessDistribution: Record<string, number>;
    neighborhoodCoverage: string[];
    qualityIssues: {
        missingImages: string[];
        weakDescriptions: string[];
        noNeighborhood: string[];
        invalidCategory: string[];
        outOfScoreRange: string[];
    };
    errors: Array<{ spot: string; error: string }>;
    targetComparison: {
        currentSpots: number;
        targetMin: number;
        targetIdeal: number;
        percentComplete: number;
    };
}

// ============================================
// HELPERS
// ============================================

function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function toMultiLang(value: string | Record<string, string>): Record<string, string> {
    if (typeof value === "string") {
        return { en: value };
    }
    return value;
}

function toMultiLangArray(value: string[] | Record<string, string[]> | undefined): Record<string, string[]> {
    if (!value) return { en: [] };
    if (Array.isArray(value)) {
        return { en: value };
    }
    return value;
}

function extractNeighborhood(address: Record<string, string>, neighborhood?: string): string {
    if (neighborhood) return neighborhood;

    // Try to extract from address
    const enAddress = address.en || Object.values(address)[0] || "";
    const parts = enAddress.split(",").map(p => p.trim());

    // Usually neighborhood is the first or second part
    if (parts.length >= 2) {
        return parts[0];
    }

    return "";
}

function getLocalnessLabel(score: number): string {
    return LOCALNESS_LABELS[score] || "Unknown";
}

function validateCategory(category: string): boolean {
    return REQUIRED_CATEGORIES.includes(category) ||
        ["Culture", "Nature", "Entertainment", "Historic", "Other"].includes(category);
}

// ============================================
// MAIN IMPORT LOGIC
// ============================================

async function importSpots(
    supabase: SupabaseClient,
    spots: SpotInput[],
    cityConfig: CityConfig,
    dryRun: boolean = false
): Promise<ImportReport> {
    const report: ImportReport = {
        timestamp: new Date().toISOString(),
        city: cityConfig.name,
        source: "",
        dryRun,
        summary: {
            totalInput: spots.length,
            inserted: 0,
            updated: 0,
            skipped: 0,
            duplicatesRemoved: 0,
            errors: 0,
        },
        categoryDistribution: {},
        localnessDistribution: {},
        neighborhoodCoverage: [],
        qualityIssues: {
            missingImages: [],
            weakDescriptions: [],
            noNeighborhood: [],
            invalidCategory: [],
            outOfScoreRange: [],
        },
        errors: [],
        targetComparison: {
            currentSpots: 0,
            targetMin: cityConfig.targets.spots.min,
            targetIdeal: cityConfig.targets.spots.ideal,
            percentComplete: 0,
        },
    };

    // Track seen normalized names for dedup
    const seenKeys = new Set<string>();
    const neighborhoods = new Set<string>();

    // Get existing spots for this city to calculate current count
    const { count: existingCount } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true })
        .ilike("address->>'en'", `%${cityConfig.name}%`);

    report.targetComparison.currentSpots = existingCount || 0;

    for (const spot of spots) {
        const name = toMultiLang(spot.name);
        const description = toMultiLang(spot.description);
        const address = toMultiLang(spot.address);
        const neighborhood = extractNeighborhood(address, spot.neighborhood);

        // Generate dedup key
        const normalizedName = normalizeString(name.en || Object.values(name)[0]);
        const dedupKey = `${cityConfig.slug}:${normalizedName}:${normalizeString(neighborhood)}`;

        // Check for duplicate in this batch
        if (seenKeys.has(dedupKey)) {
            report.summary.duplicatesRemoved++;
            continue;
        }
        seenKeys.add(dedupKey);

        // Validate
        const spotNameDisplay = name.en || Object.values(name)[0];

        // Score validation
        if (spot.localley_score < 1 || spot.localley_score > 6) {
            report.qualityIssues.outOfScoreRange.push(spotNameDisplay);
            report.summary.skipped++;
            continue;
        }

        // Category validation
        if (!validateCategory(spot.category)) {
            report.qualityIssues.invalidCategory.push(`${spotNameDisplay} (${spot.category})`);
        }

        // Quality checks (non-blocking)
        if (!spot.photos || spot.photos.length === 0) {
            report.qualityIssues.missingImages.push(spotNameDisplay);
        }

        const descText = description.en || Object.values(description)[0] || "";
        if (descText.length < 50) {
            report.qualityIssues.weakDescriptions.push(spotNameDisplay);
        }

        if (!neighborhood) {
            report.qualityIssues.noNeighborhood.push(spotNameDisplay);
        } else {
            neighborhoods.add(neighborhood);
        }

        // Track distributions
        report.categoryDistribution[spot.category] =
            (report.categoryDistribution[spot.category] || 0) + 1;

        const localnessLabel = getLocalnessLabel(spot.localley_score);
        report.localnessDistribution[localnessLabel] =
            (report.localnessDistribution[localnessLabel] || 0) + 1;

        // Prepare record
        const lat = spot.latitude || 0;
        const lng = spot.longitude || 0;

        const record: SpotRecord = {
            name,
            description,
            location: `POINT(${lng} ${lat})`,
            address,
            category: spot.category,
            subcategories: spot.subcategories || [],
            localley_score: spot.localley_score,
            local_percentage: spot.local_percentage || 50,
            best_times: toMultiLang(spot.best_times || "Anytime"),
            photos: spot.photos || [],
            tips: toMultiLangArray(spot.tips),
            verified: spot.verified || false,
            trending_score: spot.trending_score || 0,
        };

        if (dryRun) {
            report.summary.inserted++;
            continue;
        }

        // Check if exists (case-insensitive, normalized match)
        const { data: candidates } = await supabase
            .from("spots")
            .select("id, name, location")
            .ilike("name->>'en'", name.en)
            .ilike("address->>'en'", `%${cityConfig.name}%`);

        // Find best match: exact normalized name match or coordinate proximity
        const existing = candidates?.find(c => {
            const candidateName = normalizeString(
                (c.name as Record<string, string>)?.en || ""
            );
            if (candidateName === normalizedName) return true;

            // Coordinate proximity: within 50m with same name
            if (lat && lng && c.location) {
                const loc = c.location as { coordinates?: [number, number] };
                if (loc.coordinates) {
                    const [cLng, cLat] = loc.coordinates;
                    const R = 6371000;
                    const dLat = (cLat - lat) * Math.PI / 180;
                    const dLng = (cLng - lng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) ** 2 +
                        Math.cos(lat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) *
                        Math.sin(dLng / 2) ** 2;
                    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    if (dist <= 50 && candidateName === normalizedName) return true;
                }
            }
            return false;
        }) || null;

        try {
            if (existing) {
                // Update
                const { error } = await supabase
                    .from("spots")
                    .update(record)
                    .eq("id", existing.id);

                if (error) throw error;
                report.summary.updated++;
            } else {
                // Insert
                const { error } = await supabase
                    .from("spots")
                    .insert([record]);

                if (error) throw error;
                report.summary.inserted++;
            }
        } catch (err) {
            report.summary.errors++;
            report.errors.push({
                spot: spotNameDisplay,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // Finalize report
    report.neighborhoodCoverage = Array.from(neighborhoods);
    report.targetComparison.currentSpots += report.summary.inserted;
    report.targetComparison.percentComplete = Math.round(
        (report.targetComparison.currentSpots / report.targetComparison.targetMin) * 100
    );

    return report;
}

// ============================================
// CLI ENTRY POINT
// ============================================

/**
 * Import a single JSON file and print its report.
 * Returns the report for aggregation.
 */
async function importSingleFile(
    supabase: SupabaseClient,
    jsonFile: string,
    dryRun: boolean,
    cityOverride?: string,
    quiet: boolean = false,
): Promise<ImportReport | null> {
    const filePath = path.resolve(process.cwd(), jsonFile);
    if (!fs.existsSync(filePath)) {
        console.error(`   ❌ File not found: ${filePath}`);
        return null;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const spots: SpotInput[] = Array.isArray(rawData) ? rawData : rawData.spots || [];

    if (spots.length === 0) {
        if (!quiet) console.log(`   ⏭️  No spots in ${path.basename(jsonFile)}, skipping`);
        return null;
    }

    // Detect city — try multiple strategies
    let cityConfig: CityConfig | undefined;

    if (cityOverride) {
        cityConfig = getCityBySlug(cityOverride);
    } else {
        // Strategy 1: From spot's city field
        const firstSpot = spots[0];
        if (firstSpot.city) {
            cityConfig = getCityByName(firstSpot.city) || getCityByName(firstSpot.city.split(",")[0].trim());
        }

        // Strategy 2: From address (last part after comma)
        if (!cityConfig) {
            const addr = typeof firstSpot.address === "string" ? firstSpot.address : firstSpot.address?.en;
            if (addr) {
                // Try each comma-separated part of the address
                const parts = addr.split(",").map((p: string) => p.trim());
                for (const part of parts.reverse()) {
                    cityConfig = getCityByName(part);
                    if (cityConfig) break;
                }
            }
        }

        // Strategy 3: From filename (e.g., "seoul-spots-batch1.json" → "seoul", "hong-kong-curated-..." → "hong-kong")
        if (!cityConfig) {
            const filename = path.basename(jsonFile, ".json");
            // Known slug patterns in filenames
            const FILENAME_SLUG_MAP: Record<string, string> = {
                "bali-ubud": "bali-ubud",
                "hongkong": "hong-kong",
                "hong-kong": "hong-kong",
                "ho-chi-minh": "ho-chi-minh",
                "chiang-mai": "chiang-mai",
                "kuala-lumpur": "kuala-lumpur",
                "seoul": "seoul",
                "tokyo": "tokyo",
                "bangkok": "bangkok",
                "singapore": "singapore",
                "taipei": "taipei",
                "osaka": "osaka",
                "kyoto": "kyoto",
                "busan": "busan",
                "hanoi": "hanoi",
            };
            for (const [prefix, slug] of Object.entries(FILENAME_SLUG_MAP)) {
                if (filename.startsWith(prefix)) {
                    cityConfig = getCityBySlug(slug);
                    if (cityConfig) break;
                }
            }
        }
    }

    if (!cityConfig) {
        console.error(`   ❌ Could not detect city for ${path.basename(jsonFile)}. Use --city=slug.`);
        return null;
    }

    if (!quiet) {
        console.log(`   📁 ${path.basename(jsonFile)} → ${cityConfig.name} (${spots.length} spots)`);
    }

    // Run import
    const report = await importSpots(supabase, spots, cityConfig, dryRun);
    report.source = jsonFile;

    if (!quiet) {
        console.log(`      ✅ ${report.summary.inserted} inserted, 🔄 ${report.summary.updated} updated, ⏭️ ${report.summary.skipped} skipped, ❌ ${report.summary.errors} errors`);
    }

    return report;
}

/**
 * Print a detailed report for a single import.
 */
function printDetailedReport(report: ImportReport, cityName: string) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📋 IMPORT REPORT: ${cityName}`);
    console.log(`${"═".repeat(50)}`);

    console.log(`\n📈 SUMMARY`);
    console.log(`   Total Input:     ${report.summary.totalInput}`);
    console.log(`   ✅ Inserted:     ${report.summary.inserted}`);
    console.log(`   🔄 Updated:      ${report.summary.updated}`);
    console.log(`   ⏭️  Skipped:      ${report.summary.skipped}`);
    console.log(`   🔁 Duplicates:   ${report.summary.duplicatesRemoved}`);
    console.log(`   ❌ Errors:       ${report.summary.errors}`);

    console.log(`\n📊 CATEGORY DISTRIBUTION`);
    for (const [cat, count] of Object.entries(report.categoryDistribution)) {
        const pct = Math.round((count / report.summary.totalInput) * 100);
        console.log(`   ${cat.padEnd(15)} ${count.toString().padStart(4)} (${pct}%)`);
    }

    console.log(`\n🎯 LOCALNESS DISTRIBUTION`);
    for (const [label, count] of Object.entries(report.localnessDistribution)) {
        const pct = Math.round((count / report.summary.totalInput) * 100);
        console.log(`   ${label.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
    }

    console.log(`\n🏘️  NEIGHBORHOODS COVERED: ${report.neighborhoodCoverage.length}`);
    if (report.neighborhoodCoverage.length > 0) {
        console.log(`   ${report.neighborhoodCoverage.slice(0, 10).join(", ")}${report.neighborhoodCoverage.length > 10 ? "..." : ""}`);
    }

    console.log(`\n🎯 TARGET PROGRESS`);
    console.log(`   Current: ${report.targetComparison.currentSpots} spots`);
    console.log(`   Target:  ${report.targetComparison.targetMin}-${report.targetComparison.targetIdeal} spots`);
    console.log(`   Progress: ${report.targetComparison.percentComplete}%`);

    const hasIssues = Object.values(report.qualityIssues).some(arr => arr.length > 0);
    if (hasIssues) {
        console.log(`\n⚠️  QUALITY ISSUES`);
        if (report.qualityIssues.missingImages.length > 0) {
            console.log(`   🖼️  Missing images: ${report.qualityIssues.missingImages.length}`);
        }
        if (report.qualityIssues.weakDescriptions.length > 0) {
            console.log(`   📝 Weak descriptions: ${report.qualityIssues.weakDescriptions.length}`);
        }
        if (report.qualityIssues.noNeighborhood.length > 0) {
            console.log(`   📍 No neighborhood: ${report.qualityIssues.noNeighborhood.length}`);
        }
        if (report.qualityIssues.invalidCategory.length > 0) {
            console.log(`   🏷️  Invalid category: ${report.qualityIssues.invalidCategory.length}`);
        }
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("--help")) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║              LOCALLEY SPOT IMPORT TOOL                     ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx tsx scripts/import-spots.ts <path> [options]        ║
║                                                            ║
║  Path can be a single JSON file or a directory of JSONs.   ║
║                                                            ║
║  Options:                                                  ║
║    --dry-run    Validate without inserting                 ║
║    --city=slug  Override city detection                    ║
║                                                            ║
║  Examples:                                                 ║
║    npx tsx scripts/import-spots.ts data/osaka-spots.json   ║
║    npx tsx scripts/import-spots.ts data/enriched/          ║
║    npx tsx scripts/import-spots.ts data/enriched/ --dry-run║
╚════════════════════════════════════════════════════════════╝
        `);
        process.exit(0);
    }

    const inputPath = args.find(a => !a.startsWith("--"));
    const dryRun = args.includes("--dry-run");
    const cityOverride = args.find(a => a.startsWith("--city="))?.split("=")[1];

    if (!inputPath) {
        console.error("❌ No file or directory specified");
        process.exit(1);
    }

    // Load environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Missing Supabase credentials in .env.local");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resolvedPath = path.resolve(process.cwd(), inputPath);

    console.log(`\n🌍 LOCALLEY SPOT IMPORT`);
    console.log(`${"─".repeat(50)}`);
    console.log(`🔧 Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE IMPORT"}`);

    // Check if directory or file
    const isDirectory = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();

    if (isDirectory) {
        // ── DIRECTORY MODE: import all JSON files in the directory ──
        const jsonFiles = fs.readdirSync(resolvedPath)
            .filter(f => f.endsWith(".json") && !f.startsWith("_"))
            .sort();

        console.log(`📂 Directory: ${inputPath}`);
        console.log(`📊 Found ${jsonFiles.length} JSON files`);
        console.log(`${"─".repeat(50)}\n`);

        let totalInserted = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        let totalSpots = 0;
        let filesProcessed = 0;
        let filesFailed = 0;
        const citySummary: Record<string, { inserted: number; updated: number; skipped: number; errors: number; total: number }> = {};

        for (const file of jsonFiles) {
            const filePath = path.join(inputPath, file);
            const report = await importSingleFile(supabase, filePath, dryRun, cityOverride, false);

            if (report) {
                filesProcessed++;
                totalInserted += report.summary.inserted;
                totalUpdated += report.summary.updated;
                totalSkipped += report.summary.skipped;
                totalErrors += report.summary.errors;
                totalSpots += report.summary.totalInput;

                // Aggregate by city
                const city = report.city;
                if (!citySummary[city]) {
                    citySummary[city] = { inserted: 0, updated: 0, skipped: 0, errors: 0, total: 0 };
                }
                citySummary[city].inserted += report.summary.inserted;
                citySummary[city].updated += report.summary.updated;
                citySummary[city].skipped += report.summary.skipped;
                citySummary[city].errors += report.summary.errors;
                citySummary[city].total += report.summary.totalInput;
            } else {
                filesFailed++;
            }
        }

        // Print aggregate summary
        console.log(`\n${"═".repeat(60)}`);
        console.log(`📋 BATCH IMPORT SUMMARY`);
        console.log(`${"═".repeat(60)}`);
        console.log(`\n📊 TOTALS`);
        console.log(`   Files processed: ${filesProcessed} / ${jsonFiles.length}${filesFailed > 0 ? ` (${filesFailed} failed)` : ""}`);
        console.log(`   Total spots:     ${totalSpots}`);
        console.log(`   ✅ Inserted:     ${totalInserted}`);
        console.log(`   🔄 Updated:      ${totalUpdated}`);
        console.log(`   ⏭️  Skipped:      ${totalSkipped}`);
        console.log(`   ❌ Errors:       ${totalErrors}`);

        console.log(`\n🏙️  PER-CITY BREAKDOWN`);
        const sortedCities = Object.entries(citySummary).sort((a, b) => b[1].total - a[1].total);
        for (const [city, stats] of sortedCities) {
            console.log(`   ${city.padEnd(16)} ${stats.total.toString().padStart(4)} spots → ✅ ${stats.inserted} new, 🔄 ${stats.updated} updated${stats.errors > 0 ? `, ❌ ${stats.errors} errors` : ""}`);
        }

        console.log(`\n${"═".repeat(60)}\n`);
    } else {
        // ── SINGLE FILE MODE: existing behavior ──
        if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ File not found: ${resolvedPath}`);
            process.exit(1);
        }

        console.log(`📁 Source: ${inputPath}`);
        console.log(`${"─".repeat(50)}\n`);

        const report = await importSingleFile(supabase, inputPath, dryRun, cityOverride, true);

        if (!report) {
            console.error("❌ Import failed");
            process.exit(1);
        }

        // Detect city name from report
        const cityName = report.city || "Unknown";
        printDetailedReport(report, cityName);

        // Save report
        const reportDir = path.join(process.cwd(), "reports");
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportName = `import_${cityName.toLowerCase().replace(/\s+/g, "-")}_${new Date().toISOString().split("T")[0]}.json`;
        const reportPath = path.join(reportDir, reportName);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n💾 Report saved: ${reportPath}`);
        console.log(`${"═".repeat(50)}\n`);
    }
}

main().catch(err => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
});
