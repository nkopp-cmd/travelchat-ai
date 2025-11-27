import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const supabase = createSupabaseAdmin();

        // Fetch the original itinerary
        const { data: original, error: fetchError } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !original) {
            return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
        }

        // Check ownership or if it's public
        if (original.clerk_user_id !== userId && !original.is_public) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Create a copy with new ID and timestamps
        const { data: newItinerary, error: insertError } = await supabase
            .from("itineraries")
            .insert({
                clerk_user_id: userId,
                title: `${original.title} (Copy)`,
                subtitle: original.subtitle,
                city: original.city,
                days: original.days,
                daily_plans: original.daily_plans,
                preferences: original.preferences,
                local_score: original.local_score,
                status: "draft",
                is_favorite: false,
                is_public: false,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error duplicating itinerary:", insertError);
            return NextResponse.json({ error: "Failed to duplicate" }, { status: 500 });
        }

        return NextResponse.json(newItinerary);
    } catch (error) {
        console.error("Duplicate error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
