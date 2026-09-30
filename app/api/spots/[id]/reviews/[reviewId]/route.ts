import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPreviewReviewUser, deletePreviewSpotReview, isPreviewSpotReviewCandidate,
    parseReviewInput, updatePreviewSpotReview } from "@/lib/app-data/preview-spot-reviews";

const candidateHeaders = { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" };

// PUT - Update a review
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id: spotId, reviewId } = await params;
        if (isPreviewSpotReviewCandidate(request)) {
            const changes = parseReviewInput(await request.json().catch(() => null), true);
            if (!changes) return NextResponse.json({ error: "Invalid review" }, { status: 400, headers: candidateHeaders });
            try {
                await assertPreviewReviewUser(userId);
                const result = await updatePreviewSpotReview(spotId, reviewId, userId, changes);
                if (result.state === "missing") return NextResponse.json({ error: "Review not found" },
                    { status: 404, headers: candidateHeaders });
                if (result.state === "forbidden") return NextResponse.json({ error: "Forbidden" },
                    { status: 403, headers: candidateHeaders });
                return NextResponse.json(result.review, { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_SPOT_REVIEWS] D1 unavailable", error);
                return NextResponse.json({ error: "Reviews unavailable" }, { status: 503, headers: candidateHeaders });
            }
        }
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
    request: NextRequest,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id: spotId, reviewId } = await params;
        if (isPreviewSpotReviewCandidate(request)) {
            try {
                await assertPreviewReviewUser(userId);
                const state = await deletePreviewSpotReview(spotId, reviewId, userId);
                if (state === "missing") return NextResponse.json({ error: "Review not found" },
                    { status: 404, headers: candidateHeaders });
                if (state === "forbidden") return NextResponse.json({ error: "Forbidden" },
                    { status: 403, headers: candidateHeaders });
                return NextResponse.json({ success: true }, { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_SPOT_REVIEWS] D1 unavailable", error);
                return NextResponse.json({ error: "Reviews unavailable" }, { status: 503, headers: candidateHeaders });
            }
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
