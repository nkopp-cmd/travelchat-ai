/**
 * Geocode Spots Script (Nominatim)
 *
 * Batch-geocodes spots missing GPS coordinates using the free
 * OpenStreetMap Nominatim API. Reads enriched JSON batch files,
 * queries Nominatim with multi-strategy search, validates results
 * against city bounding boxes, and updates files in-place.
 *
 * Usage:
 *   npx tsx scripts/geocode-spots.ts              # Full run
 *   npx tsx scripts/geocode-spots.ts --city=seoul  # One city only
 *   npx tsx scripts/geocode-spots.ts --dry-run     # Search but don't write
 *   npx tsx scripts/geocode-spots.ts --report      # Show status table only
 *
 * Features:
 *   - Resumable via cache file (data/geocode-cache.json)
 *   - Multi-strategy queries (name+neighborhood, name+country, local name, address)
 *   - Bounding box validation per city
 *   - Pre-seeded with manually-researched coordinates
 *   - Respects Nominatim 1 req/sec rate limit
 */

import * as fs from "fs";
import * as path from "path";
import { ALL_CITIES, getCityBySlug, getCityByName, type CityConfig } from "../lib/cities";

// ============================================
// TYPES
// ============================================

interface MultiLang {
    [key: string]: string;
}

interface SpotData {
    name: MultiLang | string;
    description?: MultiLang | string;
    city?: string;
    neighborhood?: string;
    address?: MultiLang | string;
    category?: string;
    subcategories?: string[];
    localley_score?: number;
    local_percentage?: number;
    best_time?: string;
    best_times?: MultiLang;
    photos?: string[];
    tips?: string[] | Record<string, string[]>;
    verified?: boolean;
    trending_score?: number;
    latitude?: number;
    longitude?: number;
    [key: string]: unknown;
}

interface BatchFile {
    city: string;
    batch: number;
    generatedAt?: string;
    spots: SpotData[];
}

interface GeocodeCacheEntry {
    lat: number;
    lng: number;
    source: "nominatim" | "manual" | "crossref";
    query?: string;
    timestamp?: string;
}

interface GeocodeCache {
    [spotKey: string]: GeocodeCacheEntry | null;
}

interface CityBounds {
    latMin: number;
    latMax: number;
    lngMin: number;
    lngMax: number;
}

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
    class: string;
    type: string;
    importance: number;
}

// ============================================
// CONSTANTS
// ============================================

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "LocalleySpotGeocoder/1.0 (localley.io)";
const RATE_LIMIT_MS = 1100;

const DATA_DIR = path.join(process.cwd(), "data", "enriched");
const CACHE_FILE = path.join(process.cwd(), "data", "geocode-cache.json");

// ============================================
// CITY BOUNDING BOXES
// ============================================

