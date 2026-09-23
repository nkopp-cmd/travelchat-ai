import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseAdmin } from '@/lib/supabase';
import { addThumbnailsToItinerary, addAIThumbnailsToItinerary } from '@/lib/activity-images';
import { hasFeature, SubscriptionTier } from '@/lib/subscription';
import { generateCorridorItinerarySchema, generateItinerarySchema } from '@/lib/validations';
import { checkAndIncrementUsage, checkUsageLimit, getUserTier } from '@/lib/usage-tracking';
import { validateCityForItinerary } from '@/lib/cities';
import { cookies } from 'next/headers';
import { Errors, handleApiError, apiError, ErrorCodes } from '@/lib/api-errors';
import { geocodeItineraryActivities } from '@/lib/geocoding';
import {
  applyPublicSpotVisibilityFilters,
  shouldShowPublicSpot,
} from '@/lib/spots/public-quality';
import { buildItineraryPlanPayload } from '@/lib/itineraries/normalize-daily-plans';
import { generateItineraryTextWithFallback } from './provider-fallback';
import {
  buildItinerarySpotContext,
  getPaceStopRange,
  groundGeneratedDailyPlans,
  hasItineraryGroundingCoverage,
  rankItineraryGroundingSpots,
  type ItineraryGroundingSpot,
} from '@/lib/itineraries/grounded-generation';
import { handleCorridorGeneration } from './corridor-generation';
import {
  OPENAI_MODEL,
  SYSTEM_PROMPT,
  generateWithOpenAI,
  getOrCreateUserDbId,
  parseAndSanitizeItinerary,
} from './shared';

// Anonymous usage tracking via cookies
const ANON_COOKIE_NAME = 'localley_anon_usage';
const ANON_LIMIT = 1; // 1 free itinerary without signup


