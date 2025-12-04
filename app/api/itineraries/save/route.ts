import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { saveItinerarySchema, validateBody } from "@/lib/validations";

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const validation = await validateBody(req, saveItinerarySchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const { title, city, days, activities, localScore } = validation.data;

        // Get internal user ID from Supabase based on Clerk ID
        const supabase = createSupabaseAdmin();
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("clerk_id", userId)
            .single();

        if (userError || !user) {
            // If user doesn't exist in Supabase yet (should be handled by webhook, but fallback here)
            // For now, we'll just return error or create one.
            // Let's assume user exists for now as we have auth.
            console.error("User not found in DB:", userError);
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .insert({
                user_id: user.id,
                clerk_user_id: userId, // Add clerk_user_id for direct querying
                title,
                city,
                days,
                activities,
                local_score: localScore || 50, // Default score
            })
            .select()
            .single();

        if (error) {
            console.error("Error saving itinerary:", error);
            return NextResponse.json({ error: "Failed to save itinerary" }, { status: 500 });
        }

        return NextResponse.json(itinerary);
    } catch (error) {
        console.error("Internal Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
