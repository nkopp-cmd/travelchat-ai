import { rateLimiters } from "@/lib/rate-limit";
import { logGenerateOutcome, logItineraryFormatFailure, logItineraryRequestFailure, type GenerateOutcome } from "./diagnostics";
import { DRAFT_COOKIE, draftCookieOptions, keepServerDraft, previewDraftKv } from "@/lib/trips/preview-draft-store";
import { isPresetPlanInput, planCacheKey, readCachedPlan, writeCachedPlan } from "@/lib/trips/plan-cache";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseAdmin } from '@/lib/supabase';
import { addThumbnailsToItinerary, addAIThumbnailsToItinerary } from '@/lib/activity-images';
import { hasFeature, SubscriptionTier } from '@/lib/subscription';
import { generateCorridorItinerarySchema, generateItinerarySchema } from '@/lib/validations';
import { checkAndIncrementUsage, checkUsageLimit, getUserTier } from '@/lib/usage-tracking';
import { validateCityForItinerary } from '@/lib/cities';
import { isCheckTraffic } from '@/lib/check-traffic';
import { cookies } from 'next/headers';
import { Errors, apiError, ErrorCodes } from '@/lib/api-errors';
import { geocodeItineraryActivities } from '@/lib/geocoding';
import { shouldShowPublicSpot } from '@/lib/spots/public-quality';
import { itinerarySpotPoolQuery } from './spot-pool';
import { buildItineraryPlanPayload } from '@/lib/itineraries/normalize-daily-plans';
import { generateItineraryTextWithFallback } from './provider-fallback';
import {
  buildItinerarySpotContext,
  getPaceStopRange,
  groundGeneratedDailyPlans,
  hasItineraryGroundingCoverage,
  rankItineraryGroundingSpots,
  pinSelectedSpot,
  suggestCoverageFallback,
  describeCoverageSuggestion,
  ensurePinnedSpot,
  type ItineraryGroundingPreferences,
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
  if (!usage) return 0;
  // A tampered value ("abc" parsed as NaN, a negative count) must not reopen the free trip: treat it as used up.
  return /^\d{1,6}$/.test(usage.value) ? Number(usage.value) : ANON_LIMIT;
}


// Push AO1: the only real planner request on 2026-11-15 got 400 and the Worker log did not say why.
// Log field paths and zod codes only, never the submitted values (city text, prompts).
function logRejectedInput(kind: "single" | "corridor" | "body", issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string }>) {
  const fields = issues.slice(0, 10).map((issue) => `${issue.path.map(String).join(".") || "(root)"}:${issue.code}`);
  console.warn(`[generate] rejected ${kind} input: ${fields.join(", ")}`);
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const outcome: GenerateOutcome = { tier: "unknown", ...(isCheckTraffic(req.headers) && { check: true }) };
  const response = await generate(req, outcome);
  logGenerateOutcome(response.status, outcome, Date.now() - started);
  return response;
}

