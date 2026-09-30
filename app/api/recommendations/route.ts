import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth/server";
import { getRecommendations } from '@/lib/recommendations';
import { handleApiError } from '@/lib/api-error-handler';
import { isPreviewRecommendationsCandidate, previewRecommendations } from '@/lib/app-data/preview-recommendations';

/**
 * GET /api/recommendations
 * Returns personalized spot recommendations for the authenticated user
 *
 * Query params:
 * - limit: number of recommendations to return (default: 10, max: 20)
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to get recommendations.' },
        { status: 401 }
      );
    }

    // Get limit from query params
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 10;

    // Validate limit
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be a positive number.' },
        { status: 400 }
      );
    }

    // Get recommendations
    const candidate = isPreviewRecommendationsCandidate(req);
    let recommendations;
    if (candidate) {
      try {
        recommendations = await previewRecommendations(userId, limit);
      } catch (error) {
        console.error('Preview recommendations unavailable:', error);
        return NextResponse.json({ error: 'Recommendations unavailable' }, { status: 503,
          headers: { 'Cache-Control': 'private, no-store', 'X-Localley-Data-Source': 'd1-preview' } });
      }
    } else {
      recommendations = await getRecommendations(userId, limit);
    }

    // Return recommendations
    return NextResponse.json({
      recommendations,
      count: recommendations.length,
      personalized: recommendations.length > 0,
    }, candidate ? { headers: { 'Cache-Control': 'private, no-store',
      'X-Localley-Data-Source': 'd1-preview' } } : undefined);
  } catch (error) {
    return handleApiError(error, {
      context: 'api/recommendations',
    });
  }
}
