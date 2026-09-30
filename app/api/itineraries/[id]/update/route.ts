import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import {
    buildItineraryPlanPayload,
    normalizeDailyPlansForDisplay,
} from "@/lib/itineraries/normalize-daily-plans";
import { isPreviewItineraryDetailCandidate } from "@/lib/app-data/preview-itinerary-detail";
import { updatePreviewItinerary } from "@/lib/app-data/preview-itinerary-update";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await context.params;
        const body = await request.json();
        const { title, city, days, insights, highlights, estimated_cost } = body;

        // Validate required fields
        if (!title || !city || !days || !Array.isArray(days)) {
            return Errors.validationError("Missing required fields: title, city, days");
        }

        // Validate days structure
        for (const day of days) {
            if (typeof day.day !== "number" || !Array.isArray(day.activities)) {
                return Errors.validationError("Invalid days structure");
            }
        }

        if (isPreviewItineraryDetailCandidate(request)) {
            const withSource = (response: NextResponse) => {
                response.headers.set("X-Localley-Data-Source", "d1-preview");
                response.headers.set("Cache-Control", "no-store");
                return response;
            };
            try {
                const normalizedPlan = normalizeDailyPlansForDisplay(days, insights);
                const activities = buildItineraryPlanPayload(normalizedPlan.dailyPlans, normalizedPlan.insights);
                const result = await updatePreviewItinerary(id, userId, {
                    title, city, activities, highlights: highlights || [], estimatedCost: estimated_cost || null,
                });
                if (result.state === "missing") return withSource(Errors.notFound("Itinerary"));
                if (result.state === "forbidden") return withSource(Errors.forbidden("You don't own this itinerary."));
                return withSource(NextResponse.json({ success: true, itinerary: result.itinerary }));
            } catch (error) {
                if (error instanceof RangeError) return withSource(Errors.validationError(error.message));
                return withSource(Errors.databaseError());
            }
        }

        const supabase = await createSupabaseServerClient();

        // Check if itinerary exists and user owns it
        const { data: existingItinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !existingItinerary) {
            return Errors.notFound("Itinerary");
        }

        if (existingItinerary.clerk_user_id !== userId) {
            return Errors.forbidden("You don't own this itinerary.");
        }

        const normalizedPlan = normalizeDailyPlansForDisplay(days, insights);
        const activitiesPayload = buildItineraryPlanPayload(
            normalizedPlan.dailyPlans,
            normalizedPlan.insights
        );

        // Update itinerary
        const { data, error } = await supabase
            .from("itineraries")
            .update({
                title,
                city,
                activities: activitiesPayload,
                highlights: highlights || [],
                estimated_cost: estimated_cost || null,
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Database update error:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({
            success: true,
            itinerary: data,
        });
    } catch (error) {
        return handleApiError(error, "itinerary-update");
    }
}
