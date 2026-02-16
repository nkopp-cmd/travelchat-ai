/**
 * Data Enrichment Script
 *
 * Reads all JSON batch files from /data/, identifies quality gaps,
 * cross-references curated (coords) with spots (local names) data,
 * and produces enriched versions in /data/enriched/.
 *
 * Usage:
 *   npx tsx scripts/enrich-existing-data.ts [--dry-run] [--city=seoul] [--report-only]
 *
 * Options:
 *   --dry-run      Preview changes without writing files
 *   --city=slug    Only process one city (e.g., --city=seoul)
 *   --report-only  Print quality gap analysis without enriching
 */

import * as fs from "fs";
import * as path from "path";

// ============================================
// TYPES
// ============================================

interface MultiLang {
    [key: string]: string;
}

interface MultiLangArray {
    [key: string]: string[];
}

interface SpotData {
    name: MultiLang | string;
    description: MultiLang | string;
    city?: string;
    neighborhood?: string;
    address: MultiLang | string;
    category: string;
    subcategories?: string[];
    localley_score: number;
    local_percentage?: number;
    best_time?: string;
    best_times?: MultiLang;
    photos?: string[];
    tips?: string[] | MultiLangArray;
    verified?: boolean;
    trending_score?: number;
    latitude?: number;
    longitude?: number;
    price_tier?: string;
    google_place_id?: string;
    source_meta?: string;
    time_of_day?: string[];
    best_for?: string[];
}

interface BatchFile {
    city: string;
    batch: number;
    generatedAt?: string;
    spots: SpotData[];
}

interface EnrichmentReport {
    timestamp: string;
    summary: {
        totalFiles: number;
        totalSpots: number;
        byCity: Record<string, number>;
    };
    beforeGaps: GapAnalysis;
    afterGaps: GapAnalysis;
    crossReferenceMatches: number;
    enrichmentActions: Record<string, number>;
}

interface GapAnalysis {
    missingCoordinates: number;
    missingLocalName: number;
    missingPhotos: number;
    missingTips: number;
    weakTips: number;
    missingBestTime: number;
    missingSubcategories: number;
    missingVerified: number;
    missingTrendingScore: number;
    placeholderAddresses: number;
}

// ============================================
// HELPERS
// ============================================

function toMultiLang(value: string | MultiLang | undefined): MultiLang {
    if (!value) return { en: "" };
    if (typeof value === "string") return { en: value };
    return value;
}

function getEn(value: string | MultiLang | undefined): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.en || Object.values(value)[0] || "";
}

function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function hasCoordinates(spot: SpotData): boolean {
    return !!(
        spot.latitude &&
        spot.longitude &&
        spot.latitude !== 0 &&
        spot.longitude !== 0
    );
}

function hasLocalName(spot: SpotData): boolean {
    const name = toMultiLang(spot.name);
    // Check if there's any non-English key
    return Object.keys(name).some((k) => k !== "en" && name[k]?.trim());
}

function hasMeaningfulTips(spot: SpotData): boolean {
    if (!spot.tips) return false;
    if (Array.isArray(spot.tips)) {
        return spot.tips.length > 0 && !spot.tips.some((t) => t.startsWith("Budget:"));
    }
    // JSONB tips
    const enTips = (spot.tips as MultiLangArray).en;
    return enTips && enTips.length > 0;
}

function hasWeakTips(spot: SpotData): boolean {
    if (!spot.tips) return true;
    if (Array.isArray(spot.tips)) {
        return spot.tips.some((t) => t.startsWith("Budget:")) || spot.tips.length < 2;
    }
    const enTips = (spot.tips as MultiLangArray).en;
    return !enTips || enTips.length < 2;
}

function isPlaceholderAddress(spot: SpotData): boolean {
    const addr = getEn(spot.address);
    // Placeholder if it's just "City, Country" or similar short format
    const parts = addr.split(",").map((p) => p.trim());
    return parts.length <= 2 && !addr.match(/\d/); // No street numbers = likely placeholder
}

