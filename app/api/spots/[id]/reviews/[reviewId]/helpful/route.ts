import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";

// POST - Mark review as helpful
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { reviewId } = await params;
        const supabase = await createSupabaseServerClient();

        // Check if review exists
        const { data: review } = await supabase
            .from("spot_reviews")
            .select("id, clerk_user_id, helpful_count")
            .eq("id", reviewId)
            .single();

        if (!review) {
            return Errors.notFound("Review");
        }

        // Can't vote on own review
        if (review.clerk_user_id === userId) {
            return Errors.validationError("Cannot vote on your own review");
        }

        // Add vote
        const { error: voteError } = await supabase
            .from("review_helpful_votes")
            .insert({
                review_id: reviewId,
                clerk_user_id: userId,
            });

        if (voteError) {
            // Duplicate vote
            if (voteError.code === "23505") {
                return apiError(ErrorCodes.CONFLICT, "Already voted");
            }
            console.error("Error adding vote:", voteError);
            return Errors.databaseError();
        }

        // Update helpful count
        const newCount = (review.helpful_count || 0) + 1;
        await supabase
            .from("spot_reviews")
            .update({ helpful_count: newCount })
            .eq("id", reviewId);

        return NextResponse.json({ helpful_count: newCount, voted: true });
    } catch (error) {
        return handleApiError(error, "review-helpful-add");
    }
}

// DELETE - Remove helpful vote
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { reviewId } = await params;
        const supabase = await createSupabaseServerClient();

        // Check if review exists
        const { data: review } = await supabase
            .from("spot_reviews")
            .select("id, helpful_count")
            .eq("id", reviewId)
            .single();

        if (!review) {
            return Errors.notFound("Review");
        }

        // Remove vote
        const { error: deleteError } = await supabase
            .from("review_helpful_votes")
            .delete()
            .eq("review_id", reviewId)
            .eq("clerk_user_id", userId);

        if (deleteError) {
            console.error("Error removing vote:", deleteError);
            return Errors.databaseError();
        }

        // Update helpful count
        const newCount = Math.max(0, (review.helpful_count || 0) - 1);
        await supabase
            .from("spot_reviews")
            .update({ helpful_count: newCount })
            .eq("id", reviewId);

        return NextResponse.json({ helpful_count: newCount, voted: false });
    } catch (error) {
        return handleApiError(error, "review-helpful-remove");
    }
}