const CITY_BOUNDS: Record<string, CityBounds> = {
    "seoul":         { latMin: 37.35, latMax: 37.75, lngMin: 126.70, lngMax: 127.25 },
    "tokyo":         { latMin: 35.50, latMax: 35.82, lngMin: 139.05, lngMax: 139.92 },
    "bangkok":       { latMin: 13.55, latMax: 13.95, lngMin: 100.30, lngMax: 100.75 },
    "singapore":     { latMin: 1.20,  latMax: 1.48,  lngMin: 103.60, lngMax: 104.05 },
    "hong-kong":     { latMin: 22.15, latMax: 22.55, lngMin: 113.83, lngMax: 114.35 },
    "kyoto":         { latMin: 34.85, latMax: 35.15, lngMin: 135.60, lngMax: 135.90 },
    "osaka":         { latMin: 34.50, latMax: 34.85, lngMin: 135.30, lngMax: 135.70 },
    "taipei":        { latMin: 24.80, latMax: 25.30, lngMin: 121.30, lngMax: 122.00 },
    "busan":         { latMin: 35.05, latMax: 35.25, lngMin: 128.90, lngMax: 129.20 },
    "hanoi":         { latMin: 20.90, latMax: 21.10, lngMin: 105.72, lngMax: 105.95 },
    "ho-chi-minh":   { latMin: 10.70, latMax: 10.90, lngMin: 106.55, lngMax: 106.80 },
    "chiang-mai":    { latMin: 18.70, latMax: 18.85, lngMin: 98.90, lngMax: 99.05 },
    "kuala-lumpur":  { latMin: 3.05,  latMax: 3.25,  lngMin: 101.60, lngMax: 101.80 },
    "bali-ubud":     { latMin: -8.85, latMax: -8.20, lngMin: 115.05, lngMax: 115.50 },
    "da-nang":       { latMin: 15.95, latMax: 16.15, lngMin: 108.15, lngMax: 108.30 },
    "manila":        { latMin: 14.45, latMax: 14.75, lngMin: 120.90, lngMax: 121.10 },
    "phuket":        { latMin: 7.75,  latMax: 7.95,  lngMin: 98.25, lngMax: 98.45 },
    "siem-reap":     { latMin: 13.30, latMax: 13.45, lngMin: 103.80, lngMax: 103.90 },
    "hoi-an":        { latMin: 15.85, latMax: 15.92, lngMin: 108.30, lngMax: 108.40 },
    "luang-prabang": { latMin: 19.85, latMax: 19.92, lngMin: 102.10, lngMax: 102.18 },
    "jeju":          { latMin: 33.20, latMax: 33.55, lngMin: 126.15, lngMax: 126.95 },
    "fukuoka":       { latMin: 33.50, latMax: 33.70, lngMin: 130.30, lngMax: 130.50 },
    "yokohama":      { latMin: 35.35, latMax: 35.55, lngMin: 139.55, lngMax: 139.75 },
    "nara":          { latMin: 34.65, latMax: 34.75, lngMin: 135.78, lngMax: 135.88 },
    "penang":        { latMin: 5.25,  latMax: 5.50,  lngMin: 100.18, lngMax: 100.40 },
    "johor-bahru":   { latMin: 1.45,  latMax: 1.60,  lngMin: 103.65, lngMax: 103.85 },
};

// ============================================
// MANUAL SEED COORDINATES
// ============================================

