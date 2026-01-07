import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { saveItinerarySchema, validateBody } from "@/lib/validations";
import { Errors, handleApiError } from "@/lib/api-errors";

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

        const { title, city, days, activities, localScore } = validation.data;

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

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .insert({
                user_id: user.id,
                clerk_user_id: userId,
                title,
                city,
                days,
                activities,
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