function hasBestTime(spot: SpotData): boolean {
    if (spot.best_time && spot.best_time !== "Anytime") return true;
    if (spot.best_times) {
        const en = getEn(spot.best_times);
        return !!en && en !== "Anytime";
    }
    return false;
}

// ============================================
// GAP ANALYSIS
// ============================================

function analyzeGaps(spots: SpotData[]): GapAnalysis {
    const gaps: GapAnalysis = {
        missingCoordinates: 0,
        missingLocalName: 0,
        missingPhotos: 0,
        missingTips: 0,
        weakTips: 0,
        missingBestTime: 0,
        missingSubcategories: 0,
        missingVerified: 0,
        missingTrendingScore: 0,
        placeholderAddresses: 0,
    };

    for (const spot of spots) {
        if (!hasCoordinates(spot)) gaps.missingCoordinates++;
        if (!hasLocalName(spot)) gaps.missingLocalName++;
        if (!spot.photos || spot.photos.length === 0) gaps.missingPhotos++;
        if (!hasMeaningfulTips(spot)) gaps.missingTips++;
        if (hasWeakTips(spot)) gaps.weakTips++;
        if (!hasBestTime(spot)) gaps.missingBestTime++;
        if (!spot.subcategories || spot.subcategories.length === 0) gaps.missingSubcategories++;
        if (spot.verified === undefined) gaps.missingVerified++;
        if (spot.trending_score === undefined) gaps.missingTrendingScore++;
        if (isPlaceholderAddress(spot)) gaps.placeholderAddresses++;
    }

    return gaps;
}

// ============================================
// CROSS-REFERENCE ENGINE
// ============================================

interface SpotLookupEntry {
    coordinates?: { lat: number; lng: number };
    address?: MultiLang;
    localName?: MultiLang;
    tips?: string[];
    bestTime?: string;
    subcategories?: string[];
    googlePlaceId?: string;
    neighborhood?: string;
}

/**
 * Build a lookup index from all batch files.
 * Key: normalized(citySlug + spotNameEn)
 * This allows cross-referencing between curated (has coords) and spots (has local names).
 */
function buildSpotLookup(allBatches: { file: string; data: BatchFile }[]): Map<string, SpotLookupEntry> {
    const lookup = new Map<string, SpotLookupEntry>();

    for (const { data } of allBatches) {
        const cityKey = normalizeString(data.city);

        for (const spot of data.spots) {
            const nameEn = getEn(spot.name);
            const key = `${cityKey}:${normalizeString(nameEn)}`;

            const existing = lookup.get(key) || {};

            // Merge coordinates (prefer curated data which has Google Places coords)
            if (hasCoordinates(spot) && !existing.coordinates) {
                existing.coordinates = {
                    lat: spot.latitude!,
                    lng: spot.longitude!,
                };
            }

            // Merge local names (prefer spots data which has manual local names)
            if (hasLocalName(spot)) {
                const name = toMultiLang(spot.name);
                if (!existing.localName) {
                    existing.localName = {};
                }
                for (const [lang, val] of Object.entries(name)) {
                    if (lang !== "en" && val?.trim()) {
                        existing.localName[lang] = val;
                    }
                }
            }

            // Merge address (prefer more detailed address)
            const addr = toMultiLang(spot.address);
            if (!existing.address || getEn(existing.address).length < getEn(addr).length) {
                existing.address = addr;
            }

            // Merge tips (prefer longer tips)
            if (spot.tips) {
                const tips = Array.isArray(spot.tips) ? spot.tips : (spot.tips as MultiLangArray).en || [];
                if (tips.length > 0 && (!existing.tips || existing.tips.length < tips.length)) {
                    existing.tips = tips;
                }
            }

            // Merge best_time
            if (hasBestTime(spot) && !existing.bestTime) {
                existing.bestTime = spot.best_time || getEn(spot.best_times);
            }

            // Merge subcategories
            if (spot.subcategories && spot.subcategories.length > 0) {
                if (!existing.subcategories || existing.subcategories.length < spot.subcategories.length) {
                    existing.subcategories = spot.subcategories;
                }
            }

            // Google Place ID
            if (spot.google_place_id && !existing.googlePlaceId) {
                existing.googlePlaceId = spot.google_place_id;
            }

            // Neighborhood
            if (spot.neighborhood && !existing.neighborhood) {
                existing.neighborhood = spot.neighborhood;
            }

            lookup.set(key, existing);
        }
    }

    return lookup;
}