const MANUAL_COORDINATES: Record<string, { lat: number; lng: number }> = {
    // Seoul - Itaewon/Hannam/HBC/Yongsan
    "seoul:itaewon antique furniture street": { lat: 37.5317, lng: 126.9949 },
    "seoul:itaewon global village food street": { lat: 37.5348, lng: 126.9943 },
    "seoul:hamilton hotel shopping area": { lat: 37.5347, lng: 126.9937 },
    "seoul:leeum samsung museum of art": { lat: 37.5385, lng: 126.9988 },
    "seoul:war memorial of korea": { lat: 37.5365, lng: 126.9771 },
    "seoul:grand hyatt seoul": { lat: 37.5393, lng: 126.9971 },
    "seoul:hannam dong cafe street": { lat: 37.5340, lng: 127.0028 },
    "seoul:blue square": { lat: 37.5408, lng: 127.0020 },
    "seoul:d museum": { lat: 37.5372, lng: 127.0114 },
    "seoul:hannam bridge area": { lat: 37.5267, lng: 127.0133 },
    "seoul:take urban": { lat: 37.5344, lng: 127.0040 },
    "seoul:haebangchon hill": { lat: 37.5435, lng: 126.9856 },
    "seoul:usadan gil": { lat: 37.5355, lng: 126.9927 },
    "seoul:hbc cafe street": { lat: 37.5419, lng: 126.9870 },
    "seoul:noksapyeong station cafe street": { lat: 37.5349, lng: 126.9866 },
    "seoul:gyeongnidan gil": { lat: 37.5400, lng: 126.9920 },
    "seoul:yongsan electronics market": { lat: 37.5337, lng: 126.9644 },
    "seoul:national museum of korea": { lat: 37.5239, lng: 126.9803 },
    "seoul:yongsan family park": { lat: 37.5224, lng: 126.9831 },
    "seoul:amorepacific headquarters": { lat: 37.5360, lng: 126.9714 },
    "seoul:dragon hill spa": { lat: 37.5272, lng: 126.9641 },
    // Bangkok - Old City/Chinatown/Silom/Sukhumvit
    "bangkok:grand palace": { lat: 13.7500, lng: 100.4914 },
    "bangkok:wat pho": { lat: 13.7466, lng: 100.4909 },
    "bangkok:wat arun": { lat: 13.7435, lng: 100.4874 },
    "bangkok:khaosan road": { lat: 13.7589, lng: 100.4972 },
    "bangkok:sanam luang": { lat: 13.7544, lng: 100.4930 },
    "bangkok:national museum bangkok": { lat: 13.7576, lng: 100.4925 },
    "bangkok:wat saket golden mount": { lat: 13.7539, lng: 100.5067 },
    "bangkok:phra athit road": { lat: 13.7620, lng: 100.4941 },
    "bangkok:democracy monument": { lat: 13.7567, lng: 100.5018 },
    "bangkok:amulet market tha phra chan": { lat: 13.7534, lng: 100.4895 },
    "bangkok:yaowarat road": { lat: 13.7411, lng: 100.5083 },
    "bangkok:wat mangkon kamalawat": { lat: 13.7395, lng: 100.5058 },
    "bangkok:talat noi street art": { lat: 13.7370, lng: 100.5133 },
    "bangkok:charoen krung road": { lat: 13.7370, lng: 100.5133 },
    "bangkok:soi nana chinatown": { lat: 13.7394, lng: 100.5143 },
    "bangkok:sampeng lane": { lat: 13.7438, lng: 100.5030 },
    "bangkok:silom road": { lat: 13.7248, lng: 100.5240 },
    "bangkok:patpong night market": { lat: 13.7289, lng: 100.5292 },
    "bangkok:lumphini park": { lat: 13.7306, lng: 100.5417 },
    "bangkok:mahanakhon skywalk": { lat: 13.7212, lng: 100.5237 },
    "bangkok:state tower lebua sky bar": { lat: 13.7193, lng: 100.5172 },
    "bangkok:sri maha mariamman temple": { lat: 13.7242, lng: 100.5229 },
    "bangkok:silom complex": { lat: 13.7282, lng: 100.5351 },
    "bangkok:terminal 21": { lat: 13.7379, lng: 100.5604 },
    "bangkok:emquartier": { lat: 13.7320, lng: 100.5695 },
    "bangkok:emporium": { lat: 13.7307, lng: 100.5689 },
    "bangkok:khlong toei market": { lat: 13.7181, lng: 100.5707 },
    "bangkok:nana plaza": { lat: 13.7381, lng: 100.5519 },
    "bangkok:thonglor sukhumvit soi 55": { lat: 13.7384, lng: 100.5663 },
    "bangkok:ekkamai sukhumvit soi 63": { lat: 13.7196, lng: 100.5851 },
    "bangkok:phrom phong bts area": { lat: 13.7314, lng: 100.5661 },
};

// ============================================
// HELPERS
// ============================================

function getEn(value: string | MultiLang | undefined): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.en || Object.values(value)[0] || "";
}

