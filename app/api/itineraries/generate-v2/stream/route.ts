/**
 * Streaming Multi-LLM Itinerary Generation Endpoint
 *
 * This endpoint streams progress updates while generating:
 * 1. Initial acknowledgment
 * 2. Phase 1 progress (parallel tasks)
 * 3. Phase 2 progress (Claude supervision)
 * 4. Final itinerary
 *
 * Uses Server-Sent Events (SSE) for real-time updates.
 */

import { NextRequest } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { addThumbnailsToItinerary } from '@/lib/activity-images';
import { generateItinerarySchema, validateBody } from '@/lib/validations';
import { checkAndTrackUsage, trackSuccessfulUsage } from '@/lib/usage-tracking';
import { getOrchestrator, featureFlags } from '@/lib/llm';
import type { UserTier, GeneratedItinerary } from '@/lib/llm';

interface StreamEvent {
  type: 'start' | 'progress' | 'phase1' | 'phase2' | 'complete' | 'error';
  data: Record<string, unknown>;
}

function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to send SSE events
  const sendEvent = async (event: StreamEvent) => {
    await writer.write(encoder.encode(encodeSSE(event)));
  };

  // Start processing in the background
  (async () => {
    try {
      const { userId } = await auth();

      if (!userId) {
        await sendEvent({
          type: 'error',
          data: { error: 'Unauthorized. Please sign in.' },
        });
        await writer.close();
        return;
      }

      // Send start event
      await sendEvent({
        type: 'start',
        data: { message: 'Starting itinerary generation...' },
      });

      // Check usage limits
      const { allowed, usage, tier } = await checkAndTrackUsage(
        userId,
        "itineraries_created"
      );

      if (!allowed) {
        await sendEvent({
          type: 'error',
          data: {
            error: 'limit_exceeded',
            message: `You've reached your limit of ${usage.limit} itineraries this month.`,
            usage,
          },
        });
        await writer.close();
        return;
      }

      // Validate request body
      const validation = await validateBody(req, generateItinerarySchema);
      if (!validation.success) {
        await sendEvent({
          type: 'error',
          data: { error: validation.error },
        });
        await writer.close();
        return;
      }

      const params = validation.data;

      // Send progress update
      await sendEvent({
        type: 'progress',
        data: {
          message: 'Validating request...',
          progress: 10,
        },
      });

      // Check multi-LLM availability
      const useMultiLLM = featureFlags.isEnabledForTier(tier as UserTier);
      const orchestrator = getOrchestrator();

      // Send phase 1 start
      await sendEvent({
        type: 'phase1',
        data: {
          message: useMultiLLM
            ? 'Generating itinerary with AI team...'
            : 'Generating itinerary...',
          progress: 20,
          providers: useMultiLLM ? ['ChatGPT', 'Gemini'] : ['ChatGPT'],
        },
      });

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
        await sendEvent({
          type: 'error',
          data: {
            error: 'Failed to generate itinerary. Please try again.',
            fallbackUsed: result.fallbackUsed,
          },
        });
        await writer.close();
        return;
      }

      // Send phase 2 update (if Claude was used)
      if (result.metrics.providersUsed.includes('claude')) {
        await sendEvent({
          type: 'phase2',
          data: {
            message: 'Quality assurance complete',
            progress: 80,
            qualityScore: result.qualityScore,
          },
        });
      }

      // Add thumbnails
      const itineraryData = result.data;
      // Cast to the expected type for addThumbnailsToItinerary
      const dailyPlansForThumbnails = itineraryData.dailyPlans as unknown as Parameters<typeof addThumbnailsToItinerary>[0];
      const dailyPlansWithImages = addThumbnailsToItinerary(
        dailyPlansForThumbnails,
        params.city
      );
      itineraryData.dailyPlans = dailyPlansWithImages as unknown as typeof itineraryData.dailyPlans;

      // Save to database
      await sendEvent({
        type: 'progress',
        data: {
          message: 'Saving itinerary...',
          progress: 90,
        },
      });

      const savedItinerary = await saveItineraryToDatabase(
        userId,
        itineraryData,
        params
      );

      // Track usage
      await trackSuccessfulUsage(userId, "itineraries_created");

      // Send complete event with full itinerary
      await sendEvent({
        type: 'complete',
        data: {
          success: true,
          itinerary: {
            id: savedItinerary?.id,
            ...itineraryData,
          },
          meta:
            useMultiLLM && (tier === 'pro' || tier === 'premium')
              ? {
                  qualityScore: result.qualityScore,
                  validationReport: result.validationReport,
                  fallbackUsed: result.fallbackUsed,
                  metrics: {
                    totalLatencyMs: result.metrics.totalLatencyMs,
                    providersUsed: result.metrics.providersUsed,
                    cacheHits: result.metrics.cacheHits,
                  },
                }
              : undefined,
        },
      });

      await writer.close();
    } catch (error) {
      console.error('[generate-v2/stream] Error:', error);
      await sendEvent({
        type: 'error',
        data: {
          error: 'Failed to generate itinerary. Please try again.',
        },
      });
      await writer.close();
    }
  })();

  // Return the streaming response
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Save itinerary to database
 */
async function saveItineraryToDatabase(
  userId: string,
  itineraryData: GeneratedItinerary,
  params: { city: string; days: number }
): Promise<{ id: string } | null> {
  const supabase = createSupabaseAdmin();

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
      console.error('[generate-v2/stream] Error creating user:', createError);
      return null;
    }
    userDbId = newUser?.id;
  }

  if (!userDbId) {
    return null;
  }

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
    console.error('[generate-v2/stream] Error saving itinerary:', saveError);
    return null;
  }

  return data;
}
