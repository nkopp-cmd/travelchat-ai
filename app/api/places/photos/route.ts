import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { handleApiError, Errors } from '@/lib/api-errors';
import { getUserTier } from '@/lib/usage-tracking';

/**
 * GET /api/places/photos?query=Lucyd+Brunch&city=Seoul
 *
 * Fetches place details (photo, rating, phone) from Google Places API.
 * Only available for Pro/Premium users. Cached via Redis.
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        // Check tier
        const tier = await getUserTier(userId);
        if (tier === 'free') {
            return Errors.forbidden('Place photos require Pro or Premium subscription');
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query');
        const city = searchParams.get('city');

        if (!query) {
            return Errors.validationError('query parameter is required');
        }

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 });
        }

        // Try Redis cache first
        let cached: string | null = null;
        const cacheKey = `places:${query}:${city || ''}`;

        try {
            const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
            const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
            if (redisUrl && redisToken) {
                const cacheResponse = await fetch(`${redisUrl}/get/${encodeURIComponent(cacheKey)}`, {
                    headers: { Authorization: `Bearer ${redisToken}` },
                });
                if (cacheResponse.ok) {
                    const cacheData = await cacheResponse.json();
                    if (cacheData.result) {
                        cached = cacheData.result;
                    }
                }
            }
        } catch {
            // Cache miss — continue to API
        }

        if (cached) {
            return NextResponse.json(JSON.parse(cached));
        }

        // Google Places Text Search (New)
        const searchQuery = city ? `${query}, ${city}` : query;
        const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

        const searchResponse = await fetch(textSearchUrl);
        if (!searchResponse.ok) {
            return NextResponse.json({ error: 'Places search failed' }, { status: 502 });
        }

        const searchData = await searchResponse.json();
        if (!searchData.results || searchData.results.length === 0) {
            return NextResponse.json({ photoUrl: null });
        }

        const place = searchData.results[0];
        const result: {
            photoUrl: string | null;
            rating: number | null;
            totalRatings: number | null;
            phone: string | null;
            placeId: string | null;
        } = {
            photoUrl: null,
            rating: place.rating || null,
            totalRatings: place.user_ratings_total || null,
            phone: null,
            placeId: place.place_id || null,
        };

        // Get photo URL
        if (place.photos && place.photos.length > 0) {
            const photoRef = place.photos[0].photo_reference;
            result.photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`;
        }

        // Get phone from Place Details if available
        if (place.place_id) {
            try {
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number&key=${apiKey}`;
                const detailsResponse = await fetch(detailsUrl);
                if (detailsResponse.ok) {
                    const detailsData = await detailsResponse.json();
                    result.phone = detailsData.result?.formatted_phone_number || null;
                }
            } catch {
                // Phone lookup failed — non-critical
            }
        }

        // Cache for 30 days
        try {
            const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
            const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
            if (redisUrl && redisToken) {
                await fetch(`${redisUrl}/set/${encodeURIComponent(cacheKey)}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${redisToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ EX: 2592000, value: JSON.stringify(result) }),
                });
            }
        } catch {
            // Cache write failed — non-critical
        }

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'places-photos');
    }
}
