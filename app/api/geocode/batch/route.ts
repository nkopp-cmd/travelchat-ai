import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth/server";
import { batchGeocode, type BatchGeocodingItem } from '@/lib/geocoding';
import { handleApiError, Errors } from '@/lib/api-errors';
import { isPreviewStoredGeocodeCandidate, previewStoredGeocode,
    validStoredGeocodeQuery } from '@/lib/app-data/preview-stored-geocode';

/**
 * POST /api/geocode/batch
 *
 * Batch geocoding endpoint for display-time geocoding of old itineraries
 * that don't have stored coordinates.
 *
 * Body: { items: [{ address, city, name }] }
 * Returns: { results: [{ lat, lng, provider } | null] }
 */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const items: BatchGeocodingItem[] = body?.items;

        if (!Array.isArray(items) || items.length === 0) {
            return Errors.validationError('items array is required and must not be empty');
        }

        // Limit batch size to prevent abuse
        if (items.length > 30) {
            return Errors.validationError('Maximum 30 items per batch');
        }

        if (isPreviewStoredGeocodeCandidate(req)) {
            const headers = { 'Cache-Control': 'private, no-store', 'X-Localley-Data-Source': 'd1-preview' };
            if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item)
                || typeof item.address !== 'string' || typeof item.city !== 'string'
                || (item.name !== undefined && typeof item.name !== 'string')
                || !validStoredGeocodeQuery(item.address, item.city, item.name ?? null))) {
                return NextResponse.json({ error: 'Invalid stored map batch' }, { status: 400, headers });
            }
            try {
                const results = await Promise.all(items.map(item =>
                    previewStoredGeocode(item.address, item.city, item.name ?? null)));
                return NextResponse.json({ results }, { headers });
            } catch (error) {
                console.error('[PREVIEW_STORED_GEOCODE_BATCH] Source unavailable', error);
                return NextResponse.json({ error: 'Stored map source unavailable' }, { status: 503, headers });
            }
        }

        // Validate each item
        for (const item of items) {
            if (!item.address || !item.city) {
                return Errors.validationError('Each item must have address and city');
            }
        }

        const results = await batchGeocode(items);

        return NextResponse.json({
            results: results.map(r =>
                r ? { lat: r.lat, lng: r.lng, provider: r.provider } : null
            ),
        });
    } catch (error) {
        return handleApiError(error, 'geocode-batch');
    }
}
