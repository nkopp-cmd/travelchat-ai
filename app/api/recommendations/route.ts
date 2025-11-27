import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRecommendations } from '@/lib/recommendations';
import { handleApiError } from '@/lib/api-error-handler';

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
    const recommendations = await getRecommendations(userId, limit);

    // Return recommendations
    return NextResponse.json({
      recommendations,
      count: recommendations.length,
      personalized: recommendations.length > 0,
    });
  } catch (error) {
    return handleApiError(error, {
      context: 'api/recommendations',
    });
  }
}