function getLocalName(name: string | MultiLang | undefined, cityConfig: CityConfig): string {
    if (!name || typeof name === "string") return "";
    const localLang = cityConfig.languages.find((l: string) => l !== "en");
    if (!localLang) return "";
    return (name as MultiLang)[localLang] || "";
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SLUG_MAP: Record<string, string> = {
    "seoul": "seoul",
    "tokyo": "tokyo",
    "bangkok": "bangkok",
    "singapore": "singapore",
    "hong kong": "hong-kong",
    "hong_kong": "hong-kong",
    "hongkong": "hong-kong",
    "kyoto": "kyoto",
    "osaka": "osaka",
    "taipei": "taipei",
    "busan": "busan",
    "hanoi": "hanoi",
    "ho chi minh city": "ho-chi-minh",
    "ho chi minh": "ho-chi-minh",
    "chiang mai": "chiang-mai",
    "kuala lumpur": "kuala-lumpur",
    "ubud, bali": "bali-ubud",
    "bali": "bali-ubud",
    "ubud": "bali-ubud",
    "da nang": "da-nang",
    "manila": "manila",
    "phuket": "phuket",
    "siem reap": "siem-reap",
    "hoi an": "hoi-an",
    "luang prabang": "luang-prabang",
    "jeju": "jeju",
    "fukuoka": "fukuoka",
    "yokohama": "yokohama",
    "nara": "nara",
    "penang": "penang",
    "johor bahru": "johor-bahru",
};

function normalizeSlug(city: string): string {
    const lower = city.toLowerCase().trim();
    return SLUG_MAP[lower] || lower.replace(/\s+/g, "-");
}

function makeCacheKey(citySlug: string, nameEn: string): string {
    return `${citySlug}:${normalizeString(nameEn)}`;
}

function isInBounds(lat: number, lng: number, citySlug: string): boolean {
    const bounds = CITY_BOUNDS[citySlug];
    if (!bounds) return true;
    return (
        lat >= bounds.latMin &&
        lat <= bounds.latMax &&
        lng >= bounds.lngMin &&
        lng <= bounds.lngMax
    );
}

function findCityConfig(citySlug: string): CityConfig | undefined {
    return getCityBySlug(citySlug) || getCityByName(citySlug);
}

// ============================================
// NOMINATIM API
// ============================================

let retryCount = 0;

async function queryNominatim(
    query: string,
    citySlug: string
): Promise<{ lat: number; lng: number } | null> {
    const bounds = CITY_BOUNDS[citySlug];
    const url = new URL(NOMINATIM_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "3");
    url.searchParams.set("addressdetails", "1");

    if (bounds) {
        url.searchParams.set(
            "viewbox",
            `${bounds.lngMin},${bounds.latMax},${bounds.lngMax},${bounds.latMin}`
        );
        url.searchParams.set("bounded", "0");
    }

    try {
        const response = await fetch(url.toString(), {
            headers: { "User-Agent": USER_AGENT },
        });

        if (!response.ok) {
            if (response.status === 429 && retryCount < 3) {
                retryCount++;
                console.log(`   Rate limited, waiting 5s (retry ${retryCount}/3)...`);
                await sleep(5000);
                const result = await queryNominatim(query, citySlug);
                retryCount = 0;
                return result;
            }
            console.error(`   Nominatim HTTP ${response.status}`);
            return null;
        }

        retryCount = 0;
        const results: NominatimResult[] = await response.json();

        for (const result of results) {
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lon);
            if (isInBounds(lat, lng, citySlug)) {
                return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
            }
        }

        return null;
    } catch (error) {
        console.error(`   Network error: ${error}`);
        return null;
    }
}

// ============================================
// MULTI-STRATEGY GEOCODING
// ============================================