// ============================================
// ENRICHMENT ENGINE
// ============================================

function enrichSpot(
    spot: SpotData,
    cityKey: string,
    lookup: Map<string, SpotLookupEntry>,
    actions: Record<string, number>
): SpotData {
    const nameEn = getEn(spot.name);
    const key = `${cityKey}:${normalizeString(nameEn)}`;
    const ref = lookup.get(key);

    const enriched = { ...spot };

    // 1. Add coordinates from cross-reference
    if (!hasCoordinates(enriched) && ref?.coordinates) {
        enriched.latitude = ref.coordinates.lat;
        enriched.longitude = ref.coordinates.lng;
        actions["coordinates_from_crossref"] = (actions["coordinates_from_crossref"] || 0) + 1;
    }

    // 2. Add local names from cross-reference
    if (!hasLocalName(enriched) && ref?.localName) {
        const name = toMultiLang(enriched.name);
        enriched.name = { ...name, ...ref.localName };
        actions["localname_from_crossref"] = (actions["localname_from_crossref"] || 0) + 1;
    }

    // 3. Merge better address
    if (isPlaceholderAddress(enriched) && ref?.address) {
        const existingAddr = toMultiLang(enriched.address);
        const refAddr = ref.address;
        if (getEn(refAddr).length > getEn(existingAddr).length) {
            enriched.address = { ...existingAddr, ...refAddr };
            actions["address_upgraded"] = (actions["address_upgraded"] || 0) + 1;
        }
    }

    // 4. Ensure photos array exists
    if (!enriched.photos) {
        enriched.photos = [];
        actions["photos_array_added"] = (actions["photos_array_added"] || 0) + 1;
    }

    // 5. Add missing subcategories from cross-reference
    if ((!enriched.subcategories || enriched.subcategories.length === 0) && ref?.subcategories) {
        enriched.subcategories = ref.subcategories;
        actions["subcategories_from_crossref"] = (actions["subcategories_from_crossref"] || 0) + 1;
    }

    // 6. Infer subcategories from description if still missing
    if (!enriched.subcategories || enriched.subcategories.length === 0) {
        enriched.subcategories = inferSubcategories(enriched);
        if (enriched.subcategories.length > 0) {
            actions["subcategories_inferred"] = (actions["subcategories_inferred"] || 0) + 1;
        }
    }

    // 7. Set verified to false if missing
    if (enriched.verified === undefined) {
        enriched.verified = false;
        actions["verified_defaulted"] = (actions["verified_defaulted"] || 0) + 1;
    }

    // 8. Calculate trending_score from localley_score if missing
    if (enriched.trending_score === undefined) {
        enriched.trending_score = calculateTrendingScore(enriched.localley_score);
        actions["trending_calculated"] = (actions["trending_calculated"] || 0) + 1;
    }

    // 9. Normalize best_time → best_times JSONB format
    if (enriched.best_time && !enriched.best_times) {
        enriched.best_times = { en: enriched.best_time };
        // Keep best_time for backward compat
    }

    // 10. Add neighborhood from cross-reference
    if (!enriched.neighborhood && ref?.neighborhood) {
        enriched.neighborhood = ref.neighborhood;
        actions["neighborhood_from_crossref"] = (actions["neighborhood_from_crossref"] || 0) + 1;
    }

    return enriched;
}

