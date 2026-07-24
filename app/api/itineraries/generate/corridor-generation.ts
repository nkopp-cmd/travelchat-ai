import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { addThumbnailsToItinerary, addAIThumbnailsToItinerary } from "@/lib/activity-images";
import { hasFeature, SubscriptionTier } from "@/lib/subscription";
import { checkAndIncrementUsage, checkUsageLimit, getUserTier } from "@/lib/usage-tracking";
import { validateCityForItinerary } from "@/lib/cities";
import { Errors } from "@/lib/api-errors";
import { geocodeItineraryActivities } from "@/lib/geocoding";
import type { DailyPlan } from "@/lib/llm/types";
import {
  applyPublicSpotVisibilityFilters,
  shouldShowPublicSpot,
} from "@/lib/spots/public-quality";
import { buildItineraryPlanPayload } from "@/lib/itineraries/normalize-daily-plans";
import { generateItineraryTextWithFallback } from "./provider-fallback";
import {
  buildItinerarySpotContext,
  getPaceStopRange,
  groundGeneratedDailyPlans,
  hasItineraryGroundingCoverage,
  rankItineraryGroundingSpots,
  type ItineraryGroundingSpot,
} from "@/lib/itineraries/grounded-generation";
import {
  MultiCityTripRequestSchema,
  PlannerValidationError,
  planCorridorTrip,
} from "@/lib/trips/corridor-planner";
import { buildCorridorRequest } from "@/lib/trips/wizard-corridor";
import {
  buildCorridorUserPrompt,
  corridorLegsFromPlan,
  corridorRouteLabel,
  corridorTransferInsights,
  splitDailyPlansByLeg,
  transferDayIndexes,
} from "@/lib/itineraries/corridor-prompt";
import {
  OPENAI_MODEL,
  SYSTEM_PROMPT,
  generateWithOpenAI,
  getOrCreateUserDbId,
  parseAndSanitizeItinerary,
} from "./shared";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

type CorridorInput = {
  destinations: Array<{ destinationSlug: string }>;
  totalDays: number;
};

type CorridorPreferences = {
  interests?: string[];
  budget?: "budget" | "cheap" | "moderate" | "luxury" | "splurge";
  localnessLevel?: number;
  pace?: "relaxed" | "moderate" | "active" | "packed";
  groupType?: "solo" | "couple" | "family" | "friends" | "business";
};

