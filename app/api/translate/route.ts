import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { handleApiError, Errors } from '@/lib/api-errors';
import { translateForGeocoding } from '@/lib/geocoding';

/**
 * POST /api/translate
 *
 * Translates text to a target language for map search links.
 * Used by client components when building Kakao Maps links with Korean text.
 *
 * Body: { text: string, targetLang: string }
 * Returns: { translated: string | null }
 */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const { text, targetLang } = body;

        if (!text || typeof text !== 'string') {
            return Errors.validationError('text is required');
        }
        if (!targetLang || typeof targetLang !== 'string') {
            return Errors.validationError('targetLang is required');
        }

        // Only support specific languages
        const supportedLangs = ['ko', 'ja', 'th', 'zh', 'vi', 'ms', 'id'];
        if (!supportedLangs.includes(targetLang)) {
            return Errors.validationError(`Unsupported language: ${targetLang}`);
        }

        const translated = await translateForGeocoding(text, targetLang);

        return NextResponse.json({ translated });
    } catch (error) {
        return handleApiError(error, 'translate');
    }
}
