import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        const supabase = await createSupabaseServerClient();

        // Fetch the original itinerary
        const { data: original, error: fetchError } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !original) {
            return Errors.notFound("Itinerary");
        }

        // Check ownership or if it's shared/public
        const canDuplicate = original.clerk_user_id === userId || original.shared || original.is_public;
        if (!canDuplicate) {
            return Errors.forbidden();
        }

        // Create a copy with new ID and timestamps
        const { data: newItinerary, error: insertError } = await supabase
            .from("itineraries")
            .insert({
                clerk_user_id: userId,
                title: original.clerk_user_id === userId
                    ? `${original.title} (Copy)`
                    : original.title,
                subtitle: original.subtitle,
                city: original.city,
                days: original.days,
                activities: original.activities,
                daily_plans: original.daily_plans,
                preferences: original.preferences,
                local_score: original.local_score,
                highlights: original.highlights,
                estimated_cost: original.estimated_cost,
                status: "draft",
                is_favorite: false,
                is_public: false,
                shared: false,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error duplicating itinerary:", insertError);
            return Errors.databaseError();
        }

        return NextResponse.json(newItinerary);
    } catch (error) {
        return handleApiError(error, "itinerary-duplicate");
    }
}