async function geocodeSpot(
    spot: SpotData,
    citySlug: string,
    cityConfig: CityConfig
): Promise<{ lat: number; lng: number; queryUsed: string } | null> {
    const nameEn = getEn(spot.name);
    const neighborhood = spot.neighborhood || "";
    const cityName = cityConfig.name;
    const country = cityConfig.country;
    const localName = getLocalName(spot.name, cityConfig);
    const address = getEn(spot.address);

    const queries: string[] = [];

    // Strategy 1: name + neighborhood + city (most precise)
    if (neighborhood) {
        queries.push(`${nameEn}, ${neighborhood}, ${cityName}`);
    }

    // Strategy 2: name + city + country
    queries.push(`${nameEn}, ${cityName}, ${country}`);

    // Strategy 3: local language name + city
    if (localName) {
        queries.push(`${localName}, ${cityName}`);
    }

    // Strategy 4: just name + city
    queries.push(`${nameEn}, ${cityName}`);

    // Strategy 5: address field
    if (address && address.length > cityName.length + 5) {
        queries.push(address);
    }

    // Deduplicate
    const uniqueQueries = [...new Set(queries)];

    for (const query of uniqueQueries) {
        await sleep(RATE_LIMIT_MS);
        const result = await queryNominatim(query, citySlug);
        if (result) {
            return { ...result, queryUsed: query };
        }
    }

    return null;
}

// ============================================
// CACHE MANAGEMENT
// ============================================

function loadCache(): GeocodeCache {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
            console.log(`Loaded ${Object.keys(data).length} cached entries`);
            return data;
        }
    } catch (err) {
        console.error(`Warning: Could not load cache: ${err}`);
    }
    return {};
}