async function generate(req: NextRequest, outcome: GenerateOutcome) {
  try {
    const limited = await rateLimiters.strict(req);
    if (limited) { outcome.reason = "rate_limited"; return limited; }
    const { userId } = await auth();
    const isAnonymous = !userId;
    outcome.tier = isAnonymous ? "anon" : "free";
    let tier: SubscriptionTier = "free";

    // Handle anonymous users
    if (isAnonymous) {
      const anonUsage = await getAnonymousUsage();

      if (anonUsage >= ANON_LIMIT) {
        outcome.reason = "anon_limit";
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
      logRejectedInput("body", [{ path: [], code: "invalid_json" }]);
      outcome.reason = "invalid_input";
      return Errors.validationError("Request body must be valid JSON");
    }

    if (rawBody && typeof rawBody === "object" && "corridor" in rawBody) {
      const corridorValidation = generateCorridorItinerarySchema.safeParse(rawBody);
      if (!corridorValidation.success) {
        const errors = corridorValidation.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        logRejectedInput("corridor", corridorValidation.error.issues);
        outcome.reason = "invalid_input";
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
      outcome.reason = corridorResponse.status < 400 ? undefined : "corridor";
      return corridorResponse;
    }

    const validation = generateItinerarySchema.safeParse(rawBody);
    if (!validation.success) {
      const errors = validation.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      logRejectedInput("single", validation.error.issues);
      outcome.reason = "invalid_input";
      return Errors.validationError(errors || "Invalid request body");
    }

    // Load tier without consuming quota while candidate coverage is validated.
    if (!isAnonymous) {
      tier = await getUserTier(userId!);
      outcome.tier = tier === "free" ? "free" : "paid";
      const allowance = await checkUsageLimit(userId!, "itineraries_created", tier);
      if (!allowance.allowed) {
        outcome.reason = "monthly_limit";
        return Errors.limitExceeded(
          "itineraries",
          allowance.currentUsage,
          allowance.limit,
          allowance.periodResetAt,
        );
      }
    }

    const { city, days, interests, budget, localnessLevel, pace, groupType, templatePrompt, spotId } = validation.data;

    // Validate city is supported
    const cityValidation = validateCityForItinerary(city);
    if (!cityValidation.valid) {
      logRejectedInput("single", [{ path: ["city"], code: "unsupported_city" }]);
      outcome.reason = "invalid_input";
      return Errors.validationError(cityValidation.error!);
    }
    const cityConfig = cityValidation.city!;
    outcome.city = cityConfig.slug;
    const normalizedCity = cityConfig.name;

    // Signed-in plans spend one of the month's trips, also when the plan comes from the cache.
    let quotaSpent = false;
    const consumeQuota = async () => {
      if (isAnonymous || quotaSpent) return null;
      quotaSpent = true;
      const { allowed, usage, tier: userTier } = await checkAndIncrementUsage(userId!, "itineraries_created");
      tier = userTier;
      outcome.tier = tier === "free" ? "free" : "paid";
      if (!allowed) {
        outcome.reason = "monthly_limit";
        return Errors.limitExceeded(
          "itineraries",
          usage.currentUsage,
          usage.limit,
          usage.periodResetAt
        );
      }
      return null;
    };

    // One response shape for a generated plan and a cached one (Push BL1).
    const previewResponse = async (
      itineraryData: Record<string, unknown> & { dailyPlans: unknown[] },
      savedId: string | undefined,
      meta: Record<string, unknown>,
    ) => {
      const itinerary = { id: savedId, ...itineraryData, city: normalizedCity, days };
      // Anonymous and free plans open as a preview; keep a server copy so the preview page renders it in HTML.
      const preview = isAnonymous || tier === "free" ? await keepServerDraft(itinerary) : null;
      const response = NextResponse.json({
        success: true,
        isAnonymous,
        requiresSaveUpgrade: tier === "free",
        itinerary,
        ...(preview && { preview: { id: preview.id } }),
        meta,
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

      if (preview) response.cookies.set(DRAFT_COOKIE, preview.id, draftCookieOptions());

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
    };

    // Push BL1: the same anonymous/free inputs return the plan kept from an earlier request (lib/trips/plan-cache.ts),
    // skipping the spot query and the 10-30 s model call. Paid tiers always generate (AI images, saved row).
    const planKv = isAnonymous || tier === "free" ? previewDraftKv() : null;
    const planInput = { city: normalizedCity, days, interests, budget, localnessLevel, pace, groupType, templatePrompt, spotId };
    const planKey = planKv ? await planCacheKey(planInput) : null;
    const cachedPlan = planKey ? await readCachedPlan(planKey, days, planKv) : null;
    if (planKv) outcome.cache = cachedPlan ? "hit" : "miss";
    if (cachedPlan) {
      const quotaDeniedForCache = await consumeQuota();
      if (quotaDeniedForCache) return quotaDeniedForCache;
      if (tier === "free" || isAnonymous) {
        outcome.provider = cachedPlan.provider;
        return await previewResponse(structuredClone(cachedPlan.itineraryData), undefined, {
          provider: cachedPlan.provider, model: cachedPlan.model, fallbackUsed: false, fallbackReason: undefined,
          primaryProvider: cachedPlan.provider, primaryModel: cachedPlan.model, primaryConfigured: true, cached: true,
        });
      }
      // The account turned paid between the two reads: generate the full plan below (quota already spent).
    }

    // Fetch spots from the city to include in recommendations
    const supabase = createSupabaseAdmin();
    const spotsQuery = itinerarySpotPoolQuery(supabase, normalizedCity, spotId);

    const { data: spots, error: spotsError } = await spotsQuery;
    if (spotsError) {
      throw new Error(`Could not load verified itinerary spots: ${spotsError.message}`);
    }
    const visibleSpots = (spots || []).filter((spot) => shouldShowPublicSpot(spot));
    const groundFor = (preferences: ItineraryGroundingPreferences) => pinSelectedSpot(
      rankItineraryGroundingSpots(visibleSpots as ItineraryGroundingSpot[], preferences),
      visibleSpots as ItineraryGroundingSpot[],
      spotId,
    );
    const { spots: groundingSpots, pinnedId } = groundFor({ days, interests, localnessLevel, pace });
    const hasGroundingCoverage = hasItineraryGroundingCoverage(
      groundingSpots,
      { days, interests, localnessLevel, pace },
    );

    if (!hasGroundingCoverage) {
      outcome.reason = "no_spots";
      // Push CG3: name one mix that passes the same check, so the planner can offer it as one tap.
      const suggestion = suggestCoverageFallback(
        { days, interests, localnessLevel, pace },
        (preferences) => hasItineraryGroundingCoverage(groundFor(preferences).spots, preferences),
      );
      outcome.suggestion = suggestion !== null;
      return NextResponse.json({
        error: "insufficient_verified_spots",
        message: suggestion
          ? `Localley cannot fill this exact ${normalizedCity} mix yet. A ${describeCoverageSuggestion(suggestion, interests ?? [])} works now.`
          : `Localley does not yet have enough verified, photographed ${normalizedCity} spots for this exact pace and interest mix. Try fewer days, a slower pace, or broader interests.`,
        ...(suggestion && { suggestion }),
      }, { status: 422 });
    }

    const groundedCandidateSpots = groundingSpots;

    // Consume quota only after the request can be fulfilled with grounded spots.
    const quotaDenied = await consumeQuota();
    if (quotaDenied) return quotaDenied;

    const spotsContext = groundedCandidateSpots.length > 0
      ? `\n\nVERIFIED CANDIDATES — choose ONLY from this list and return the exact spotId for every activity:\n${buildItinerarySpotContext(groundedCandidateSpots)}`
      : '';

    // The id is first in the candidate list below; ensurePinnedSpot adds it if the model leaves it out.
    const pinnedLine = pinnedId ? `\n- Must include: the traveler chose spotId ${pinnedId}; put it in the plan.` : '';

    const userPrompt = `
Create a ${days}-day itinerary for ${normalizedCity} with these preferences:
- Interests: ${interests?.join(', ') || 'general exploration'}
- Budget: ${budget || 'moderate'}
- Localness Level: ${localnessLevel || 3}/5 (5 = maximum local authenticity)
- Pace: ${pace || 'moderate'}
- Group Type: ${groupType || 'solo'}${pinnedLine}
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
    outcome.provider = aiProvider;
    let aiModel = aiResponse.model;
    let fallbackUsed = aiResponse.fallbackUsed;
    let fallbackReason = aiResponse.fallbackReason;

    // Parse and validate the response
    let itineraryData;
    try {
      itineraryData = parseAndSanitizeItinerary(rawContent, aiProvider);
    } catch {
      if (aiProvider === "glm") {
        logItineraryFormatFailure("glm", rawContent);
        rawContent = await generateWithOpenAI(SYSTEM_PROMPT, userPrompt);
        aiProvider = "openai";
        aiModel = OPENAI_MODEL;
        fallbackUsed = true;
        fallbackReason = "glm_invalid_json";
        itineraryData = parseAndSanitizeItinerary(rawContent, aiProvider);
      } else {
        logItineraryFormatFailure("openai", rawContent);
        throw new Error("AI generated invalid response format. Please try again.");
      }
    }

    itineraryData.dailyPlans = ensurePinnedSpot(
      groundGeneratedDailyPlans(itineraryData.dailyPlans, groundedCandidateSpots, { days, interests, localnessLevel, pace }),
      groundedCandidateSpots,
      pinnedId,
      { days, interests, localnessLevel, pace },
    );

    const paceStops = getPaceStopRange(pace);
    if (
      itineraryData.dailyPlans.length !== days ||
      itineraryData.dailyPlans.some((day: { activities?: unknown[] }) =>
        !day.activities || day.activities.length < paceStops.min || day.activities.length > paceStops.max
      )
    ) {
      outcome.reason = "no_spots";
      return NextResponse.json({
        error: "insufficient_verified_spots",
        message: `Localley could not build a full ${normalizedCity} plan from its verified spots for this mix. Try fewer days, a slower pace, or broader interests.`,
      }, { status: 422 });
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
    if (planKey && planKv && (isAnonymous || tier === "free")) {
      await writeCachedPlan(planKey, { itineraryData, provider: aiProvider, model: aiModel }, planKv, { preset: isPresetPlanInput(planInput) });
    }

    let savedItinerary = null;

    // Only save to database for authenticated users
    if (!isAnonymous && userId && tier !== "free") {
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
    outcome.provider = aiProvider;
    return await previewResponse(itineraryData, savedItinerary?.id, {
      provider: aiProvider,
      model: aiModel,
      fallbackUsed,
      fallbackReason,
      primaryProvider: aiResponse.primaryProvider,
      primaryModel: aiResponse.primaryModel,
      primaryConfigured: aiResponse.primaryConfigured,
    });
  } catch {
    logItineraryRequestFailure();
    outcome.reason = "error";
    return Errors.internalError();
  }
}