function inferSubcategories(spot: SpotData): string[] {
    const desc = getEn(spot.description).toLowerCase();
    const name = getEn(spot.name).toLowerCase();
    const text = `${name} ${desc}`;
    const subs: string[] = [];

    const KEYWORD_MAP: Record<string, string[]> = {
        // Food subcategories
        "ramen": ["Ramen", "Japanese", "Noodles"],
        "sushi": ["Sushi", "Japanese", "Seafood"],
        "bbq": ["BBQ", "Korean", "Grilled"],
        "street food": ["Street Food"],
        "seafood": ["Seafood"],
        "noodle": ["Noodles"],
        "dim sum": ["Dim Sum", "Chinese"],
        "curry": ["Curry"],
        "dumpling": ["Dumplings"],
        "bakery": ["Bakery"],
        "dessert": ["Dessert"],
        "pizza": ["Pizza", "Italian"],
        "french": ["French"],
        "korean": ["Korean"],
        "japanese": ["Japanese"],
        "thai": ["Thai"],
        "chinese": ["Chinese"],
        "vietnamese": ["Vietnamese"],
        "indian": ["Indian"],
        "malay": ["Malay"],
        // Cafe
        "coffee": ["Coffee"],
        "tea": ["Tea"],
        "matcha": ["Matcha", "Japanese"],
        "rooftop": ["Rooftop"],
        // Nightlife
        "cocktail": ["Cocktails"],
        "speakeasy": ["Speakeasy"],
        "jazz": ["Jazz", "Live Music"],
        "craft beer": ["Craft Beer"],
        "wine": ["Wine Bar"],
        "izakaya": ["Izakaya", "Japanese"],
        "soju": ["Soju Bar", "Korean"],
        "karaoke": ["Karaoke"],
        // Shopping
        "vintage": ["Vintage"],
        "thrift": ["Thrift", "Vintage"],
        "streetwear": ["Streetwear"],
        "bookstore": ["Bookstore"],
        "record": ["Record Store"],
        "antique": ["Antique"],
        "artisan": ["Artisan"],
        "souvenir": ["Souvenirs"],
        // Market
        "night market": ["Night Market"],
        "flea market": ["Flea Market"],
        "wet market": ["Wet Market"],
        "food market": ["Food Market"],
        "weekend market": ["Weekend Market"],
        // Outdoor
        "temple": ["Temple"],
        "shrine": ["Shrine"],
        "park": ["Park"],
        "garden": ["Garden"],
        "viewpoint": ["Viewpoint"],
        "beach": ["Beach"],
        "hiking": ["Hiking"],
        "historic": ["Historic"],
    };

    for (const [keyword, subcats] of Object.entries(KEYWORD_MAP)) {
        if (text.includes(keyword)) {
            for (const sub of subcats) {
                if (!subs.includes(sub)) {
                    subs.push(sub);
                }
            }
        }
    }

    return subs.slice(0, 4); // Max 4 subcategories
}

function calculateTrendingScore(localleyScore: number): number {
    // Higher localley score = more likely to trend for the "hidden gem" discovery angle
    const base: Record<number, number> = {
        1: 0.1,
        2: 0.2,
        3: 0.3,
        4: 0.5,
        5: 0.65,
        6: 0.4, // Score 6 spots are too hidden to trend
    };
    const score = base[localleyScore] || 0.3;
    // Add small random variation
    return Math.round((score + (Math.random() * 0.15 - 0.075)) * 100) / 100;
}

// ============================================
// FILE I/O
// ============================================

function readBatchFiles(dataDir: string, cityFilter?: string): { file: string; data: BatchFile }[] {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json") && !f.startsWith(".") && !f.startsWith("_"));

    const batches: { file: string; data: BatchFile }[] = [];

    for (const file of files) {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
            const batchData: BatchFile = {
                city: raw.city || "",
                batch: raw.batch || 0,
                generatedAt: raw.generatedAt,
                spots: raw.spots || [],
            };

            if (cityFilter) {
                const cityNorm = normalizeString(batchData.city);
                const filterNorm = normalizeString(cityFilter);
                if (!cityNorm.includes(filterNorm) && !filterNorm.includes(cityNorm)) {
                    continue;
                }
            }

            batches.push({ file, data: batchData });
        } catch (err) {
            console.error(`⚠️  Error reading ${file}: ${err}`);
        }
    }

    return batches;
}

