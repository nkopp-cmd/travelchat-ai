import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth/server";
import { geocodeWithCascade } from '@/lib/geocoding';
import { handleApiError, Errors } from '@/lib/api-errors';
import { isPreviewStoredGeocodeCandidate, previewStoredGeocode,
    validStoredGeocodeQuery } from '@/lib/app-data/preview-stored-geocode';

/**
 * GET /api/geocode?address=...&city=...&name=...
 *
 * Single address geocoding endpoint.
 * Uses cascade: Kakao (Korea) → Nominatim → Google
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { searchParams } = new URL(req.url);
        const address = searchParams.get('address');
        const city = searchParams.get('city') || '';
        const name = searchParams.get('name') || undefined;

        if (!address) {
            return Errors.validationError('address parameter is required');
        }

        if (isPreviewStoredGeocodeCandidate(req)) {
            const headers = { 'Cache-Control': 'private, no-store', 'X-Localley-Data-Source': 'd1-preview' };
            if (!validStoredGeocodeQuery(address, city, name ?? null)) {
                return NextResponse.json({ error: 'Invalid stored map query' }, { status: 400, headers });
            }
            try {
                const stored = await previewStoredGeocode(address, city, name ?? null);
                return stored
                    ? NextResponse.json(stored, { headers })
                    : NextResponse.json({ error: 'not_found' }, { status: 404, headers });
            } catch (error) {
                console.error('[PREVIEW_STORED_GEOCODE] Source unavailable', error);
                return NextResponse.json({ error: 'Stored map source unavailable' }, { status: 503, headers });
            }
        }

        const result = await geocodeWithCascade(address, city, name);

        if (!result) {
            return NextResponse.json({ error: 'not_found' }, { status: 404 });
        }

        return NextResponse.json({
            lat: result.lat,
            lng: result.lng,
            provider: result.provider,
        });
    } catch (error) {
        return handleApiError(error, 'geocode');
    }
}
