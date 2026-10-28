import { NextRequest, NextResponse } from 'next/server';
import { reservePlacesCall } from '@/lib/places-quota';
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
const MAX_BATCH = 12;

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

type Lookup = { result: PlacePhotoResponse } | { error: NextResponse };

async function lookupPlace(query: string, city: string | undefined, apiKey: string, signal: AbortSignal): Promise<Lookup> {
    if (!(await reservePlacesCall('search'))) {
        return { error: NextResponse.json({ error: 'Places lookup is paused for today' }, { status: 503 }) };
    }
    const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id' },
        body: JSON.stringify({ textQuery: city ? `${query}, ${city}` : query, pageSize: 1 }),
    });
    if (!search.ok) {
        return { error: NextResponse.json({ error: 'Places search failed' }, { status: 502 }) };
    }
    const placeId: unknown = (await search.json())?.places?.[0]?.id;
    if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) {
        return { result: empty() };
    }

    if (!(await reservePlacesCall('details'))) {
        return { result: { ...empty(), placeId } };
    }
    const details = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        signal,
        headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,photos,formattedAddress,location' },
    });
    if (!details.ok) {
        return { result: { ...empty(), placeId } };
    }
    const place = await details.json();
    const photoName: unknown = place?.photos?.[0]?.name;
    return {
        result: {
            ...empty(),
            placeId,
            photoUrl: typeof photoName === 'string' && photoName.startsWith(`places/${placeId}/photos/`)
                ? buildPlacePhotoProxyUrl(photoName, 900) : null,
            formattedAddress: typeof place?.formattedAddress === 'string' ? place.formattedAddress : null,
            lat: typeof place?.location?.latitude === 'number' ? place.location.latitude : null,
            lng: typeof place?.location?.longitude === 'number' ? place.location.longitude : null,
        },
    };
}

/** Signed-in Pro/Premium viewer and a configured key, or the refusal to send. */
async function access(): Promise<{ apiKey: string } | { error: NextResponse }> {
    const { userId } = await auth();
    if (!userId) {
        return { error: Errors.unauthorized() };
    }
    const tier = await getUserTier(userId);
    if (tier === 'free') {
        return { error: Errors.forbidden('Place photos require Pro or Premium subscription') };
    }
    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) {
        return { error: NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 }) };
    }
    return { apiKey };
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = clean(searchParams.get('query'), 200);
        const city = clean(searchParams.get('city'), 80) || undefined;
        const allowed = await access();
        if ('error' in allowed) return allowed.error;
        if (!query) {
            return Errors.validationError('query parameter is required');
        }

        const lookup = await lookupPlace(query, city, allowed.apiKey, AbortSignal.timeout(TIMEOUT_MS));
        if ('error' in lookup) return lookup.error;
        return NextResponse.json(lookup.result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return handleApiError(error, 'places-photos');
    }
}

export async function POST(req: NextRequest) {
    try {
        const allowed = await access();
        if ('error' in allowed) return allowed.error;
        const body = await req.json().catch(() => null);
        const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
        if (!items.length || items.length > MAX_BATCH) {
            return Errors.validationError(`items must hold 1-${MAX_BATCH} entries`);
        }
        const signal = AbortSignal.timeout(TIMEOUT_MS);
        const results = await Promise.all(items.map(async (item) => {
            const query = clean((item as { query?: unknown })?.query, 200);
            const city = clean((item as { city?: unknown })?.city, 80) || undefined;
            if (!query) return empty();
            try {
                const lookup = await lookupPlace(query, city, allowed.apiKey, signal);
                return 'error' in lookup ? null : lookup.result;
            } catch {
                return null; // failed lookup: the browser retries on a later visit instead of caching it
            }
        }));
        return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return handleApiError(error, 'places-photos');
    }
}