function writeBatchFile(outputDir: string, filename: string, data: BatchFile): void {
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================
// REPORT GENERATION
// ============================================

function printGapReport(label: string, gaps: GapAnalysis, total: number): void {
    const pct = (n: number) => `${n} (${Math.round((n / total) * 100)}%)`;

    console.log(`\n📊 ${label}`);
    console.log(`   Total spots:           ${total}`);
    console.log(`   Missing coordinates:    ${pct(gaps.missingCoordinates)}`);
    console.log(`   Missing local name:     ${pct(gaps.missingLocalName)}`);
    console.log(`   Missing photos:         ${pct(gaps.missingPhotos)}`);
    console.log(`   Missing tips:           ${pct(gaps.missingTips)}`);
    console.log(`   Weak tips (<2):         ${pct(gaps.weakTips)}`);
    console.log(`   Missing best_time:      ${pct(gaps.missingBestTime)}`);
    console.log(`   Missing subcategories:  ${pct(gaps.missingSubcategories)}`);
    console.log(`   Missing verified:       ${pct(gaps.missingVerified)}`);
    console.log(`   Missing trending:       ${pct(gaps.missingTrendingScore)}`);
    console.log(`   Placeholder addresses:  ${pct(gaps.placeholderAddresses)}`);
}

// ============================================
// MAIN
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const reportOnly = args.includes("--report-only");
    const cityFilter = args.find((a) => a.startsWith("--city="))?.split("=")[1];

    const dataDir = path.join(process.cwd(), "data");
    const outputDir = path.join(dataDir, "enriched");

    console.log(`\n🔬 LOCALLEY DATA ENRICHMENT TOOL`);
    console.log(`${"─".repeat(50)}`);
    console.log(`📁 Source: ${dataDir}`);
    console.log(`📂 Output: ${outputDir}`);
    console.log(`🔧 Mode: ${reportOnly ? "REPORT ONLY" : dryRun ? "DRY RUN" : "LIVE ENRICHMENT"}`);
    if (cityFilter) console.log(`🏙️  City filter: ${cityFilter}`);

    // Step 1: Read all batch files
    console.log(`\n📖 Reading batch files...`);
    const allBatches = readBatchFiles(dataDir);
    const filteredBatches = cityFilter ? readBatchFiles(dataDir, cityFilter) : allBatches;

    const allSpots = allBatches.flatMap((b) => b.data.spots);
    const filteredSpots = filteredBatches.flatMap((b) => b.data.spots);

    console.log(`   Total files: ${allBatches.length}`);
    console.log(`   Total spots: ${allSpots.length}`);
    if (cityFilter) {
        console.log(`   Filtered files: ${filteredBatches.length}`);
        console.log(`   Filtered spots: ${filteredSpots.length}`);
    }

    // Step 2: Analyze current gaps
    const beforeGaps = analyzeGaps(filteredSpots);
    printGapReport("CURRENT DATA QUALITY (BEFORE)", beforeGaps, filteredSpots.length);

    // City breakdown
    const cityCounts: Record<string, number> = {};
    for (const batch of filteredBatches) {
        const city = batch.data.city || "Unknown";
        cityCounts[city] = (cityCounts[city] || 0) + batch.data.spots.length;
    }
    console.log(`\n🏙️  SPOTS BY CITY`);
    for (const [city, count] of Object.entries(cityCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${city.padEnd(20)} ${count}`);
    }

    if (reportOnly) {
        console.log(`\n✅ Report complete (no changes made).`);
        return;
    }

    // Step 3: Build cross-reference lookup from ALL files (not just filtered)
    console.log(`\n🔗 Building cross-reference index...`);
    const lookup = buildSpotLookup(allBatches);
    console.log(`   Index entries: ${lookup.size}`);

    // Step 4: Enrich each batch file
    console.log(`\n✨ Enriching spots...`);
    const actions: Record<string, number> = {};
    const enrichedBatches: { file: string; data: BatchFile }[] = [];

    for (const batch of filteredBatches) {
        const cityKey = normalizeString(batch.data.city);
        const enrichedSpots = batch.data.spots.map((spot) => enrichSpot(spot, cityKey, lookup, actions));

        enrichedBatches.push({
            file: batch.file,
            data: {
                ...batch.data,
                spots: enrichedSpots,
            },
        });
    }

    // Step 5: Analyze after-enrichment gaps
    const afterSpots = enrichedBatches.flatMap((b) => b.data.spots);
    const afterGaps = analyzeGaps(afterSpots);
    printGapReport("DATA QUALITY (AFTER ENRICHMENT)", afterGaps, afterSpots.length);

    // Step 6: Print enrichment actions
    console.log(`\n🛠️  ENRICHMENT ACTIONS`);
    for (const [action, count] of Object.entries(actions).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${action.replace(/_/g, " ").padEnd(30)} ${count}`);
    }

    // Step 7: Write enriched files
    if (!dryRun) {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log(`\n💾 Writing enriched files to ${outputDir}...`);
        for (const batch of enrichedBatches) {
            writeBatchFile(outputDir, batch.file, batch.data);
        }
        console.log(`   Written: ${enrichedBatches.length} files`);

        // Write enrichment report
        const report: EnrichmentReport = {
            timestamp: new Date().toISOString(),
            summary: {
                totalFiles: enrichedBatches.length,
                totalSpots: afterSpots.length,
                byCity: cityCounts,
            },
            beforeGaps,
            afterGaps,
            crossReferenceMatches: actions["coordinates_from_crossref"] || 0,
            enrichmentActions: actions,
        };

        const reportPath = path.join(outputDir, "_enrichment-report.json");
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`   Report: ${reportPath}`);
    } else {
        console.log(`\n⏩ DRY RUN — no files written.`);
    }

    // Step 8: Show improvement summary
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📈 ENRICHMENT IMPROVEMENT SUMMARY`);
    console.log(`${"═".repeat(50)}`);

    const improved = (before: number, after: number) => {
        const diff = before - after;
        return diff > 0 ? `✅ ${diff} fixed (${Math.round((diff / Math.max(before, 1)) * 100)}% improvement)` : `— no change`;
    };

    console.log(`   Coordinates:    ${improved(beforeGaps.missingCoordinates, afterGaps.missingCoordinates)}`);
    console.log(`   Local names:    ${improved(beforeGaps.missingLocalName, afterGaps.missingLocalName)}`);
    console.log(`   Subcategories:  ${improved(beforeGaps.missingSubcategories, afterGaps.missingSubcategories)}`);
    console.log(`   Verified flag:  ${improved(beforeGaps.missingVerified, afterGaps.missingVerified)}`);
    console.log(`   Trending score: ${improved(beforeGaps.missingTrendingScore, afterGaps.missingTrendingScore)}`);
    console.log(`   Addresses:      ${improved(beforeGaps.placeholderAddresses, afterGaps.placeholderAddresses)}`);

    console.log(`\n${"═".repeat(50)}\n`);

    // Remaining gaps that need web research or API enrichment
    if (afterGaps.missingCoordinates > 0) {
        console.log(`⚠️  ${afterGaps.missingCoordinates} spots still need coordinates.`);
        console.log(`   Run: npx tsx scripts/geocode-spots.ts to fix via Google API`);
    }
    if (afterGaps.missingPhotos > 0) {
        console.log(`⚠️  ${afterGaps.missingPhotos} spots still need photos.`);
        console.log(`   Run: npx tsx scripts/enrich-spot-images.ts to fix`);
    }
}

main().catch((err) => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
});
