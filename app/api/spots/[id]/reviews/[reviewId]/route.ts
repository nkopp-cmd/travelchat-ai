import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

// PUT - Update a review
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id: spotId, reviewId } = await params;
        const body = await request.json();
        const { rating, comment, visitDate } = body;

        // Validate rating
        if (rating && (rating < 1 || rating > 5)) {
            return Errors.validationError("Rating must be between 1 and 5");
        }

        // Validate comment length
        if (comment && comment.length > 1000) {
            return Errors.validationError("Comment must be under 1000 characters");
        }

        const supabase = await createSupabaseServerClient();

        // Verify ownership
        const { data: existing } = await supabase
            .from("spot_reviews")
            .select("clerk_user_id")
            .eq("id", reviewId)
            .single();

        if (!existing) {
            return Errors.notFound("Review");
        }

        if (existing.clerk_user_id !== userId) {
            return Errors.forbidden();
        }

        // Update review
        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (rating !== undefined) updateData.rating = rating;
        if (comment !== undefined) updateData.comment = comment || null;
        if (visitDate !== undefined) updateData.visit_date = visitDate || null;

        const { data: review, error } = await supabase
            .from("spot_reviews")
            .update(updateData)
            .eq("id", reviewId)
            .select()
            .single();

        if (error) {
            console.error("Error updating review:", error);
            return Errors.databaseError();
        }

        // Update spot stats
        await updateSpotStats(supabase, spotId);

        return NextResponse.json(review);
    } catch (error) {
        return handleApiError(error, "review-update");
    }
}

// DELETE - Delete a review
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id: spotId, reviewId } = await params;
        const supabase = await createSupabaseServerClient();

        // Verify ownership
        const { data: existing } = await supabase
            .from("spot_reviews")
            .select("clerk_user_id")
            .eq("id", reviewId)
            .single();

        if (!existing) {
            return Errors.notFound("Review");
        }

        if (existing.clerk_user_id !== userId) {
            return Errors.forbidden();
        }

        // Delete review
        const { error } = await supabase
            .from("spot_reviews")
            .delete()
            .eq("id", reviewId);

        if (error) {
            console.error("Error deleting review:", error);
            return Errors.databaseError();
        }

        // Update spot stats
        await updateSpotStats(supabase, spotId);

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, "review-delete");
    }
}

// Helper function to update spot stats
async function updateSpotStats(supabase: SupabaseClient, spotId: string) {
    const { data: stats } = await supabase
        .from("spot_reviews")
        .select("rating")
        .eq("spot_id", spotId);

    const count = stats?.length || 0;
    const avg = count > 0
        ? stats!.reduce((sum, s) => sum + s.rating, 0) / count
        : 0;

    await supabase
        .from("spots")
        .update({
            review_count: count,
            average_rating: Math.round(avg * 10) / 10,
        })
        .eq("id", spotId);
}
