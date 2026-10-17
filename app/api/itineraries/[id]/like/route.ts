import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";
import { trackEngagement } from "@/lib/engagement-tracking";
import { addPreviewItineraryLike, assertPreviewLikeUser, isPreviewItineraryLikeCandidate,
    previewLikeStatus, removePreviewItineraryLike } from "@/lib/app-data/preview-itinerary-likes";

async function candidateLike(id: string, userId: string, method: "GET" | "POST" | "DELETE") {
    const headers = { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" };
    try {
        await assertPreviewLikeUser(userId);
        if (method === "GET") return NextResponse.json(await previewLikeStatus(userId, id), { headers });
        if (method === "DELETE") return NextResponse.json(await removePreviewItineraryLike(userId, id), { headers });
        const result = await addPreviewItineraryLike(userId, id);
        if (result.state === "missing") return NextResponse.json({ error: "Itinerary not found" }, { status: 404, headers });
        if (result.state === "own") return NextResponse.json({ error: "Cannot like your own itinerary" }, { status: 400, headers });
        if (result.state === "private") return NextResponse.json({ error: "Itinerary is not public" }, { status: 403, headers });
        return NextResponse.json({ liked: true, likeCount: result.likeCount,
            ...(result.duplicate ? { message: "Already liked" } : {}) }, { headers });
    } catch (error) {
        console.error("[PREVIEW_ITINERARY_LIKE] D1 unavailable", error);
        return NextResponse.json({ error: "Itinerary likes unavailable" }, { status: 503, headers });
    }
}

// GET - Check if user has liked an itinerary
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ liked: false, likeCount: 0 });
        }

        const { id } = await params;
        if (isPreviewItineraryLikeCandidate(request)) return candidateLike(id, userId, "GET");
        const supabase = await createSupabaseServerClient();

        const { data: target, error: targetError } = await createSupabaseAdmin()
            .from("itineraries").select("clerk_user_id, shared, is_public").eq("id", id).maybeSingle();
        if (targetError) return Errors.databaseError();
        if (!target) return Errors.notFound("Itinerary");
        if (target.clerk_user_id !== userId && !target.shared && !target.is_public) return Errors.forbidden();

        // Check if user has liked this itinerary
        const { data: saved } = await supabase
            .from("saved_itineraries")
            .select("id")
            .eq("clerk_user_id", userId)
            .eq("itinerary_id", id)
            .single();

        // Get total like count
        const { count, error: countError } = await createSupabaseAdmin()
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);
        if (countError) return Errors.databaseError();

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
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        if (isPreviewItineraryLikeCandidate(request)) return candidateLike(id, userId, "POST");
        const supabase = await createSupabaseServerClient();

        // Verify itinerary exists and is public/shared
        const { data: itinerary, error: fetchError } = await createSupabaseAdmin()
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
        const { count, error: countError } = await createSupabaseAdmin()
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);
        if (countError) return Errors.databaseError();

        const { data: updated, error: updateError } = await createSupabaseAdmin()
            .from("itineraries")
            .update({ like_count: count || 0 })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (updateError || !updated) return Errors.databaseError();

        void trackEngagement(userId, "itinerary_save", id, itinerary.clerk_user_id);

        return NextResponse.json({ liked: true, likeCount: count || 0 });
    } catch (error) {
        return handleApiError(error, "itinerary-like");
    }
}

// DELETE - Unlike/unsave an itinerary
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        if (isPreviewItineraryLikeCandidate(request)) return candidateLike(id, userId, "DELETE");
        const supabase = await createSupabaseServerClient();

        const { data: target, error: targetError } = await createSupabaseAdmin()
            .from("itineraries").select("clerk_user_id, shared, is_public").eq("id", id).maybeSingle();
        if (targetError) return Errors.databaseError();
        if (!target) return Errors.notFound("Itinerary");
        const canSeeCount = target.clerk_user_id === userId || target.shared || target.is_public;

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
        const { count, error: countError } = await createSupabaseAdmin()
            .from("saved_itineraries")
            .select("*", { count: "exact", head: true })
            .eq("itinerary_id", id);
        if (countError) return Errors.databaseError();

        const { data: updated, error: updateError } = await createSupabaseAdmin()
            .from("itineraries")
            .update({ like_count: count || 0 })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (updateError || !updated) return Errors.databaseError();

        return NextResponse.json({ liked: false, likeCount: canSeeCount ? count || 0 : 0 });
    } catch (error) {
        return handleApiError(error, "itinerary-unlike");
    }
}