// Helper to get/set anonymous usage cookie
async function getAnonymousUsage(): Promise<number> {
  const cookieStore = await cookies();
  const usage = cookieStore.get(ANON_COOKIE_NAME);
  return usage ? parseInt(usage.value, 10) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    const isAnonymous = !userId;
    let tier: SubscriptionTier = "free";

    // Handle anonymous users
    if (isAnonymous) {
      const anonUsage = await getAnonymousUsage();

      if (anonUsage >= ANON_LIMIT) {
        return apiError(ErrorCodes.UNAUTHORIZED, "Create an account and choose a plan to keep building itineraries.", {
          benefits: [
            "Save and access all your itineraries",
            "Choose Pro or Premium for ongoing trip planning",
            "Chat with Alley for personalized recommendations",
            "Export and share your trips",
          ],
          signupUrl: "/sign-up",
        });
      }
    }

    // Validate request body first (before incrementing usage)
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return Errors.validationError("Request body must be valid JSON");
    }

    if (rawBody && typeof rawBody === "object" && "corridor" in rawBody) {
      const corridorValidation = generateCorridorItinerarySchema.safeParse(rawBody);
      if (!corridorValidation.success) {
        const errors = corridorValidation.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        return Errors.validationError(errors || "Invalid request body");
      }
      const { corridor, ...preferences } = corridorValidation.data;
      const corridorResponse = await handleCorridorGeneration({
        req,
        corridor,
        preferences,
        userId,
        isAnonymous,
      });
      if (isAnonymous && corridorResponse.status < 400) {
        const currentUsage = await getAnonymousUsage();
        corridorResponse.cookies.set(ANON_COOKIE_NAME, String(currentUsage + 1), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }
      return corridorResponse;
    }

    const validation = generateItinerarySchema.safeParse(rawBody);
    if (!validation.success) {
      const errors = validation.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      return Errors.validationError(errors || "Invalid request body");
    }

    // Load tier without consuming quota while candidate coverage is validated.
    if (!isAnonymous) {
      tier = await getUserTier(userId!);
      const allowance = await checkUsageLimit(userId!, "itineraries_created", tier);
      if (!allowance.allowed) {
        return Errors.limitExceeded(
          "itineraries",
          allowance.currentUsage,
          allowance.limit,
          allowance.periodResetAt,
        );
      }
    }

    const { city, days, interests, budget, localnessLevel, pace, groupType, templatePrompt } = validation.data;

    // Validate city is supported
    const cityValidation = validateCityForItinerary(city);
    if (!cityValidation.valid) {
      return Errors.validationError(cityValidation.error!);
    }
    const cityConfig = cityValidation.city!;
    const normalizedCity = cityConfig.name;

    // Fetch spots from the city to include in recommendations
    const supabase = createSupabaseAdmin();
    let spotsQuery = supabase
      .from('spots')
      .select('*')
      .ilike('address->>en', `%${normalizedCity}%`)
      .gte('localley_score', 3);

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery)
      .order('localley_score', { ascending: false })
      .order('local_percentage', { ascending: false })
      .limit(80);

    const { data: spots, error: spotsError } = await spotsQuery;
    if (spotsError) {
      throw new Error(`Could not load verified itinerary spots: ${spotsError.message}`);
    }
    const visibleSpots = (spots || []).filter((spot) => shouldShowPublicSpot(spot));
    const groundingSpots = rankItineraryGroundingSpots(
      visibleSpots as ItineraryGroundingSpot[],
      { days, interests, localnessLevel, pace },
    );
    const hasGroundingCoverage = hasItineraryGroundingCoverage(
      groundingSpots,
      { days, interests, localnessLevel, pace },
    );

    if (!hasGroundingCoverage) {
      return NextResponse.json({
        error: "insufficient_verified_spots",
        message: `Localley does not yet have enough verified, photographed ${normalizedCity} spots for this exact pace and interest mix. Try fewer days, a slower pace, or broader interests.`,
      }, { status: 422 });
    }

    const groundedCandidateSpots = groundingSpots;

    // Consume quota only after the request can be fulfilled with grounded spots.
    if (!isAnonymous) {
      const { allowed, usage, tier: userTier } = await checkAndIncrementUsage(userId!, "itineraries_created");
      tier = userTier;

      if (!allowed) {
        return Errors.limitExceeded(
          "itineraries",
          usage.currentUsage,
          usage.limit,
          usage.periodResetAt
        );
      }
    }

    const spotsContext = groundedCandidateSpots.length > 0
      ? `\n\nVERIFIED CANDIDATES — choose ONLY from this list and return the exact spotId for every activity:\n${buildItinerarySpotContext(groundedCandidateSpots)}`
      : '';

    const userPrompt = `
Create a ${days}-day itinerary for ${normalizedCity} with these preferences:
- Interests: ${interests?.join(', ') || 'general exploration'}
- Budget: ${budget || 'moderate'}
- Localness Level: ${localnessLevel || 3}/5 (5 = maximum local authenticity)
- Pace: ${pace || 'moderate'}
- Group Type: ${groupType || 'solo'}
${spotsContext}

${templatePrompt ? `\nIMPORTANT: Follow this template style:\n${templatePrompt}` : ''}

Respect the pace, keep each day geographically coherent, avoid repeated categories, and prioritize the requested interests.
    `;

    const aiResponse = await generateItineraryTextWithFallback(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.8,
        maxTokens: 3000,
      },
      {
        generateWithOpenAI,
        openaiModel: OPENAI_MODEL,
      }
    );
    let rawContent = aiResponse.rawContent;
    let aiProvider = aiResponse.provider;
    let aiModel = aiResponse.model;
    let fallbackUsed = aiResponse.fallbackUsed;
    let fallbackReason = aiResponse.fallbackReason;

    // Parse and validate the response
    let itineraryData;
    try {
      itineraryData = parseAndSanitizeItinerary(rawContent, aiProvider);
    } catch (parseError) {
      if (aiProvider === "glm") {
        console.error("Failed to parse GLM response; retrying with OpenAI:", parseError, rawContent);
        rawContent = await generateWithOpenAI(SYSTEM_PROMPT, userPrompt);
        aiProvider = "openai";
        aiModel = OPENAI_MODEL;
        fallbackUsed = true;
        fallbackReason = "glm_invalid_json";
        itineraryData = parseAndSanitizeItinerary(rawContent, aiProvider);
      } else {
        console.error("Failed to parse OpenAI response:", rawContent);
        throw new Error("AI generated invalid response format. Please try again.");
      }
    }

    itineraryData.dailyPlans = groundGeneratedDailyPlans(
      itineraryData.dailyPlans,
      groundedCandidateSpots,
      { days, interests, localnessLevel, pace },
    );

    const paceStops = getPaceStopRange(pace);
    if (
      itineraryData.dailyPlans.length !== days ||
      itineraryData.dailyPlans.some((day: { activities?: unknown[] }) =>
        !day.activities || day.activities.length < paceStops.min || day.activities.length > paceStops.max
      )
    ) {
      throw new Error("Not enough verified photographed spots matched this itinerary. Please try another preference mix.");
    }

    // Geocode activities to store lat/lng for instant map rendering
    try {
      itineraryData.dailyPlans = await geocodeItineraryActivities(itineraryData.dailyPlans, normalizedCity);
    } catch (geoError) {
      console.error('[generate] Geocoding failed (non-fatal):', geoError);
      // Continue without geocoding — maps will fall back to display-time geocoding
    }

    // Add thumbnail images to activities
    // Use AI-generated images for Pro/Premium users, Unsplash for Free/Anonymous
    const useAIImages = !isAnonymous && hasFeature(tier, 'activityImages') === 'ai-generated';

    let dailyPlansWithImages;
    if (useAIImages) {
      // Pro/Premium: Generate AI thumbnails (max 6 to avoid long wait times)
      dailyPlansWithImages = await addAIThumbnailsToItinerary(
        itineraryData.dailyPlans,
        normalizedCity,
        6 // Generate up to 6 AI images, rest use Unsplash
      );
    } else {
      // Free tier / Anonymous: Use Unsplash placeholders
      dailyPlansWithImages = addThumbnailsToItinerary(itineraryData.dailyPlans, normalizedCity);
    }

    itineraryData.dailyPlans = dailyPlansWithImages;

    let savedItinerary = null;

    // Only save to database for authenticated users
    if (!isAnonymous && userId) {
      const userDbId = await getOrCreateUserDbId(supabase, userId);

      // Only try to save if we have a valid user ID
      if (userDbId) {
        const { data, error: saveError } = await supabase
          .from('itineraries')
          .insert([
            {
              user_id: userDbId,  // Required FK to users table
              clerk_user_id: userId,  // For direct querying
              title: itineraryData.title,
              subtitle: itineraryData.subtitle,
              city: normalizedCity,
              days: days,
              activities: buildItineraryPlanPayload(itineraryData.dailyPlans, itineraryData.insights),
              local_score: itineraryData.localScore,
              shared: false,
              highlights: itineraryData.highlights,
              estimated_cost: itineraryData.estimatedCost,
            },
          ])
          .select()
          .single();

        if (saveError) {
          console.error('Error saving itinerary:', saveError);
          // Continue even if save fails - return the itinerary
        } else {
          savedItinerary = data;
        }
      } else {
        console.error('Cannot save itinerary: no user_id found');
      }

      // Usage already tracked atomically - no need for separate call
      // Award XP for creating itinerary (fire and forget)
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
      } catch (xpError) {
        console.error('Error awarding XP:', xpError);
      }
    }

    // Build response
    const response = NextResponse.json({
      success: true,
      isAnonymous,
      itinerary: {
        id: savedItinerary?.id,
        ...itineraryData,
      },
      meta: {
        provider: aiProvider,
        model: aiModel,
        fallbackUsed,
        fallbackReason,
        primaryProvider: aiResponse.primaryProvider,
        primaryModel: aiResponse.primaryModel,
        primaryConfigured: aiResponse.primaryConfigured,
      },
      // For anonymous users, prompt them to sign up to save
      ...(isAnonymous && {
        signupPrompt: {
          message: "Sign up to save this itinerary and create more!",
          benefits: [
            "Save and access your itineraries anytime",
            "Choose Pro or Premium for ongoing trip planning",
            "Chat with Alley for personalized tips",
            "Export to PDF and share with friends",
          ],
          signupUrl: "/sign-up",
        },
      }),
    });

    // Set anonymous usage cookie for anonymous users
    if (isAnonymous) {
      const currentUsage = await getAnonymousUsage();
      response.cookies.set(ANON_COOKIE_NAME, String(currentUsage + 1), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    return response;
  } catch (error) {
    console.error("Error generating itinerary:", error);
    return handleApiError(error, "itinerary-generate");
  }
}
