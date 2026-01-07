/**
 * Multi-LLM Itinerary Generation Endpoint (V2)
 *
 * This endpoint uses the multi-LLM orchestration system:
 * - ChatGPT: Creative itinerary design
 * - Gemini: Location validation + images
 * - Claude: Quality assurance and fact-checking
 *
 * Tier-based features:
 * - Free: Single LLM (ChatGPT only) - same as V1
 * - Pro: ChatGPT + Gemini validation + Basic Claude check
 * - Premium: Full orchestration with Claude supervision
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { addThumbnailsToItinerary, addAIThumbnailsToItinerary } from '@/lib/activity-images';
import { hasFeature } from '@/lib/subscription';
import { generateItinerarySchema, validateBody } from '@/lib/validations';
import { checkAndIncrementUsage } from '@/lib/usage-tracking';
import { TIER_CONFIGS } from '@/lib/subscription';
import { getOrchestrator, featureFlags } from '@/lib/llm';
import type { UserTier, GeneratedItinerary } from '@/lib/llm';
import { Errors, handleApiError } from '@/lib/api-errors';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Errors.unauthorized();
    }

    // Validate request body first (before incrementing usage)
    const validation = await validateBody(req, generateItinerarySchema);
    if (!validation.success) {
      return Errors.validationError(validation.error || "Invalid request body");
    }

    // Atomic check and increment - prevents race conditions
    const { allowed, usage, tier } = await checkAndIncrementUsage(userId, "itineraries_created");

    if (!allowed) {
      return Errors.limitExceeded(
        "itineraries",
        usage.currentUsage,
        usage.limit,
        usage.periodResetAt
      );
    }

    const params = validation.data;

    // Check if multi-LLM is enabled for this tier
    const useMultiLLM = featureFlags.isEnabledForTier(tier as UserTier);

    // Get the orchestrator
    const orchestrator = getOrchestrator();

    // Execute orchestrated generation
    const result = await orchestrator.generateItinerary({
      type: 'itinerary',
      params: {
        city: params.city,
        days: params.days,
        interests: params.interests,
        budget: params.budget,
        localnessLevel: params.localnessLevel,
        pace: params.pace,
        groupType: params.groupType,
        templatePrompt: params.templatePrompt,
      },
      tier: tier as UserTier,
      userId,
      requestId: crypto.randomUUID(),
    });

    if (!result.success || !result.data) {
      console.error('[generate-v2] Orchestration failed:', result.error);
      return Errors.externalServiceError("LLM orchestration");
    }

    // Add thumbnail images to activities
    const itineraryData = result.data;
    const dailyPlansForThumbnails = itineraryData.dailyPlans as unknown as Parameters<typeof addThumbnailsToItinerary>[0];

    // Use AI-generated images for Pro/Premium users, Unsplash for Free
    const useAIImages = hasFeature(tier, 'activityImages') === 'ai-generated';

    let dailyPlansWithImages;
    if (useAIImages) {
      // Pro/Premium: Generate AI thumbnails (max 6 to avoid long wait times)
      dailyPlansWithImages = await addAIThumbnailsToItinerary(
        dailyPlansForThumbnails,
        params.city,
        6 // Generate up to 6 AI images, rest use Unsplash
      );
    } else {
      // Free tier: Use Unsplash placeholders
      dailyPlansWithImages = addThumbnailsToItinerary(dailyPlansForThumbnails, params.city);
    }

    itineraryData.dailyPlans = dailyPlansWithImages as unknown as typeof itineraryData.dailyPlans;

    // Save itinerary to database
    const savedItinerary = await saveItineraryToDatabase(
      userId,
      itineraryData,
      params
    );

    // Usage already tracked atomically - no need for separate call
    // Award XP for creating itinerary (fire and forget)
    awardXP(req, userId).catch(console.error);

    // Build response with metadata
    const response: Record<string, unknown> = {
      success: true,
      itinerary: {
        id: savedItinerary?.id,
        ...itineraryData,
      },
    };

    // Include orchestration metadata for Pro/Premium tiers
    if (useMultiLLM && (tier === 'pro' || tier === 'premium')) {
      response.meta = {
        qualityScore: result.qualityScore,
        validationReport: result.validationReport,
        fallbackUsed: result.fallbackUsed,
        metrics: {
          totalLatencyMs: result.metrics.totalLatencyMs,
          providersUsed: result.metrics.providersUsed,
          cacheHits: result.metrics.cacheHits,
        },
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[generate-v2] Error:", error);
    return handleApiError(error, "itinerary-generate-v2");
  }
}

/**
 * Save itinerary to database
 */
async function saveItineraryToDatabase(
  userId: string,
  itineraryData: GeneratedItinerary,
  params: { city: string; days: number }
): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();

  // Get or create user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', userId)
    .single();

  let userDbId = user?.id;

  if (userError || !user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ clerk_id: userId }])
      .select('id')
      .single();

    if (createError) {
      console.error('[generate-v2] Error creating user:', createError);
      return null;
    }
    userDbId = newUser?.id;
  }

  if (!userDbId) {
    console.error('[generate-v2] Cannot save itinerary: no user_id found');
    return null;
  }

  // Save itinerary
  const { data, error: saveError } = await supabase
    .from('itineraries')
    .insert([
      {
        user_id: userDbId,
        clerk_user_id: userId,
        title: itineraryData.title,
        subtitle: itineraryData.subtitle,
        city: params.city,
        days: params.days,
        activities: itineraryData.dailyPlans,
        local_score: itineraryData.localScore,
        shared: false,
        highlights: itineraryData.highlights,
        estimated_cost: itineraryData.estimatedCost,
      },
    ])
    .select('id')
    .single();

  if (saveError) {
    console.error('[generate-v2] Error saving itinerary:', saveError);
    return null;
  }

  return data;
}

/**
 * Award XP for creating itinerary (fire and forget)
 */
async function awardXP(req: NextRequest, userId: string): Promise<void> {
  try {
    await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        action: 'create_itinerary',
      }),
    });
  } catch (error) {
    console.error('[generate-v2] Error awarding XP:', error);
  }
}

/**
 * GET endpoint to check orchestrator health
 */
export async function GET() {
  try {
    const orchestrator = getOrchestrator();
    const health = orchestrator.getHealthStatus();

    return NextResponse.json({
      status: 'ok',
      multiLLMEnabled: featureFlags.multiLLMEnabled,
      ...health,
    });
  } catch (error) {
    return handleApiError(error, "itinerary-generate-v2-health");
  }
}
