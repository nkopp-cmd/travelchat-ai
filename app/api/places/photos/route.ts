import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth/server";
import { handleApiError, Errors } from '@/lib/api-errors';
import { getUserTier } from '@/lib/usage-tracking';
import { buildPlacePhotoProxyUrl, getGooglePlacesApiKey } from '@/lib/place-images';

/**
 * GET /api/places/photos?query=Lucyd+Brunch&city=Seoul
 *
 * Photo, address and coordinates for a trip activity card (Pro/Premium only).
 * Places API (New), cheapest tiers (Nils 2026-10-23, option A):
 *  1. Text Search with only `places.id` -> Essentials IDs Only (no usage cap).
 *  2. Place Details `id,photos,formattedAddress,location` -> Essentials.
 * No rating (Enterprise tier) and no phone (unused). Nothing is cached server-side:
 * Google Maps terms allow storing place IDs only; the browser keeps results for the visit.
 */
const TIMEOUT_MS = 8000;

interface PlacePhotoResponse {
    photoUrl: string | null;
    rating: null;
    totalRatings: null;
    phone: null;
    placeId: string | null;
    formattedAddress: string | null;
    lat: number | null;
    lng: number | null;
}

const empty = (): PlacePhotoResponse => ({
    photoUrl: null, rating: null, totalRatings: null, phone: null, placeId: null, formattedAddress: null, lat: null, lng: null,
});

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const tier = await getUserTier(userId);
        if (tier === 'free') {
            return Errors.forbidden('Place photos require Pro or Premium subscription');
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query')?.trim().slice(0, 200);
        const city = searchParams.get('city')?.trim().slice(0, 80);
        if (!query) {
            return Errors.validationError('query parameter is required');
        }

        const apiKey = getGooglePlacesApiKey();
        if (!apiKey) {
            return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 });
        }

        const signal = AbortSignal.timeout(TIMEOUT_MS);
        const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id' },
            body: JSON.stringify({ textQuery: city ? `${query}, ${city}` : query, pageSize: 1 }),
        });
        if (!search.ok) {
            return NextResponse.json({ error: 'Places search failed' }, { status: 502 });
        }
        const placeId: unknown = (await search.json())?.places?.[0]?.id;
        if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) {
            return NextResponse.json(empty());
        }

        const details = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
            signal,
            headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,photos,formattedAddress,location' },
        });
        if (!details.ok) {
            return NextResponse.json({ ...empty(), placeId });
        }
        const place = await details.json();
        const photoName: unknown = place?.photos?.[0]?.name;
        const result: PlacePhotoResponse = {
            ...empty(),
            placeId,
            photoUrl: typeof photoName === 'string' && photoName.startsWith(`places/${placeId}/photos/`)
                ? buildPlacePhotoProxyUrl(photoName, 900) : null,
            formattedAddress: typeof place?.formattedAddress === 'string' ? place.formattedAddress : null,
            lat: typeof place?.location?.latitude === 'number' ? place.location.latitude : null,
            lng: typeof place?.location?.longitude === 'number' ? place.location.longitude : null,
        };
        return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return handleApiError(error, 'places-photos');
    }
}
