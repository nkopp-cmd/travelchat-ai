import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

// GET - Check if user has liked an itinerary
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ liked: false, likeCount: 0 });
        }

        const { id } = await params;
        const supabase = await createSupabaseServerClient();

        // Check if user has liked this itinerary
        const { data: saved } = await supabase
            .from("saved_itineraries")
            .select("id")
            .eq("clerk_user_id", userId)
            .eq("itinerary_id", id)
            .single();

        // Get total like count
        const { count } = await supabase
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);

        return NextResponse.json({
            liked: !!saved,
            likeCount: count || 0,
        });
    } catch (error) {
        console.error("Error checking like status:", error);
        return NextResponse.json({ liked: false, likeCount: 0 });
    }
}

// POST - Like/save an itinerary
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

        // Verify itinerary exists and is public/shared
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("id, clerk_user_id, shared, is_public")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        // Can't like your own itinerary
        if (itinerary.clerk_user_id === userId) {
            return Errors.validationError("Cannot like your own itinerary");
        }

        // Must be shared or public
        if (!itinerary.shared && !itinerary.is_public) {
            return Errors.forbidden("Itinerary is not public.");
        }

        // Add the like
        const { error: insertError } = await supabase
            .from("saved_itineraries")
            .insert({
                clerk_user_id: userId,
                itinerary_id: id,
            });

        if (insertError) {
            // If duplicate, that's ok - user already liked it
            if (insertError.code === "23505") {
                return NextResponse.json({ liked: true, message: "Already liked" });
            }
            console.error("Error liking itinerary:", insertError);
            return Errors.databaseError();
        }

        // Update cached like count
        const { count } = await supabase
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);

        await supabase
            .from("itineraries")
            .update({ like_count: count || 0 })
            .eq("id", id);

        return NextResponse.json({ liked: true, likeCount: count || 0 });
    } catch (error) {
        return handleApiError(error, "itinerary-like");
    }
}

// DELETE - Unlike/unsave an itinerary
export async function DELETE(
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

        // Remove the like
        const { error: deleteError } = await supabase
            .from("saved_itineraries")
            .delete()
            .eq("clerk_user_id", userId)
            .eq("itinerary_id", id);

        if (deleteError) {
            console.error("Error unliking itinerary:", deleteError);
            return Errors.databaseError();
        }

        // Update cached like count
        const { count } = await supabase
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);

        await supabase
            .from("itineraries")
            .update({ like_count: count || 0 })
            .eq("id", id);

        return NextResponse.json({ liked: false, likeCount: count || 0 });
    } catch (error) {
        return handleApiError(error, "itinerary-unlike");
    }
}
