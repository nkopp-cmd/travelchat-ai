import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Authenticate user
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get itinerary ID from params
        const { id } = await context.params;

        // Parse request body
        const body = await request.json();
        const { title, city, days, highlights, estimated_cost } = body;

        // Validate required fields
        if (!title || !city || !days || !Array.isArray(days)) {
            return NextResponse.json(
                { error: "Missing required fields: title, city, days" },
                { status: 400 }
            );
        }

        // Validate days structure
        for (const day of days) {
            if (typeof day.day !== "number" || !Array.isArray(day.activities)) {
                return NextResponse.json(
                    { error: "Invalid days structure" },
                    { status: 400 }
                );
            }
        }

        // Check if itinerary exists and user owns it
        const { data: existingItinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !existingItinerary) {
            return NextResponse.json(
                { error: "Itinerary not found" },
                { status: 404 }
            );
        }

        if (existingItinerary.clerk_user_id !== userId) {
            return NextResponse.json(
                { error: "Forbidden: You don't own this itinerary" },
                { status: 403 }
            );
        }

        // Update itinerary
        // Note: 'days' from the request contains the day plans, which should be saved to 'activities' column
        const { data, error } = await supabase
            .from("itineraries")
            .update({
                title,
                city,
                activities: days, // Save day plans to 'activities' column
                highlights: highlights || [],
                estimated_cost: estimated_cost || null,
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Database update error:", error);
            return NextResponse.json(
                { error: "Failed to update itinerary" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            itinerary: data,
        });
    } catch (error) {
        console.error("Update itinerary error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
