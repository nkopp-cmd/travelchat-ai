/**
 * Enrich Spot Images Script
 *
 * This script populates photos for spots that are missing images.
 * Uses Google Places API (New) to fetch venue photos.
 * Falls back to TripAdvisor Content API if Google Places has no photos.
 *
 * Usage:
 *   npx ts-node scripts/enrich-spot-images.ts
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_PLACES_API_KEY
 *   - TRIPADVISOR_API_KEY (optional, for fallback)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
const tripAdvisorApiKey = process.env.TRIPADVISOR_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

if (!googleApiKey) {
    console.error('Missing GOOGLE_PLACES_API_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting
const RATE_LIMIT_MS = 150; // ~6-7 requests per second
const BATCH_SIZE = 25;
const MAX_PHOTOS_PER_SPOT = 3;

interface SpotRow {
    id: string;
    name: string | Record<string, string>;
    address: string | Record<string, string>;
    photos: string[] | null;
    category: string;
}

interface GooglePlacePhoto {
    name: string;
    widthPx: number;
    heightPx: number;
}

interface GooglePlaceResult {
    id: string;
    displayName?: {
        text: string;
    };
    photos?: GooglePlacePhoto[];
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
 * Search Google Places API (New) for a place
 */
async function searchGooglePlace(name: string, address: string): Promise<string | null> {
    try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleApiKey!,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
            },
            body: JSON.stringify({
                textQuery: `${name} ${address}`,
                maxResultCount: 1,
            }),
        });

        const data = await response.json();

        if (data.places && data.places.length > 0) {
            return data.places[0].id;
        }

        return null;
    } catch (error) {
        console.error(`   Error searching Google Places:`, error);
        return null;
    }
}

/**
 * Get place details including photos from Google Places API (New)
 */
async function getGooglePlaceDetails(placeId: string): Promise<GooglePlacePhoto[]> {
    try {
        const response = await fetch(
            `https://places.googleapis.com/v1/places/${placeId}`,
            {
                method: 'GET',
                headers: {
                    'X-Goog-Api-Key': googleApiKey!,
                    'X-Goog-FieldMask': 'photos',
                },
            }
        );

        const data = await response.json();
        return data.photos || [];
    } catch (error) {
        console.error(`   Error getting place details:`, error);
        return [];
    }
}

/**
 * Get photo URL from Google Places photo reference
 * Uses the new Places API photo endpoint
 */
function getGooglePhotoUrl(photoName: string, maxWidth: number = 800): string {
    // New Places API photo URL format
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${googleApiKey}`;
}

/**
 * Search TripAdvisor for a location (fallback)
 */
async function searchTripAdvisor(name: string, address: string): Promise<string | null> {
    if (!tripAdvisorApiKey) return null;

    try {
        const searchQuery = `${name} ${address}`;
        const url = new URL('https://api.content.tripadvisor.com/api/v1/location/search');
        url.searchParams.set('key', tripAdvisorApiKey);
        url.searchParams.set('searchQuery', searchQuery);
        url.searchParams.set('language', 'en');

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json',
            },
        });

        const data = await response.json();

        if (data.data && data.data.length > 0) {
            return data.data[0].location_id;
        }

        return null;
    } catch (error) {
        console.error(`   Error searching TripAdvisor:`, error);
        return null;
    }
}

/**
 * Get photos from TripAdvisor Content API (fallback)
 */
async function getTripAdvisorPhotos(locationId: string): Promise<string[]> {
    if (!tripAdvisorApiKey) return [];

    try {
        const url = new URL(`https://api.content.tripadvisor.com/api/v1/location/${locationId}/photos`);
        url.searchParams.set('key', tripAdvisorApiKey);
        url.searchParams.set('language', 'en');

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json',
            },
        });

        const data = await response.json();

        if (data.data && data.data.length > 0) {
            return data.data
                .slice(0, MAX_PHOTOS_PER_SPOT)
                .map((photo: { images: { large: { url: string } } }) => photo.images.large.url)
                .filter(Boolean);
        }

        return [];
    } catch (error) {
        console.error(`   Error getting TripAdvisor photos:`, error);
        return [];
    }
}

/**
 * Update spot photos in database
 */
async function updateSpotPhotos(spotId: string, photos: string[]): Promise<boolean> {
    const { error } = await supabase
        .from('spots')
        .update({ photos })
        .eq('id', spotId);

    if (error) {
        console.error(`   Error updating spot ${spotId}:`, error.message);
        return false;
    }

    return true;
}

