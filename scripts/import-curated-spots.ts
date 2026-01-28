/**
 * Curated Spots Import Script with Google Places API Enrichment
 *
 * Imports spots from Localley's curated Google Sheets format:
 *   - Interest (category with emoji)
 *   - Place/Activity (name)
 *   - Description
 *   - Budget ($ / $$ / $$$)
 *   - Local Level (Popular spots, Local favorites, etc.)
 *   - Status (optional - EXISTING/NEW)
 *
 * Uses Google Places API to find addresses and coordinates.
 *
 * Usage:
 *   npx tsx scripts/import-curated-spots.ts <google-sheets-url> --city=<city-slug>
 *   npx tsx scripts/import-curated-spots.ts "https://docs.google.com/spreadsheets/d/..." --city=seoul
 *   npx tsx scripts/import-curated-spots.ts "https://docs.google.com/spreadsheets/d/..." --city=seoul --dry-run
 *   npx tsx scripts/import-curated-spots.ts "https://docs.google.com/spreadsheets/d/..." --city=seoul --enrich-only
 *
 * Environment variables required:
 *   GOOGLE_PLACES_API_KEY - Google Places API key for geocoding
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';
import { getCityBySlug, getCityByName, CityConfig, REQUIRED_CATEGORIES } from '../lib/cities';

dotenv.config({ path: '.env.local' });

// ============================================
// TYPES
// ============================================

interface SheetRow {
    [key: string]: string;
}

interface PlaceDetails {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    neighborhood: string;
    placeId?: string;
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
    price_tier?: string;
    google_place_id?: string;
}

interface BatchOutput {
    city: string;
    batch: number;
    generatedAt: string;
    spots: SpotOutput[];
}

interface EnrichmentCache {
    [placeName: string]: PlaceDetails | null;
}

// ============================================
// CATEGORY MAPPING
// ============================================

// Map Interest column (with emoji) to categories
const INTEREST_TO_CATEGORY: Record<string, { category: string; subcategories: string[] }> = {
    // Food & Dining
    '🍜 food & dining': { category: 'Food', subcategories: ['Restaurant'] },
    'food & dining': { category: 'Food', subcategories: ['Restaurant'] },
    '🍜 food': { category: 'Food', subcategories: ['Restaurant'] },
    'food': { category: 'Food', subcategories: ['Restaurant'] },

    // Cafes
    '☕ cafes': { category: 'Cafe', subcategories: ['Coffee'] },
    '☕ cafe': { category: 'Cafe', subcategories: ['Coffee'] },
    'cafes': { category: 'Cafe', subcategories: ['Coffee'] },
    'cafe': { category: 'Cafe', subcategories: ['Coffee'] },

    // Nightlife
    '🍸 nightlife': { category: 'Nightlife', subcategories: ['Bar'] },
    '🍸 bars & nightlife': { category: 'Nightlife', subcategories: ['Bar'] },
    'nightlife': { category: 'Nightlife', subcategories: ['Bar'] },
    'bars': { category: 'Nightlife', subcategories: ['Bar'] },

    // Shopping
    '🛍️ shopping': { category: 'Shopping', subcategories: ['Retail'] },
    '🛍 shopping': { category: 'Shopping', subcategories: ['Retail'] },
    'shopping': { category: 'Shopping', subcategories: ['Retail'] },

    // Markets
    '🏪 markets': { category: 'Market', subcategories: ['Local Market'] },
    'markets': { category: 'Market', subcategories: ['Local Market'] },
    'market': { category: 'Market', subcategories: ['Local Market'] },

    // Outdoor & Nature
    '🌳 outdoor': { category: 'Outdoor', subcategories: ['Nature'] },
    '🌿 nature': { category: 'Outdoor', subcategories: ['Nature'] },
    '🏞️ outdoor': { category: 'Outdoor', subcategories: ['Nature'] },
    'outdoor': { category: 'Outdoor', subcategories: ['Nature'] },
    'nature': { category: 'Outdoor', subcategories: ['Nature'] },

    // Culture & Art
    '🎨 art & culture': { category: 'Culture', subcategories: ['Art', 'Museum'] },
    '🎨 culture': { category: 'Culture', subcategories: ['Art', 'Museum'] },
    'art & culture': { category: 'Culture', subcategories: ['Art', 'Museum'] },
    'culture': { category: 'Culture', subcategories: ['Art', 'Museum'] },
    'art': { category: 'Culture', subcategories: ['Art'] },

    // Entertainment
    '🎭 entertainment': { category: 'Entertainment', subcategories: ['Entertainment'] },
    '🎬 entertainment': { category: 'Entertainment', subcategories: ['Entertainment'] },
    'entertainment': { category: 'Entertainment', subcategories: ['Entertainment'] },

    // Historic
    '🏛️ historic': { category: 'Culture', subcategories: ['Historic', 'Temple'] },
    '⛩️ temples': { category: 'Culture', subcategories: ['Temple', 'Historic'] },
    'historic': { category: 'Culture', subcategories: ['Historic'] },
    'temples': { category: 'Culture', subcategories: ['Temple'] },

    // Wellness
    '🧘 wellness': { category: 'Outdoor', subcategories: ['Wellness', 'Spa'] },
    'wellness': { category: 'Outdoor', subcategories: ['Wellness'] },
    'spa': { category: 'Outdoor', subcategories: ['Spa', 'Wellness'] },

    // Neighborhoods (treat as Outdoor/Walking)
    '🏘️ neighborhoods': { category: 'Outdoor', subcategories: ['Walking', 'Neighborhood'] },
    'neighborhoods': { category: 'Outdoor', subcategories: ['Walking', 'Neighborhood'] },

    // History / Historic
    '🏛️ history': { category: 'Culture', subcategories: ['Historic', 'Museum'] },
    '🏛 history': { category: 'Culture', subcategories: ['Historic', 'Museum'] },
    'history': { category: 'Culture', subcategories: ['Historic'] },

    // Vintage & Thrift
    '🛋️ vintage & thrift': { category: 'Shopping', subcategories: ['Vintage', 'Thrift'] },
    '🛋 vintage & thrift': { category: 'Shopping', subcategories: ['Vintage', 'Thrift'] },
    'vintage & thrift': { category: 'Shopping', subcategories: ['Vintage', 'Thrift'] },
    'vintage': { category: 'Shopping', subcategories: ['Vintage'] },
    'thrift': { category: 'Shopping', subcategories: ['Thrift'] },

    // Activities / Experiences
    '🎯 activities': { category: 'Entertainment', subcategories: ['Activities'] },
    'activities': { category: 'Entertainment', subcategories: ['Activities'] },
    'experiences': { category: 'Entertainment', subcategories: ['Experiences'] },

    // Desserts / Bakery
    '🍰 desserts': { category: 'Food', subcategories: ['Dessert', 'Bakery'] },
    'desserts': { category: 'Food', subcategories: ['Dessert'] },
    'bakery': { category: 'Food', subcategories: ['Bakery'] },

    // Views / Scenery
    '🌅 views': { category: 'Outdoor', subcategories: ['Views', 'Scenic'] },
    'views': { category: 'Outdoor', subcategories: ['Views'] },
    'scenic': { category: 'Outdoor', subcategories: ['Scenic'] },

    // Beaches
    '🏖️ beaches': { category: 'Outdoor', subcategories: ['Beach', 'Nature'] },
    '🏖 beaches': { category: 'Outdoor', subcategories: ['Beach', 'Nature'] },
    'beaches': { category: 'Outdoor', subcategories: ['Beach'] },
    'beach': { category: 'Outdoor', subcategories: ['Beach'] },

    // Hot Springs / Onsen
    '♨️ hot springs': { category: 'Outdoor', subcategories: ['Hot Springs', 'Wellness'] },
    'hot springs': { category: 'Outdoor', subcategories: ['Hot Springs', 'Wellness'] },
    'onsen': { category: 'Outdoor', subcategories: ['Hot Springs', 'Wellness'] },

    // Day Trips
    '🚗 day trips': { category: 'Outdoor', subcategories: ['Day Trip', 'Excursion'] },
    'day trips': { category: 'Outdoor', subcategories: ['Day Trip'] },
    'day trip': { category: 'Outdoor', subcategories: ['Day Trip'] },
    'excursion': { category: 'Outdoor', subcategories: ['Excursion'] },

    // Attractions (general)
    '🎡 attractions': { category: 'Entertainment', subcategories: ['Attraction', 'Tourist'] },
    'attractions': { category: 'Entertainment', subcategories: ['Attraction'] },
    'attraction': { category: 'Entertainment', subcategories: ['Attraction'] },

    // New / Trending (map to Culture as catch-all)
    '🆕 2025 new': { category: 'Culture', subcategories: ['New', 'Trending'] },
    '🆕 new': { category: 'Culture', subcategories: ['New'] },
    '2025 new': { category: 'Culture', subcategories: ['New', 'Trending'] },
    'new': { category: 'Culture', subcategories: ['New'] },
};

// Map Local Level to localley_score (1-6)
const LOCAL_LEVEL_TO_SCORE: Record<string, number> = {
    // Score 1 - Tourist Trap
    'tourist hotspot': 1,
    'tourist spot': 1,
    'tourist spots': 1,
    'tourist trap': 1,
    // Score 2 - Tourist Friendly / Popular
    'tourist highlights': 2,
    'tourist highlight': 2,
    'popular spots': 2,
    'popular spot': 2,
    'well-known spots': 2,
    'well-known': 2,
    'iconic': 2,
    // Score 3 - Mixed Crowd
    'mixed crowd': 3,
    'mixed': 3,
    // Score 4 - Local Favorites
    'local favorites': 4,
    'local favorite': 4,
    'locals\' favorite': 4,
    'local favourites': 4,
    'locals only': 4,
    // Score 5 - Hidden Gem
    'hidden gems': 5,
    'hidden gem': 5,
    'secret spots': 5,
    'off the beaten path': 5,
    // Score 6 - Deep Local / Legendary
    'deep local secrets': 6,
    'deep local': 6,
    'legendary alley': 6,
    'legendary': 6,
    'ultra local': 6,
};

// Map budget to price tier
const BUDGET_TO_PRICE: Record<string, string> = {
    '$': '$',
    '$$': '$$',
    '$$$': '$$$',
    'free': '$',
    'budget': '$',
    'moderate': '$$',
    'expensive': '$$$',
};

// ============================================
// GOOGLE PLACES API (NEW)
// ============================================

// Using the new Places API (places.googleapis.com) which has different endpoints
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

// Cache for API calls (saves quota and speeds up re-runs)
let enrichmentCache: EnrichmentCache = {};
const CACHE_FILE = 'data/.enrichment-cache.json';

function loadCache(): void {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            enrichmentCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            console.log(`📦 Loaded ${Object.keys(enrichmentCache).length} cached places\n`);
        }
    } catch {
        enrichmentCache = {};
    }
}

function saveCache(): void {
    try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(enrichmentCache, null, 2));
    } catch (err) {
        console.warn('⚠️ Could not save cache:', err);
    }
}

async function searchPlace(
    placeName: string,
    city: string,
    apiKey: string
): Promise<PlaceDetails | null> {
    const cacheKey = `${placeName}|${city}`.toLowerCase();

    // Check cache
    if (cacheKey in enrichmentCache) {
        return enrichmentCache[cacheKey];
    }

    try {
        // Use the new Places API Text Search endpoint
        const searchUrl = 'https://places.googleapis.com/v1/places:searchText';

        const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents'
            },
            body: JSON.stringify({
                textQuery: `${placeName}, ${city}`,
                languageCode: 'en'
            })
        });

        const searchData = await searchResponse.json();

        // Check for errors
        if (searchData.error) {
            console.warn(`  ⚠️ API error for ${placeName}: ${searchData.error.message}`);
            enrichmentCache[cacheKey] = null;
            return null;
        }

        if (!searchData.places || searchData.places.length === 0) {
            console.warn(`  ⚠️ No results for: ${placeName}`);
            enrichmentCache[cacheKey] = null;
            return null;
        }

        const place = searchData.places[0];

        // Extract neighborhood from address components
        let neighborhood = '';
        if (place.addressComponents) {
            // Look for neighborhood, sublocality, or locality
            const neighborhoodComponent = place.addressComponents.find(
                (c: { types: string[] }) =>
                    c.types?.includes('neighborhood') ||
                    c.types?.includes('sublocality') ||
                    c.types?.includes('sublocality_level_1')
            );
            if (neighborhoodComponent) {
                neighborhood = neighborhoodComponent.longText || neighborhoodComponent.shortText || '';
            }
        }

        // Fallback: extract from formatted address
        if (!neighborhood && place.formattedAddress) {
            const addressParts = place.formattedAddress.split(',');
            if (addressParts.length >= 2) {
                neighborhood = addressParts[0].trim();
                if (/^\d/.test(neighborhood) || neighborhood.includes('Street') || neighborhood.includes('Road')) {
                    neighborhood = addressParts[1]?.trim() || addressParts[0].trim();
                }
            }
        }

        const result: PlaceDetails = {
            name: place.displayName?.text || placeName,
            address: place.formattedAddress || '',
            latitude: place.location?.latitude || 0,
            longitude: place.location?.longitude || 0,
            neighborhood: neighborhood,
            placeId: place.id,
        };

        enrichmentCache[cacheKey] = result;
        return result;

    } catch (error) {
        console.error(`  ❌ API error for ${placeName}:`, error);
        enrichmentCache[cacheKey] = null;
        return null;
    }
}

// ============================================
// HELPERS
// ============================================

function extractSheetsId(url: string): string | null {
    const patterns = [
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        /^([a-zA-Z0-9-_]+)$/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function normalizeColumnName(col: string): string {
    return col.toLowerCase().trim().replace(/\s+/g, '_').replace(/\//g, '_');
}

function parseInterest(interest: string): { category: string; subcategories: string[] } {
    const normalized = interest.toLowerCase().trim();

    // Check direct mapping
    if (INTEREST_TO_CATEGORY[normalized]) {
        return INTEREST_TO_CATEGORY[normalized];
    }

    // Try without emoji
    const withoutEmoji = normalized.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    if (INTEREST_TO_CATEGORY[withoutEmoji]) {
        return INTEREST_TO_CATEGORY[withoutEmoji];
    }

    // Fuzzy match
    for (const [key, value] of Object.entries(INTEREST_TO_CATEGORY)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return value;
        }
    }

    // Default
    console.warn(`  ⚠️ Unknown interest: "${interest}" - defaulting to Culture`);
    return { category: 'Culture', subcategories: [] };
}

function parseLocalLevel(level: string): number {
    const normalized = level.toLowerCase().trim();

    if (LOCAL_LEVEL_TO_SCORE[normalized]) {
        return LOCAL_LEVEL_TO_SCORE[normalized];
    }

    // Fuzzy match
    for (const [key, score] of Object.entries(LOCAL_LEVEL_TO_SCORE)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return score;
        }
    }

    // Default to middle score
    console.warn(`  ⚠️ Unknown local level: "${level}" - defaulting to 3`);
    return 3;
}

function parseBudget(budget: string): string {
    const normalized = budget.toLowerCase().trim();
    return BUDGET_TO_PRICE[normalized] || '$$';
}

function localScoreToPercentage(score: number): number {
    // Map 1-6 score to approximate local percentage
    const mapping: Record<number, number> = {
        1: 10,  // Tourist Trap
        2: 30,  // Tourist Friendly
        3: 50,  // Mixed Crowd
        4: 70,  // Local Favorite
        5: 85,  // Hidden Gem
        6: 95,  // Legendary Alley
    };
    return mapping[score] || 50;
}

async function fetchCsvFromSheets(url: string, gid?: string): Promise<string> {
    const sheetsId = extractSheetsId(url);
    if (!sheetsId) {
        throw new Error(`Invalid Google Sheets URL: ${url}`);
    }

    // Use the gviz endpoint which handles redirects better
    // Add gid parameter if specified to fetch a specific tab
    const gidParam = gid ? `&gid=${gid}` : '';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/gviz/tq?tqx=out:csv${gidParam}`;

    console.log(`📥 Fetching from: ${csvUrl}\n`);

    const response = await fetch(csvUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
        throw new Error('Sheet is not publicly accessible. Enable "Anyone with the link can view".');
    }

    return text;
}

function parseCsv(csvText: string): SheetRow[] {
    const records = parse(csvText, {
        columns: (header: string[]) => header.map(normalizeColumnName),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
    });

    return records as SheetRow[];
}

// ============================================
// MAIN CONVERSION LOGIC
// ============================================

async function convertRowToSpot(
    row: SheetRow,
    cityConfig: CityConfig,
    apiKey: string | undefined,
    skipEnrichment: boolean
): Promise<SpotOutput | null> {
    // Map columns from your sheet format
    const placeName = row['place_activity'] || row['place/activity'] || row['name'] || '';
    const description = row['description'] || '';
    const interest = row['interest'] || row['category'] || '';
    const budget = row['budget'] || '$$';
    const localLevel = row['local_level'] || row['local level'] || 'Popular spots';
    const status = row['status'] || '';

    // Skip if marked as EXISTING and we only want new ones
    // (Keeping this logic in case you want to filter later)

    if (!placeName) {
        console.warn(`  Skipping row: missing place name`);
        return null;
    }

    if (!description) {
        console.warn(`  Skipping "${placeName}": missing description`);
        return null;
    }

    // Parse category from Interest
    const { category, subcategories } = parseInterest(interest);

    // Parse localley score from Local Level
    const localleyScore = parseLocalLevel(localLevel);

    // Parse budget
    const priceTier = parseBudget(budget);

    // Get location data from Google Places API
    let placeDetails: PlaceDetails | null = null;

    if (!skipEnrichment && apiKey) {
        process.stdout.write(`  🔍 Looking up: ${placeName}...`);
        placeDetails = await searchPlace(placeName, cityConfig.name, apiKey);

        if (placeDetails) {
            console.log(` ✓ Found`);
        } else {
            console.log(` ✗ Not found`);
        }

        // Rate limit: 10 requests per second max for Places API
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Build spot output
    const spot: SpotOutput = {
        name: { en: placeName },
        description: { en: description },
        city: cityConfig.name,
        neighborhood: placeDetails?.neighborhood || '',
        address: { en: placeDetails?.address || `${placeName}, ${cityConfig.name}` },
        category,
        subcategories,
        localley_score: localleyScore,
        local_percentage: localScoreToPercentage(localleyScore),
        best_times: { en: 'Anytime' },
        photos: [],
        tips: [],
        verified: false,
        trending_score: 0,
        latitude: placeDetails?.latitude || 0,
        longitude: placeDetails?.longitude || 0,
        price_tier: priceTier,
        google_place_id: placeDetails?.placeId,
    };

    return spot;
}

// ============================================
// CLI ENTRY POINT
// ============================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║        LOCALLEY CURATED SPOTS IMPORTER                         ║
╠════════════════════════════════════════════════════════════════╣
║  Imports spots from Localley's Google Sheets format            ║
║  with automatic Google Places API enrichment.                  ║
║                                                                ║
║  Usage:                                                        ║
║    npx tsx scripts/import-curated-spots.ts <url> --city=<slug> ║
║                                                                ║
║  Options:                                                      ║
║    --city=slug      City slug (required)                       ║
║    --gid=ID         Sheet tab ID (for multi-tab sheets)        ║
║    --dry-run        Preview without saving                     ║
║    --skip-enrich    Skip Google Places lookup                  ║
║    --batch-size=N   Spots per batch file (default: 25)         ║
║    --output-dir=DIR Output directory (default: data/)          ║
║                                                                ║
║  Environment:                                                  ║
║    GOOGLE_PLACES_API_KEY  Required for address/coord lookup    ║
║                                                                ║
║  Sheet Format Expected:                                        ║
║    Interest, Place/Activity, Description, Budget, Local Level  ║
║                                                                ║
║  Example:                                                      ║
║    npx tsx scripts/import-curated-spots.ts \\                   ║
║      "https://docs.google.com/spreadsheets/d/1zpG..." \\        ║
║      --city=seoul                                              ║
╚════════════════════════════════════════════════════════════════╝
        `);
        process.exit(0);
    }

    // Parse arguments
    const sheetsUrl = args.find(a => !a.startsWith('--'));
    const cityArg = args.find(a => a.startsWith('--city='))?.split('=')[1];
    const gidArg = args.find(a => a.startsWith('--gid='))?.split('=')[1];
    const dryRun = args.includes('--dry-run');
    const skipEnrich = args.includes('--skip-enrich');
    const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '25', 10);
    const outputDir = args.find(a => a.startsWith('--output-dir='))?.split('=')[1] || 'data';

    if (!sheetsUrl) {
        console.error('❌ No Google Sheets URL provided');
        process.exit(1);
    }

    if (!cityArg) {
        console.error('❌ No city specified. Use --city=slug');
        console.log('   Available: seoul, tokyo, bangkok, singapore, busan, taipei, etc.');
        process.exit(1);
    }

    const cityConfig = getCityBySlug(cityArg) || getCityByName(cityArg);
    if (!cityConfig) {
        console.error(`❌ Unknown city: ${cityArg}`);
        process.exit(1);
    }

    // Try both env var names for the API key
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey && !skipEnrich) {
        console.warn('⚠️  No Google API key found. Set GOOGLE_PLACES_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
        console.warn('   Use --skip-enrich to import without addresses/coordinates.\n');
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  LOCALLEY CURATED SPOTS IMPORTER`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  🏙️  City:        ${cityConfig.name}`);
    console.log(`  📑 Tab (gid):   ${gidArg || 'default (first tab)'}`);
    console.log(`  📊 Batch size:  ${batchSize}`);
    console.log(`  📁 Output:      ${outputDir}/`);
    console.log(`  🔧 Mode:        ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`  🗺️  Enrichment:  ${skipEnrich ? 'SKIPPED' : apiKey ? 'ENABLED' : 'DISABLED (no API key)'}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Load cache
    loadCache();

    try {
        // Fetch and parse CSV
        const csvText = await fetchCsvFromSheets(sheetsUrl, gidArg);
        const rows = parseCsv(csvText);

        console.log(`✅ Parsed ${rows.length} rows from sheet\n`);

        // Log detected columns
        if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            console.log(`📋 Columns: ${columns.join(', ')}\n`);
        }

        // Convert rows to spots
        const spots: SpotOutput[] = [];
        let skipped = 0;
        let enriched = 0;
        let notFound = 0;

        console.log(`🔄 Processing spots...\n`);

        for (const row of rows) {
            const spot = await convertRowToSpot(row, cityConfig, apiKey, skipEnrich);
            if (spot) {
                spots.push(spot);
                if (spot.latitude !== 0) enriched++;
                else notFound++;
            } else {
                skipped++;
            }
        }

        // Save cache after processing
        saveCache();

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📊 PROCESSING SUMMARY`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`   Total rows:    ${rows.length}`);
        console.log(`   Valid spots:   ${spots.length}`);
        console.log(`   Skipped:       ${skipped}`);
        console.log(`   With coords:   ${enriched}`);
        console.log(`   Missing coords: ${notFound}`);

        if (spots.length === 0) {
            console.error('\n❌ No valid spots to export');
            process.exit(1);
        }

        if (dryRun) {
            console.log(`\n📝 DRY RUN - Sample output (first 3 spots):\n`);
            console.log(JSON.stringify(spots.slice(0, 3), null, 2));
            console.log(`\n✅ Dry run complete. Run without --dry-run to save files.`);
            process.exit(0);
        }

        // Split into batches
        const batches: BatchOutput[] = [];
        for (let i = 0; i < spots.length; i += batchSize) {
            batches.push({
                city: cityConfig.name,
                batch: batches.length + 1,
                generatedAt: new Date().toISOString(),
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
        console.log(`\n💾 Writing batch files:\n`);

        for (const batch of batches) {
            // Include gid in filename if specified to avoid overwriting files from other tabs
            const gidSuffix = gidArg ? `-gid${gidArg}` : '';
            const filename = `${cityConfig.slug}-curated${gidSuffix}-batch${batch.batch}.json`;
            const filepath = path.join(outPath, filename);
            fs.writeFileSync(filepath, JSON.stringify(batch, null, 2));
            writtenFiles.push(filename);
            console.log(`   ${filename} (${batch.spots.length} spots)`);
        }

        // Summary
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  ✅ IMPORT COMPLETE`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`   Total spots: ${spots.length}`);
        console.log(`   Batch files: ${batches.length}`);
        console.log(`   Output dir:  ${outPath}`);
        console.log(`\n🚀 Next steps:`);
        console.log(`   1. Review: cat ${outputDir}/${writtenFiles[0]}`);
        console.log(`   2. Dry-run: npx tsx scripts/import-spots.ts ${outputDir}/${writtenFiles[0]} --dry-run`);
        console.log(`   3. Import:  npx tsx scripts/import-spots.ts ${outputDir}/${writtenFiles[0]}`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

main();
