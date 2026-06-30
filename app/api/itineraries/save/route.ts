import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { saveItinerarySchema, validateBody } from "@/lib/validations";
import { Errors, handleApiError } from "@/lib/api-errors";
import { geocodeItineraryActivities } from "@/lib/geocoding";
import type { DailyPlan } from "@/lib/llm/types";
import {
    buildItineraryPlanPayload,
    normalizeDailyPlansForDisplay,
    sanitizeGeneratedDailyPlans,
    type ItineraryDayPlanLike,
} from "@/lib/itineraries/normalize-daily-plans";

export async function POST(req: Request) {
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