export async function handleCorridorGeneration({
  req,
  corridor,
  preferences,
  userId,
  isAnonymous,
}: {
  req: NextRequest;
  corridor: CorridorInput;
  preferences: CorridorPreferences;
  userId: string | null;
  isAnonymous: boolean;
}): Promise<NextResponse> {
  if (process.env.MULTI_CITY_PREVIEW_API !== "on") {
    return notFound();
  }

  let tier: SubscriptionTier = "free";
  if (!isAnonymous && userId) {
    tier = await getUserTier(userId);
    const allowance = await checkUsageLimit(userId, "itineraries_created", tier);
    if (!allowance.allowed) {
      return Errors.limitExceeded(
        "itineraries",
        allowance.currentUsage,
        allowance.limit,
        allowance.periodResetAt,
      );
    }
  }

  const plannerRequest = buildCorridorRequest({
    destinationSlugs: corridor.destinations.map((item) => item.destinationSlug),
    totalDays: corridor.totalDays,
    budget: preferences.budget === "cheap" ? "cheap" : preferences.budget === "splurge" ? "splurge" : "moderate",
    pace: preferences.pace || "moderate",
    groupType: preferences.groupType || "solo",
    interests: preferences.interests || [],
  });

  const parsed = MultiCityTripRequestSchema.safeParse(plannerRequest);
  if (!parsed.success) {
    return Errors.validationError(
      parsed.error.issues.map((issue) => issue.message).join(" ") || "Invalid multi-city request",
    );
  }

  let plan;
  try {
    plan = planCorridorTrip(parsed.data);
  } catch (error) {
    if (error instanceof PlannerValidationError) {
      return NextResponse.json(
        { error: "unsupported_route", message: error.issues.map((issue) => issue.message).join(" ") },
        { status: 422 },
      );
    }
    throw error;
  }

  const cityNameBySlug: Record<string, string> = {};
  for (const stop of plan.stops) {
    const validation = validateCityForItinerary(stop.destinationSlug);
    if (!validation.valid || !validation.city) {
      return Errors.validationError(`City "${stop.destinationSlug}" is not available for itineraries yet.`);
    }
    cityNameBySlug[stop.destinationSlug] = validation.city.name;
  }

  const legs = corridorLegsFromPlan(plan, cityNameBySlug);
  const routeLabel = corridorRouteLabel(legs);
  const interests = preferences.interests || [];
  const pace = preferences.pace || "moderate";
  const localnessLevel = preferences.localnessLevel || 3;

  const supabase = createSupabaseAdmin();
  const groundingByLeg: Array<{ leg: (typeof legs)[number]; spots: ItineraryGroundingSpot[] }> = [];
  for (const leg of legs) {
    let spotsQuery = supabase
      .from("spots")
      .select("*")
      .ilike("address->>en", `%${leg.cityName}%`)
      .gte("localley_score", 3);

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery)
      .order("localley_score", { ascending: false })
      .order("local_percentage", { ascending: false })
      .limit(80);

    const { data: spots, error: spotsError } = await spotsQuery;
    if (spotsError) {
      throw new Error(`Could not load verified itinerary spots: ${spotsError.message}`);
    }
    const visibleSpots = (spots || []).filter((spot) => shouldShowPublicSpot(spot));
    const groundingSpots = rankItineraryGroundingSpots(visibleSpots as ItineraryGroundingSpot[], {
      days: leg.dayIndexes.length,
      interests,
      localnessLevel,
      pace,
    });
    if (!hasItineraryGroundingCoverage(groundingSpots, {
      days: leg.dayIndexes.length,
      interests,
      localnessLevel,
      pace,
    })) {
      return NextResponse.json({
        error: "insufficient_verified_spots",
        message: `Localley does not yet have enough verified, photographed ${leg.cityName} spots for this leg of the trip. Try fewer days in ${leg.cityName}, a slower pace, or broader interests.`,
      }, { status: 422 });
    }
    groundingByLeg.push({ leg, spots: groundingSpots });
  }

  if (!isAnonymous && userId) {
    const { allowed, usage, tier: userTier } = await checkAndIncrementUsage(userId, "itineraries_created");
    tier = userTier;
    if (!allowed) {
      return Errors.limitExceeded(
        "itineraries",
        usage.currentUsage,
        usage.limit,
        usage.periodResetAt,
      );
    }
  }

  const combinedSpots = groundingByLeg.flatMap((entry) => entry.spots);
  const userPrompt = buildCorridorUserPrompt({
    plan,
    legs,
    totalDays: corridor.totalDays,
    interests,
    budget: preferences.budget,
    localnessLevel,
    pace,
    groupType: preferences.groupType,
    spotContextByLeg: groundingByLeg.map((entry) => ({
      slug: entry.leg.slug,
      cityName: entry.leg.cityName,
      context: buildItinerarySpotContext(entry.spots),
    })),
  });

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
    },
  );
  let rawContent = aiResponse.rawContent;
  let aiProvider = aiResponse.provider;
  let aiModel = aiResponse.model;
  let fallbackUsed = aiResponse.fallbackUsed;
  let fallbackReason = aiResponse.fallbackReason;

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
    combinedSpots,
    { days: corridor.totalDays, interests, localnessLevel, pace },
  );

  const paceStops = getPaceStopRange(pace);
  const transferDays = new Set(transferDayIndexes(plan));
  if (
    itineraryData.dailyPlans.length !== corridor.totalDays ||
    itineraryData.dailyPlans.some((day: { day: number; activities?: unknown[] }) => {
      const count = day.activities?.length ?? 0;
      const min = transferDays.has(day.day) ? 1 : paceStops.min;
      return count < min || count > paceStops.max;
    })
  ) {
    throw new Error("Not enough verified photographed spots matched this itinerary. Please try another preference mix.");
  }

  try {
    const chunks = splitDailyPlansByLeg(
      itineraryData.dailyPlans as Array<{ day: number }>,
      legs,
    );
    const geocodedChunks = [];
    for (const chunk of chunks) {
      geocodedChunks.push(await geocodeItineraryActivities(chunk.plans as DailyPlan[], chunk.leg.cityName));
    }
    itineraryData.dailyPlans = geocodedChunks.flat();
  } catch (geoError) {
    console.error("[generate-corridor] Geocoding failed (non-fatal):", geoError);
  }

  const useAIImages = !isAnonymous && hasFeature(tier, "activityImages") === "ai-generated";
  if (useAIImages) {
    itineraryData.dailyPlans = await addAIThumbnailsToItinerary(
      itineraryData.dailyPlans,
      routeLabel,
      6,
    );
  } else {
    itineraryData.dailyPlans = addThumbnailsToItinerary(itineraryData.dailyPlans, routeLabel);
  }

  const transferInsights = corridorTransferInsights(plan, cityNameBySlug);
  itineraryData.insights = [...(itineraryData.insights || []), ...transferInsights];

  let savedItinerary = null;
  if (!isAnonymous && userId) {
    const userDbId = await getOrCreateUserDbId(supabase, userId);
    if (userDbId) {
      const { data, error: saveError } = await supabase
        .from("itineraries")
        .insert([
          {
            user_id: userDbId,
            clerk_user_id: userId,
            title: itineraryData.title,
            subtitle: itineraryData.subtitle,
            city: routeLabel,
            days: corridor.totalDays,
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
        console.error("Error saving corridor itinerary:", saveError);
      } else {
        savedItinerary = data;
      }
    } else {
      console.error("Cannot save itinerary: no user_id found");
    }

    try {
      await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || "",
        },
        body: JSON.stringify({ action: "create_itinerary" }),
      });
    } catch (xpError) {
      console.error("Error awarding XP:", xpError);
    }
  }

  return NextResponse.json({
    success: true,
    isAnonymous,
    itinerary: {
      id: savedItinerary?.id,
      ...itineraryData,
      city: routeLabel,
      days: corridor.totalDays,
      corridor: {
        route: routeLabel,
        legs: legs.map((leg) => ({
          slug: leg.slug,
          cityName: leg.cityName,
          nights: leg.nights,
          dayIndexes: leg.dayIndexes,
        })),
      },
    },
    meta: {
      provider: aiProvider,
      model: aiModel,
      fallbackUsed,
      fallbackReason,
      primaryProvider: aiResponse.primaryProvider,
      primaryModel: aiResponse.primaryModel,
      primaryConfigured: aiResponse.primaryConfigured,
      plannerVersion: plan.plannerVersion,
    },
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
}
