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

        // Check if exists (upsert logic)
        const { data: existing } = await supabase
            .from("spots")
            .select("id")
            .eq("name->>'en'", name.en)
            .ilike("address->>'en'", `%${cityConfig.name}%`)
            .single();

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

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("--help")) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║              LOCALLEY SPOT IMPORT TOOL                     ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx tsx scripts/import-spots.ts <json-file> [options]   ║
║                                                            ║
║  Options:                                                  ║
║    --dry-run    Validate without inserting                 ║
║    --city=slug  Override city detection                    ║
║                                                            ║
║  Example:                                                  ║
║    npx tsx scripts/import-spots.ts data/osaka-spots.json   ║
╚════════════════════════════════════════════════════════════╝
        `);
        process.exit(0);
    }

    const jsonFile = args.find(a => !a.startsWith("--"));
    const dryRun = args.includes("--dry-run");
    const cityOverride = args.find(a => a.startsWith("--city="))?.split("=")[1];

    if (!jsonFile) {
        console.error("❌ No JSON file specified");
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

    // Load JSON
    const filePath = path.resolve(process.cwd(), jsonFile);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\n🌍 LOCALLEY SPOT IMPORT`);
    console.log(`${"─".repeat(50)}`);
    console.log(`📁 Source: ${jsonFile}`);
    console.log(`🔧 Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE IMPORT"}`);

    const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const spots: SpotInput[] = Array.isArray(rawData) ? rawData : rawData.spots || [];

    if (spots.length === 0) {
        console.error("❌ No spots found in JSON file");
        process.exit(1);
    }

    // Detect city
    let cityConfig: CityConfig | undefined;

    if (cityOverride) {
        cityConfig = getCityBySlug(cityOverride);
    } else {
        // Try to detect from first spot
        const firstSpot = spots[0];
        const cityGuess = firstSpot.city ||
            (typeof firstSpot.address === "string" ? firstSpot.address : firstSpot.address?.en);

        if (cityGuess) {
            cityConfig = getCityByName(cityGuess.split(",").pop()?.trim() || "");
        }
    }

    if (!cityConfig) {
        console.error("❌ Could not detect city. Use --city=slug to specify.");
        console.log("   Available: seoul, tokyo, bangkok, singapore, osaka, kyoto, etc.");
        process.exit(1);
    }

    console.log(`🏙️  City: ${cityConfig.name} (Ring ${cityConfig.ring})`);
    console.log(`📊 Spots in file: ${spots.length}`);
    console.log(`${"─".repeat(50)}\n`);

    // Run import
    const report = await importSpots(supabase, spots, cityConfig, dryRun);
    report.source = jsonFile;

    // Print report
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📋 IMPORT REPORT: ${cityConfig.name}`);
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

    // Quality issues
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

    // Save report
    const reportDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportName = `import_${cityConfig.slug}_${new Date().toISOString().split("T")[0]}.json`;
    const reportPath = path.join(reportDir, reportName);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n💾 Report saved: ${reportPath}`);
    console.log(`${"═".repeat(50)}\n`);
}

main().catch(err => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
});
