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
 *
 * Safety features:
 * - AbortController with configurable timeout
 * - Guaranteed stream termination
 * - Structured error events for all failure modes
 */

import { NextRequest } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { addThumbnailsToItinerary } from '@/lib/activity-images';
import { generateItinerarySchema, validateBody } from '@/lib/validations';
import { checkAndIncrementUsage } from '@/lib/usage-tracking';
import { getOrchestrator, featureFlags } from '@/lib/llm';
import type { UserTier, GeneratedItinerary } from '@/lib/llm';

// Maximum time for the entire generation process (5 minutes)
const STREAM_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval to keep connection alive (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

interface StreamEvent {
  type: 'start' | 'progress' | 'phase1' | 'phase2' | 'complete' | 'error' | 'heartbeat';
  data: Record<string, unknown>;
}

function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Create a timeout promise that rejects after the specified duration
 */
function createTimeout(ms: number, signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: Stream exceeded ${ms}ms limit`));
    }, ms);

    // Clear timeout if aborted
    signal.addEventListener('abort', () => clearTimeout(timeoutId));
  });
}

export async function POST(req: NextRequest) {
  // Create abort controller for timeout and cancellation
  const abortController = new AbortController();
  const { signal } = abortController;

  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Track if stream has been closed to prevent double-close
  let streamClosed = false;

  /**
   * Safely close the stream writer
   */
  const safeClose = async () => {
    if (streamClosed) return;
    streamClosed = true;
    try {
      await writer.close();
    } catch (e) {
      // Stream may already be closed by client disconnect
      console.warn('[generate-v2/stream] Stream close warning:', e);
    }
  };

  /**
   * Send an SSE event, handling potential errors
   */
  const sendEvent = async (event: StreamEvent): Promise<boolean> => {
    if (streamClosed || signal.aborted) return false;
    try {
      await writer.write(encoder.encode(encodeSSE(event)));
      return true;
    } catch (e) {
      console.warn('[generate-v2/stream] Send event warning:', e);
      return false;
    }
  };

  /**
   * Send structured error and close stream
   */
  const sendErrorAndClose = async (
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    await sendEvent({
      type: 'error',
      data: {
        error: code,
        message,
        ...details,
        timestamp: new Date().toISOString(),
      },
    });
    await safeClose();
  };

  // Set up heartbeat to keep connection alive
  const heartbeatInterval = setInterval(async () => {
    if (!streamClosed && !signal.aborted) {
      await sendEvent({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      });
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Clean up heartbeat on abort
  signal.addEventListener('abort', () => {
    clearInterval(heartbeatInterval);
  });

  // Start processing in the background with timeout protection
  (async () => {
    try {
      // Race between generation and timeout
      await Promise.race([
        processGeneration(),
        createTimeout(STREAM_TIMEOUT_MS, signal),
      ]);
    } catch (error) {
      // Handle timeout or other errors
      const isTimeout = error instanceof Error && error.message.startsWith('TIMEOUT:');
      const isAborted = signal.aborted;

      console.error('[generate-v2/stream] Error:', {
        isTimeout,
        isAborted,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isTimeout) {
        await sendErrorAndClose(
          'timeout',
          'Request timed out. The itinerary generation took too long.',
          { timeoutMs: STREAM_TIMEOUT_MS }
        );
      } else if (!isAborted) {
        await sendErrorAndClose(
          'internal_error',
          'An unexpected error occurred. Please try again.',
          { error: error instanceof Error ? error.message : 'Unknown error' }
        );
      }
    } finally {
      // Always clean up
      clearInterval(heartbeatInterval);
      abortController.abort();
      await safeClose();
    }

    async function processGeneration() {
      const { userId } = await auth();

      if (!userId) {
        await sendErrorAndClose('unauthorized', 'Please sign in to continue.');
        return;
      }

      // Validate request body first (before incrementing usage)
      const validation = await validateBody(req, generateItinerarySchema);
      if (!validation.success) {
        await sendErrorAndClose('validation_error', validation.error || 'Invalid request');
        return;
      }

      const params = validation.data;

      // Send start event
      await sendEvent({
        type: 'start',
        data: { message: 'Starting itinerary generation...' },
      });

      // Check for abort before expensive operations
      if (signal.aborted) return;

      // Atomic check and increment - prevents race conditions
      const { allowed, usage, tier } = await checkAndIncrementUsage(
        userId,
        "itineraries_created"
      );

      if (!allowed) {
        await sendErrorAndClose(
          'limit_exceeded',
          `You've reached your limit of ${usage.limit} itineraries this month.`,
          { usage }
        );
        return;
      }

      // Send progress update
      await sendEvent({
        type: 'progress',
        data: {
          message: 'Validating request...',
          progress: 10,
        },
      });

      // Check for abort before LLM call
      if (signal.aborted) return;

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

      // Check for abort after LLM call
      if (signal.aborted) return;

      if (!result.success || !result.data) {
        await sendErrorAndClose(
          'generation_failed',
          'Failed to generate itinerary. Please try again.',
          { fallbackUsed: result.fallbackUsed }
        );
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

      // Check for abort before database save
      if (signal.aborted) return;

      const savedItinerary = await saveItineraryToDatabase(
        userId,
        itineraryData,
        params
      );

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
    }
  })();

  // Return the streaming response
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
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
