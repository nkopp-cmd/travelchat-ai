/**
 * Geocode Spots Script
 *
 * This script populates location coordinates for spots that have (0,0) coordinates.
 * Uses Google Geocoding API to convert addresses to lat/lng coordinates.
 *
 * Usage:
 *   npx ts-node scripts/geocode-spots.ts
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_PLACES_API_KEY (or GOOGLE_GEOCODING_API_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

if (!googleApiKey) {
    console.error('Missing Google API key in .env.local (GOOGLE_PLACES_API_KEY or GOOGLE_GEOCODING_API_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting: Google Geocoding API allows 50 requests/second, but we'll be conservative
const RATE_LIMIT_MS = 100; // 10 requests per second
const BATCH_SIZE = 50; // Process in batches

interface SpotRow {
    id: string;
    name: string | Record<string, string>;
    address: string | Record<string, string>;
    location: {
        type: string;
        coordinates: [number, number];
    } | null;
}

interface GeocodingResult {
    lat: number;
    lng: number;
    formattedAddress?: string;
}

/**
 * Parse multi-language field to get English or first available value
 */
function getFieldValue(field: string | Record<string, string> | null | undefined): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field.en || Object.values(field)[0] || '';
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Geocode an address using Google Geocoding API
 */
async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', address);
        url.searchParams.set('key', googleApiKey!);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return {
                lat: location.lat,
                lng: location.lng,
                formattedAddress: data.results[0].formatted_address,
            };
        }

        if (data.status === 'ZERO_RESULTS') {
            console.log(`   No results for address: ${address.substring(0, 50)}...`);
            return null;
        }

        if (data.status === 'OVER_QUERY_LIMIT') {
            console.error('   Google API quota exceeded! Stopping...');
            throw new Error('QUOTA_EXCEEDED');
        }

        console.log(`   Geocoding error for "${address.substring(0, 30)}...": ${data.status}`);
        return null;
    } catch (error) {
        if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
            throw error;
        }
        console.error(`   Network error geocoding "${address.substring(0, 30)}...":`, error);
        return null;
    }
}

/**
 * Update spot location in database using raw SQL via RPC
 * PostGIS requires special handling for GEOGRAPHY type
 */
async function updateSpotLocation(spotId: string, lat: number, lng: number): Promise<boolean> {
    // Use Supabase's raw query capability through RPC
    // First, try to update using the location column directly
    const { error } = await supabase
        .from('spots')
        .update({
            // PostGIS POINT format: POINT(lng lat) - note longitude comes first!
            location: `POINT(${lng} ${lat})` as unknown as SpotRow['location'],
        })
        .eq('id', spotId);

    if (error) {
        // If direct update fails, try using raw SQL via RPC (if available)
        console.error(`   Error updating spot ${spotId}:`, error.message);
        return false;
    }

    return true;
}

/**
 * Main geocoding function
 */
async function geocodeSpots() {
    console.log('🌍 Starting spot geocoding...\n');

    // 1. Get all spots that need geocoding (coordinates are 0,0 or null)
    const { data: allSpots, error: fetchError } = await supabase
        .from('spots')
        .select('id, name, address, location')
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('Error fetching spots:', fetchError.message);
        process.exit(1);
    }

    if (!allSpots || allSpots.length === 0) {
        console.log('No spots found in database.');
        return;
    }

    // Filter spots that need geocoding
    const spotsToGeocode = allSpots.filter((spot: SpotRow) => {
        const lat = spot.location?.coordinates?.[1];
        const lng = spot.location?.coordinates?.[0];
        // Need geocoding if coordinates are missing, null, or (0,0)
        return !lat || !lng || (lat === 0 && lng === 0);
    });

    console.log(`📊 Total spots: ${allSpots.length}`);
    console.log(`📍 Spots needing geocoding: ${spotsToGeocode.length}`);

    if (spotsToGeocode.length === 0) {
        console.log('\n✅ All spots already have valid coordinates!');
        return;
    }

    console.log(`\n🚀 Starting geocoding in batches of ${BATCH_SIZE}...\n`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < spotsToGeocode.length; i++) {
        const spot = spotsToGeocode[i] as SpotRow;
        const spotName = getFieldValue(spot.name);
        const spotAddress = getFieldValue(spot.address);

        if (!spotAddress) {
            console.log(`⏭️  [${i + 1}/${spotsToGeocode.length}] Skipping "${spotName}" - no address`);
            skippedCount++;
            continue;
        }

        console.log(`🔍 [${i + 1}/${spotsToGeocode.length}] Geocoding: ${spotName}`);
        console.log(`   Address: ${spotAddress.substring(0, 60)}${spotAddress.length > 60 ? '...' : ''}`);

        try {
            const result = await geocodeAddress(spotAddress);

            if (result) {
                const updated = await updateSpotLocation(spot.id, result.lat, result.lng);

                if (updated) {
                    console.log(`   ✅ Found: ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`);
                    successCount++;
                } else {
                    console.log(`   ❌ Failed to update database`);
                    failCount++;
                }
            } else {
                console.log(`   ⚠️  Could not geocode`);
                failCount++;
            }
        } catch (error) {
            if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
                console.log('\n⚠️  Stopping due to quota limit. Run again later to continue.');
                break;
            }
            failCount++;
        }

        // Rate limiting
        await sleep(RATE_LIMIT_MS);

        // Progress update every batch
        if ((i + 1) % BATCH_SIZE === 0) {
            console.log(`\n📈 Progress: ${i + 1}/${spotsToGeocode.length} processed`);
            console.log(`   Success: ${successCount}, Failed: ${failCount}, Skipped: ${skippedCount}\n`);
        }
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 GEOCODING COMPLETE');
    console.log('='.repeat(50));
    console.log(`Total processed: ${successCount + failCount + skippedCount}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log('='.repeat(50));
}

// Run the script
geocodeSpots()
    .then(() => {
        console.log('\n✅ Script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