/**
 * Main image enrichment function
 */
async function enrichSpotImages() {
    console.log('🖼️  Starting spot image enrichment...\n');

    // Get all spots that need images
    const { data: allSpots, error: fetchError } = await supabase
        .from('spots')
        .select('id, name, address, photos, category')
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('Error fetching spots:', fetchError.message);
        process.exit(1);
    }

    if (!allSpots || allSpots.length === 0) {
        console.log('No spots found in database.');
        return;
    }

    // Filter spots that need images
    const spotsNeedingImages = allSpots.filter((spot: SpotRow) => {
        // Has no photos or empty array
        if (!spot.photos || spot.photos.length === 0) return true;
        // Only has placeholder
        if (spot.photos.length === 1 && spot.photos[0].includes('placeholder')) return true;
        return false;
    });

    console.log(`📊 Total spots: ${allSpots.length}`);
    console.log(`🖼️  Spots needing images: ${spotsNeedingImages.length}`);
    console.log(`🔑 Google Places API: ${googleApiKey ? 'Available' : 'Not configured'}`);
    console.log(`🔑 TripAdvisor API: ${tripAdvisorApiKey ? 'Available' : 'Not configured (fallback disabled)'}`);

    if (spotsNeedingImages.length === 0) {
        console.log('\n✅ All spots already have images!');
        return;
    }

    console.log(`\n🚀 Starting image enrichment in batches of ${BATCH_SIZE}...\n`);

    let googleSuccess = 0;
    let tripAdvisorSuccess = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < spotsNeedingImages.length; i++) {
        const spot = spotsNeedingImages[i] as SpotRow;
        const spotName = getFieldValue(spot.name);
        const spotAddress = getFieldValue(spot.address);

        if (!spotName || !spotAddress) {
            console.log(`⏭️  [${i + 1}/${spotsNeedingImages.length}] Skipping - missing name or address`);
            skippedCount++;
            continue;
        }

        console.log(`🔍 [${i + 1}/${spotsNeedingImages.length}] ${spotName}`);
        console.log(`   Category: ${spot.category}`);

        let photos: string[] = [];

        // Try Google Places first
        const placeId = await searchGooglePlace(spotName, spotAddress);
        await sleep(RATE_LIMIT_MS);

        if (placeId) {
            const placePhotos = await getGooglePlaceDetails(placeId);
            await sleep(RATE_LIMIT_MS);

            if (placePhotos.length > 0) {
                photos = placePhotos
                    .slice(0, MAX_PHOTOS_PER_SPOT)
                    .map(photo => getGooglePhotoUrl(photo.name));

                console.log(`   ✅ Google Places: Found ${photos.length} photos`);
                googleSuccess++;
            }
        }

        // Try TripAdvisor as fallback
        if (photos.length === 0 && tripAdvisorApiKey) {
            console.log(`   🔄 Trying TripAdvisor fallback...`);

            const locationId = await searchTripAdvisor(spotName, spotAddress);
            await sleep(RATE_LIMIT_MS);

            if (locationId) {
                photos = await getTripAdvisorPhotos(locationId);
                await sleep(RATE_LIMIT_MS);

                if (photos.length > 0) {
                    console.log(`   ✅ TripAdvisor: Found ${photos.length} photos`);
                    tripAdvisorSuccess++;
                }
            }
        }

        // Update database if we found photos
        if (photos.length > 0) {
            const updated = await updateSpotPhotos(spot.id, photos);
            if (!updated) {
                failCount++;
            }
        } else {
            console.log(`   ⚠️  No photos found`);
            failCount++;
        }

        // Progress update every batch
        if ((i + 1) % BATCH_SIZE === 0) {
            console.log(`\n📈 Progress: ${i + 1}/${spotsNeedingImages.length} processed`);
            console.log(`   Google: ${googleSuccess}, TripAdvisor: ${tripAdvisorSuccess}, Failed: ${failCount}, Skipped: ${skippedCount}\n`);
        }
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 IMAGE ENRICHMENT COMPLETE');
    console.log('='.repeat(50));
    console.log(`Total processed: ${googleSuccess + tripAdvisorSuccess + failCount + skippedCount}`);
    console.log(`✅ Google Places: ${googleSuccess}`);
    console.log(`✅ TripAdvisor: ${tripAdvisorSuccess}`);
    console.log(`❌ No images found: ${failCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log('='.repeat(50));
}

// Run the script
enrichSpotImages()
    .then(() => {
        console.log('\n✅ Script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
