import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";

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
        const { title, city, days, highlights, estimated_cost } = body;

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

        // Update itinerary
        const { data, error } = await supabase
            .from("itineraries")
            .update({
                title,
                city,
                activities: days,
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
