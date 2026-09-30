import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { saveItinerarySchema, validateBody } from "@/lib/validations";
import { Errors, handleApiError } from "@/lib/api-errors";
import { geocodeItineraryActivities } from "@/lib/geocoding";
import type { DailyPlan } from "@/lib/llm/types";
import { isPreviewItineraryDetailCandidate } from "@/lib/app-data/preview-itinerary-detail";
import { savePreviewItinerary } from "@/lib/app-data/preview-itinerary-save";
import {
    buildItineraryPlanPayload,
    normalizeDailyPlansForDisplay,
    sanitizeGeneratedDailyPlans,
    type ItineraryDayPlanLike,
} from "@/lib/itineraries/normalize-daily-plans";

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const validation = await validateBody(req, saveItinerarySchema);
        if (!validation.success) {
            return Errors.validationError(validation.error || "Invalid request");
        }

        const { title, city, days, activities, insights, localScore } = validation.data;

        if (isPreviewItineraryDetailCandidate(req)) {
            const withSource = (response: NextResponse) => {
                response.headers.set("X-Localley-Data-Source", "d1-preview");
                response.headers.set("Cache-Control", "no-store");
                return response;
            };
            try {
                if (activities.length > 14 || activities.some(day => !day || typeof day !== "object"
                    || Array.isArray(day) || !Array.isArray((day as { activities?: unknown }).activities))) {
                    return withSource(Errors.validationError("Invalid itinerary activities"));
                }
                const normalized = normalizeDailyPlansForDisplay(
                    sanitizeGeneratedDailyPlans(activities as ItineraryDayPlanLike[]), insights
                );
                let plans = normalized.dailyPlans as DailyPlan[];
                try {
                    plans = await geocodeItineraryActivities(plans, city);
                } catch (geoError) {
                    console.error("[itinerary-save] Geocoding failed (non-fatal):", geoError);
                }
                const payload = buildItineraryPlanPayload(plans, normalized.insights);
                return withSource(NextResponse.json(await savePreviewItinerary(userId, {
                    title, city, days, activities: payload, localScore,
                })));
            } catch (error) {
                if (error instanceof RangeError) return withSource(Errors.validationError(error.message));
                return withSource(Errors.databaseError());
            }
        }

        // Get internal user ID from Supabase based on Clerk ID
        const supabase = await createSupabaseServerClient();
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("clerk_id", userId)
            .single();

        if (userError || !user) {
            console.error("User not found in DB:", userError);
            return Errors.notFound("User");
        }

        // Geocode activities before saving (critical for chat-saved itineraries)
        const normalized = normalizeDailyPlansForDisplay(
            sanitizeGeneratedDailyPlans(activities as ItineraryDayPlanLike[]),
            insights
        );
        let geocodedActivities = normalized.dailyPlans as DailyPlan[];
        try {
            geocodedActivities = await geocodeItineraryActivities(geocodedActivities, city);
        } catch (geoError) {
            console.error("[itinerary-save] Geocoding failed (non-fatal):", geoError);
        }
        const activitiesPayload = buildItineraryPlanPayload(
            geocodedActivities,
            normalized.insights
        );

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .insert({
                user_id: user.id,
                clerk_user_id: userId,
                title,
                city,
                days,
                activities: activitiesPayload,
                local_score: localScore || 50,
            })
            .select()
            .single();

        if (error) {
            console.error("Error saving itinerary:", error);
            return Errors.databaseError();
        }

        return NextResponse.json(itinerary);
    } catch (error) {
        return handleApiError(error, "itinerary-save");
    }
}
