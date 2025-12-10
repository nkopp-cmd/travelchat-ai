import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

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
        const supabase = createSupabaseAdmin();

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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const supabase = createSupabaseAdmin();

        // Verify itinerary exists and is public/shared
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("id, clerk_user_id, shared, is_public")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
        }

        // Can't like your own itinerary
        if (itinerary.clerk_user_id === userId) {
            return NextResponse.json({ error: "Cannot like your own itinerary" }, { status: 400 });
        }

        // Must be shared or public
        if (!itinerary.shared && !itinerary.is_public) {
            return NextResponse.json({ error: "Itinerary is not public" }, { status: 403 });
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
            return NextResponse.json({ error: "Failed to like" }, { status: 500 });
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
        console.error("Like error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const supabase = createSupabaseAdmin();

        // Remove the like
        const { error: deleteError } = await supabase
            .from("saved_itineraries")
            .delete()
            .eq("clerk_user_id", userId)
            .eq("itinerary_id", id);

        if (deleteError) {
            console.error("Error unliking itinerary:", deleteError);
            return NextResponse.json({ error: "Failed to unlike" }, { status: 500 });
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
        console.error("Unlike error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
