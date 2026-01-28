/**
 * Google Sheets to JSON Converter for Spot Import
 *
 * Converts publicly shared Google Sheets to the batch JSON format
 * expected by import-spots.ts
 *
 * Usage:
 *   npx tsx scripts/sheets-to-json.ts <google-sheets-url> --city=<city-slug>
 *   npx tsx scripts/sheets-to-json.ts "https://docs.google.com/spreadsheets/d/..." --city=seoul
 *
 * Expected columns (flexible - will map what exists):
 *   name_en (required), name_ko, name_ja, name_th, name_zh
 *   description_en (required), description_ko, etc.
 *   address_en (required), address_ko, etc.
 *   neighborhood (required)
 *   category (required): Food, Cafe, Nightlife, Shopping, Market, Outdoor
 *   subcategories: comma-separated
 *   localley_score (required): 1-6
 *   local_percentage: 0-100
 *   best_times_en, best_times_ko, etc.
 *   photos: comma-separated URLs
 *   tips_en: pipe-separated tips
 *   latitude (required), longitude (required)
 *   source_notes: for verification (not imported)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { getCityBySlug, getCityByName, CityConfig, REQUIRED_CATEGORIES } from '../lib/cities';

// ============================================
// TYPES
// ============================================

interface SheetRow {
    [key: string]: string;
}

interface SpotOutput {
    name: Record<string, string>;
    description: Record<string, string>;
    city: string;
    neighborhood: string;
    address: Record<string, string>;
    category: string;
    subcategories: string[];
    localley_score: number;
    local_percentage: number;
    best_times: Record<string, string>;
    photos: string[];
    tips: string[];
    verified: boolean;
    trending_score: number;
    latitude: number;
    longitude: number;
}

interface BatchOutput {
    city: string;
    batch: number;
    spots: SpotOutput[];
}

// ============================================
// HELPERS
// ============================================

function extractSheetsId(url: string): string | null {
    // Match Google Sheets URL patterns
    const patterns = [
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        /^([a-zA-Z0-9-_]+)$/,  // Direct ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function extractGid(url: string): string {
    const match = url.match(/gid=(\d+)/);
    return match ? match[1] : '0';
}

function buildCsvExportUrl(sheetsId: string, gid: string): string {
    return `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv&gid=${gid}`;
}

function normalizeColumnName(col: string): string {
    return col.toLowerCase().trim().replace(/\s+/g, '_');
}

function parseMultiLangField(row: SheetRow, prefix: string): Record<string, string> {
    const result: Record<string, string> = {};
    const langCodes = ['en', 'ko', 'ja', 'th', 'zh'];

    for (const lang of langCodes) {
        const key = `${prefix}_${lang}`;
        const value = row[key]?.trim();
        if (value) {
            result[lang] = value;
        }
    }

    // Fallback: check for plain field name (e.g., "name" instead of "name_en")
    if (!result.en && row[prefix]?.trim()) {
        result.en = row[prefix].trim();
    }

    return result;
}

function parseCommaSeparated(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function parsePipeSeparated(value: string | undefined): string[] {
    if (!value) return [];
    return value.split('|').map(s => s.trim()).filter(s => s.length > 0);
}

function validateCategory(category: string): string {
    const normalized = category.trim();

    // Direct match
    if (REQUIRED_CATEGORIES.includes(normalized)) {
        return normalized;
    }

    // Case-insensitive match
    const found = REQUIRED_CATEGORIES.find(
        c => c.toLowerCase() === normalized.toLowerCase()
    );
    if (found) return found;

    // Extended categories
    const extended = ['Culture', 'Nature', 'Entertainment', 'Historic', 'Other'];
    const extFound = extended.find(c => c.toLowerCase() === normalized.toLowerCase());
    if (extFound) return extFound;

    // Default mapping for common variations
    const mappings: Record<string, string> = {
        'restaurant': 'Food',
        'restaurants': 'Food',
        'bar': 'Nightlife',
        'bars': 'Nightlife',
        'club': 'Nightlife',
        'shops': 'Shopping',
        'store': 'Shopping',
        'park': 'Outdoor',
        'nature': 'Outdoor',
        'museum': 'Culture',
        'gallery': 'Culture',
        'temple': 'Culture',
    };

    return mappings[normalized.toLowerCase()] || normalized;
}

function parseNumber(value: string | undefined, defaultVal: number): number {
    if (!value) return defaultVal;
    const num = parseFloat(value.trim());
    return isNaN(num) ? defaultVal : num;
}

// ============================================
// MAIN CONVERSION LOGIC
// ============================================

function convertRowToSpot(row: SheetRow, cityConfig: CityConfig): SpotOutput | null {
    // Required fields check
    const name = parseMultiLangField(row, 'name');
    const description = parseMultiLangField(row, 'description');
    const address = parseMultiLangField(row, 'address');
    const neighborhood = row['neighborhood']?.trim() || '';
    const category = row['category']?.trim() || '';
    const latitude = parseNumber(row['latitude'], 0);
    const longitude = parseNumber(row['longitude'], 0);
    const localleyScore = parseNumber(row['localley_score'] || row['score'], 0);

    // Validate required fields
    if (!name.en) {
        console.warn(`  Skipping row: missing name_en`);
        return null;
    }
    if (!description.en) {
        console.warn(`  Skipping "${name.en}": missing description_en`);
        return null;
    }
    if (!address.en) {
        console.warn(`  Skipping "${name.en}": missing address_en`);
        return null;
    }
    if (!neighborhood) {
        console.warn(`  Skipping "${name.en}": missing neighborhood`);
        return null;
    }
    if (!category) {
        console.warn(`  Skipping "${name.en}": missing category`);
        return null;
    }
    if (localleyScore < 1 || localleyScore > 6) {
        console.warn(`  Skipping "${name.en}": invalid localley_score (${localleyScore})`);
        return null;
    }
    if (latitude === 0 || longitude === 0) {
        console.warn(`  Warning "${name.en}": missing coordinates`);
    }

    // Parse optional fields
    const bestTimes = parseMultiLangField(row, 'best_times');
    const photos = parseCommaSeparated(row['photos']);
    const tips = parsePipeSeparated(row['tips_en'] || row['tips']);
    const subcategories = parseCommaSeparated(row['subcategories']);
    const localPercentage = parseNumber(row['local_percentage'], 50);
    const trendingScore = parseNumber(row['trending_score'], 0);
    const verified = row['verified']?.toLowerCase() === 'true';

    return {
        name,
        description,
        city: cityConfig.name,
        neighborhood,
        address,
        category: validateCategory(category),
        subcategories,
        localley_score: Math.round(localleyScore),
        local_percentage: Math.round(localPercentage),
        best_times: Object.keys(bestTimes).length > 0 ? bestTimes : { en: 'Anytime' },
        photos,
        tips,
        verified,
        trending_score: Math.min(1, Math.max(0, trendingScore)),
        latitude,
        longitude,
    };
}

async function fetchCsvFromSheets(url: string): Promise<string> {
    const sheetsId = extractSheetsId(url);
    if (!sheetsId) {
        throw new Error(`Invalid Google Sheets URL: ${url}`);
    }

    const gid = extractGid(url);
    const csvUrl = buildCsvExportUrl(sheetsId, gid);

    console.log(`📥 Fetching CSV from: ${csvUrl}`);

    const response = await fetch(csvUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // Check if we got an error page instead of CSV
    if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
        throw new Error('Sheet is not publicly accessible. Make sure "Anyone with the link can view" is enabled.');
    }

    return text;
}

function parseCsv(csvText: string): SheetRow[] {
    const records = parse(csvText, {
        columns: (header: string[]) => header.map(normalizeColumnName),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
    });

    return records as SheetRow[];
}

// ============================================
// CLI ENTRY POINT
// ============================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║          GOOGLE SHEETS TO JSON CONVERTER                   ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx tsx scripts/sheets-to-json.ts <url> --city=<slug>   ║
║                                                            ║
║  Options:                                                  ║
║    --city=slug   City slug (seoul, tokyo, bangkok, etc.)   ║
║    --batch-size  Spots per batch file (default: 15)        ║
║    --output-dir  Output directory (default: data/)         ║
║                                                            ║
║  Expected Columns:                                         ║
║    name_en, description_en, address_en (required)          ║
║    neighborhood, category, localley_score (required)       ║
║    latitude, longitude (required)                          ║
║    + optional: name_ko, photos, tips_en, etc.              ║
║                                                            ║
║  Example:                                                  ║
║    npx tsx scripts/sheets-to-json.ts \\                     ║
║      "https://docs.google.com/spreadsheets/d/..." \\        ║
║      --city=seoul                                          ║
╚════════════════════════════════════════════════════════════╝
        `);
        process.exit(0);
    }

    // Parse arguments
    const sheetsUrl = args.find(a => !a.startsWith('--'));
    const cityArg = args.find(a => a.startsWith('--city='))?.split('=')[1];
    const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '15', 10);
    const outputDir = args.find(a => a.startsWith('--output-dir='))?.split('=')[1] || 'data';

    if (!sheetsUrl) {
        console.error('❌ No Google Sheets URL provided');
        process.exit(1);
    }

    if (!cityArg) {
        console.error('❌ No city specified. Use --city=slug (e.g., --city=seoul)');
        console.log('   Available: seoul, tokyo, bangkok, singapore, osaka, kyoto, taipei, hong-kong, busan, jeju');
        process.exit(1);
    }

    const cityConfig = getCityBySlug(cityArg) || getCityByName(cityArg);
    if (!cityConfig) {
        console.error(`❌ Unknown city: ${cityArg}`);
        process.exit(1);
    }

    console.log(`\n🌍 SHEETS TO JSON CONVERTER`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`🏙️  City: ${cityConfig.name}`);
    console.log(`📊 Batch size: ${batchSize}`);
    console.log(`📁 Output: ${outputDir}/`);
    console.log(`${'─'.repeat(50)}\n`);

    try {
        // Fetch and parse CSV
        const csvText = await fetchCsvFromSheets(sheetsUrl);
        const rows = parseCsv(csvText);

        console.log(`✅ Parsed ${rows.length} rows from sheet\n`);

        // Log detected columns
        if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            console.log(`📋 Detected columns: ${columns.join(', ')}\n`);
        }

        // Convert rows to spots
        const spots: SpotOutput[] = [];
        let skipped = 0;

        for (const row of rows) {
            const spot = convertRowToSpot(row, cityConfig);
            if (spot) {
                spots.push(spot);
            } else {
                skipped++;
            }
        }

        console.log(`\n✅ Converted ${spots.length} spots (skipped ${skipped})\n`);

        if (spots.length === 0) {
            console.error('❌ No valid spots to export');
            process.exit(1);
        }

        // Split into batches
        const batches: BatchOutput[] = [];
        for (let i = 0; i < spots.length; i += batchSize) {
            batches.push({
                city: cityConfig.name,
                batch: batches.length + 1,
                spots: spots.slice(i, i + batchSize),
            });
        }

        // Ensure output directory exists
        const outPath = path.resolve(process.cwd(), outputDir);
        if (!fs.existsSync(outPath)) {
            fs.mkdirSync(outPath, { recursive: true });
        }

        // Write batch files
        const writtenFiles: string[] = [];
        for (const batch of batches) {
            const filename = `${cityConfig.slug}-spots-curated-batch${batch.batch}.json`;
            const filepath = path.join(outPath, filename);
            fs.writeFileSync(filepath, JSON.stringify(batch, null, 2));
            writtenFiles.push(filename);
            console.log(`  💾 ${filename} (${batch.spots.length} spots)`);
        }

        // Summary
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`📋 CONVERSION COMPLETE`);
        console.log(`${'═'.repeat(50)}`);
        console.log(`   Total spots: ${spots.length}`);
        console.log(`   Batch files: ${batches.length}`);
        console.log(`   Output dir:  ${outPath}`);
        console.log(`\n🚀 Next steps:`);
        console.log(`   1. Review the generated JSON files`);
        console.log(`   2. Run dry-run import:`);
        console.log(`      npx tsx scripts/import-spots.ts ${outputDir}/${writtenFiles[0]} --dry-run`);
        console.log(`   3. Run actual import:`);
        console.log(`      npx tsx scripts/import-spots.ts ${outputDir}/${writtenFiles[0]}`);
        console.log(`${'═'.repeat(50)}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

main();