function saveCache(cache: GeocodeCache): void {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function seedCacheWithManualData(cache: GeocodeCache): number {
    let seeded = 0;
    for (const [key, coords] of Object.entries(MANUAL_COORDINATES)) {
        if (!(key in cache)) {
            cache[key] = {
                lat: coords.lat,
                lng: coords.lng,
                source: "manual",
                timestamp: new Date().toISOString(),
            };
            seeded++;
        }
    }
    return seeded;
}

// ============================================
// FILE I/O
// ============================================

function readBatchFiles(
    dataDir: string,
    cityFilter?: string
): { file: string; data: BatchFile }[] {
    const files = fs
        .readdirSync(dataDir)
        .filter((f) => f.endsWith(".json") && !f.startsWith(".") && !f.startsWith("_"));

    const batches: { file: string; data: BatchFile }[] = [];

    for (const file of files) {
        try {
            const raw = JSON.parse(
                fs.readFileSync(path.join(dataDir, file), "utf-8")
            );
            if (!raw.spots || !Array.isArray(raw.spots)) continue;

            const batchData: BatchFile = {
                city: raw.city || "",
                batch: raw.batch || 0,
                generatedAt: raw.generatedAt,
                spots: raw.spots,
            };

            if (cityFilter) {
                const batchSlug = normalizeSlug(batchData.city);
                const filterSlug = normalizeSlug(cityFilter);
                if (batchSlug !== filterSlug) continue;
            }

            batches.push({ file, data: batchData });
        } catch (err) {
            console.error(`Warning: Error reading ${file}: ${err}`);
        }
    }

    return batches;
}

function applyCoordinatesToFiles(
    batches: { file: string; data: BatchFile }[],
    cache: GeocodeCache
): { updatedFiles: number; updatedSpots: number } {
    let updatedFiles = 0;
    let updatedSpots = 0;

    for (const batch of batches) {
        const citySlug = normalizeSlug(batch.data.city);
        let fileModified = false;

        for (const spot of batch.data.spots) {
            if (hasCoordinates(spot)) continue;

            const nameEn = getEn(spot.name);
            const key = makeCacheKey(citySlug, nameEn);
            const cached = cache[key];

            if (cached) {
                spot.latitude = cached.lat;
                spot.longitude = cached.lng;
                fileModified = true;
                updatedSpots++;
            }
        }

        if (fileModified) {
            const filePath = path.join(DATA_DIR, batch.file);
            fs.writeFileSync(filePath, JSON.stringify(batch.data, null, 2));
            updatedFiles++;
        }
    }

    return { updatedFiles, updatedSpots };
}

// ============================================
// REPORTING
// ============================================

function printReport(
    batches: { file: string; data: BatchFile }[],
    cache: GeocodeCache
): void {
    const cityStats: Record<
        string,
        { total: number; hasCoords: number; inCache: number; notFound: number; missing: number }
    > = {};

    for (const batch of batches) {
        const citySlug = normalizeSlug(batch.data.city);
        if (!cityStats[citySlug]) {
            cityStats[citySlug] = { total: 0, hasCoords: 0, inCache: 0, notFound: 0, missing: 0 };
        }
        const stats = cityStats[citySlug];

        for (const spot of batch.data.spots) {
            stats.total++;
            if (hasCoordinates(spot)) {
                stats.hasCoords++;
            } else {
                const key = makeCacheKey(citySlug, getEn(spot.name));
                if (key in cache) {
                    if (cache[key] !== null) {
                        stats.inCache++;
                    } else {
                        stats.notFound++;
                    }
                } else {
                    stats.missing++;
                }
            }
        }
    }

    console.log("\nGEOCODING STATUS REPORT");
    console.log("=".repeat(70));
    console.log(
        "City".padEnd(20) +
            "Total".padEnd(8) +
            "Have".padEnd(8) +
            "Cached".padEnd(8) +
            "Failed".padEnd(8) +
            "ToDo"
    );
    console.log("-".repeat(70));

    let grandTotal = 0,
        grandHave = 0,
        grandCached = 0,
        grandNotFound = 0,
        grandMissing = 0;

    for (const [slug, stats] of Object.entries(cityStats).sort()) {
        console.log(
            slug.padEnd(20) +
                String(stats.total).padEnd(8) +
                String(stats.hasCoords).padEnd(8) +
                String(stats.inCache).padEnd(8) +
                String(stats.notFound).padEnd(8) +
                String(stats.missing)
        );
        grandTotal += stats.total;
        grandHave += stats.hasCoords;
        grandCached += stats.inCache;
        grandNotFound += stats.notFound;
        grandMissing += stats.missing;
    }

    console.log("-".repeat(70));
    console.log(
        "TOTAL".padEnd(20) +
            String(grandTotal).padEnd(8) +
            String(grandHave).padEnd(8) +
            String(grandCached).padEnd(8) +
            String(grandNotFound).padEnd(8) +
            String(grandMissing)
    );
    console.log("=".repeat(70));
}

// ============================================
// MAIN
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const reportOnly = args.includes("--report");
    const retryMode = args.includes("--retry");
    const cityFilter = args.find((a) => a.startsWith("--city="))?.split("=")[1];

    console.log("\nGEOCODE SPOTS - OpenStreetMap Nominatim");
    console.log("=".repeat(50));
    console.log(`Mode: ${reportOnly ? "REPORT ONLY" : dryRun ? "DRY RUN" : "LIVE"}${retryMode ? " + RETRY" : ""}`);
    if (cityFilter) console.log(`City filter: ${cityFilter}`);

    // Load cache and seed manual data
    const cache = loadCache();

    // In retry mode, clear all null entries (previously failed) so they get re-queried
    if (retryMode) {
        let cleared = 0;
        for (const key of Object.keys(cache)) {
            if (cache[key] === null) {
                if (cityFilter) {
                    const filterSlug = normalizeSlug(cityFilter);
                    if (key.startsWith(filterSlug + ":")) {
                        delete cache[key];
                        cleared++;
                    }
                } else {
                    delete cache[key];
                    cleared++;
                }
            }
        }
        if (cleared > 0) {
            console.log(`Retry mode: cleared ${cleared} previously-failed cache entries`);
            saveCache(cache);
        }
    }

    const seeded = seedCacheWithManualData(cache);
    if (seeded > 0) {
        console.log(`Seeded ${seeded} manually-researched coordinates`);
        saveCache(cache);
    }

    // Read batch files
    const batches = readBatchFiles(DATA_DIR, cityFilter);
    console.log(`Found ${batches.length} batch files`);

    if (batches.length === 0) {
        console.log("No batch files found. Check DATA_DIR path.");
        return;
    }

    // Identify spots needing geocoding
    let totalSpots = 0;
    let alreadyHaveCoords = 0;
    let inCache = 0;
    let cacheNotFound = 0;

    const spotsToProcess: {
        spot: SpotData;
        citySlug: string;
        cacheKey: string;
    }[] = [];

    for (const batch of batches) {
        const citySlug = normalizeSlug(batch.data.city);

        for (const spot of batch.data.spots) {
            totalSpots++;

            if (hasCoordinates(spot)) {
                alreadyHaveCoords++;
                continue;
            }

            const nameEn = getEn(spot.name);
            if (!nameEn) continue;

            const key = makeCacheKey(citySlug, nameEn);

            if (key in cache) {
                if (cache[key] !== null) {
                    inCache++;
                } else {
                    cacheNotFound++;
                }
                continue;
            }

            spotsToProcess.push({ spot, citySlug, cacheKey: key });
        }
    }

    console.log(`\nTotal spots: ${totalSpots}`);
    console.log(`Already have coords: ${alreadyHaveCoords}`);
    console.log(`In cache (found): ${inCache}`);
    console.log(`In cache (not found): ${cacheNotFound}`);
    console.log(`Need geocoding: ${spotsToProcess.length}`);

    if (reportOnly) {
        printReport(batches, cache);
        return;
    }

    // Geocode spots
    let foundCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    if (spotsToProcess.length > 0) {
        const estMinutes = Math.ceil((spotsToProcess.length * 2 * RATE_LIMIT_MS) / 60000);
        console.log(`\nEstimated time: ~${estMinutes} minutes`);
        console.log("Starting geocoding...\n");
    }

    for (let i = 0; i < spotsToProcess.length; i++) {
        const { spot, citySlug, cacheKey } = spotsToProcess[i];
        const nameEn = getEn(spot.name);
        const cityConfig = findCityConfig(citySlug);

        if (!cityConfig) {
            console.log(
                `[${i + 1}/${spotsToProcess.length}] Unknown city: ${citySlug} - skipping "${nameEn}"`
            );
            errorCount++;
            continue;
        }

        process.stdout.write(
            `[${i + 1}/${spotsToProcess.length}] ${nameEn} (${cityConfig.name})... `
        );

        try {
            const result = await geocodeSpot(spot, citySlug, cityConfig);

            if (result) {
                cache[cacheKey] = {
                    lat: result.lat,
                    lng: result.lng,
                    source: "nominatim",
                    query: result.queryUsed,
                    timestamp: new Date().toISOString(),
                };
                console.log(`${result.lat}, ${result.lng}`);
                foundCount++;
            } else {
                cache[cacheKey] = null;
                console.log("not found");
                notFoundCount++;
            }
        } catch (err) {
            console.log(`error: ${err}`);
            errorCount++;
        }

        // Save cache every 25 spots
        if ((i + 1) % 25 === 0) {
            saveCache(cache);
            const pct = Math.round(((i + 1) / spotsToProcess.length) * 100);
            console.log(`--- Cache saved (${pct}% done, ${foundCount} found so far) ---`);
        }
    }

    // Save final cache
    saveCache(cache);

    // Apply coordinates to files
    if (!dryRun) {
        console.log("\nApplying coordinates to enriched files...");
        const { updatedFiles, updatedSpots } = applyCoordinatesToFiles(batches, cache);
        console.log(`Updated ${updatedSpots} spots across ${updatedFiles} files`);
    } else {
        console.log("\nDRY RUN - no files were modified.");
    }

    // Final report
    console.log("\n" + "=".repeat(50));
    console.log("GEOCODING COMPLETE");
    console.log("=".repeat(50));
    console.log(`Newly found: ${foundCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Cache total: ${Object.keys(cache).length}`);

    // Print full report
    printReport(batches, cache);
}

main()
    .then(() => {
        console.log("\nScript finished");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\nFatal error:", error);
        process.exit(1);
    });
