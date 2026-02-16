import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { batchGeocode, type BatchGeocodingItem } from '@/lib/geocoding';
import { handleApiError, Errors } from '@/lib/api-errors';

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
