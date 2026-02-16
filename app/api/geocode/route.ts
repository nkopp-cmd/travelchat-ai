import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { geocodeWithCascade } from '@/lib/geocoding';
import { handleApiError, Errors } from '@/lib/api-errors';

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
