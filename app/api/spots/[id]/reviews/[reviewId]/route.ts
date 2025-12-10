import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// PUT - Update a review
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: spotId, reviewId } = await params;
        const body = await request.json();
        const { rating, comment, visitDate } = body;

        // Validate rating
        if (rating && (rating < 1 || rating > 5)) {
            return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
        }

        // Validate comment length
        if (comment && comment.length > 1000) {
            return NextResponse.json({ error: "Comment must be under 1000 characters" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        // Verify ownership
        const { data: existing } = await supabase
            .from("spot_reviews")
            .select("clerk_user_id")
            .eq("id", reviewId)
            .single();

        if (!existing) {
            return NextResponse.json({ error: "Review not found" }, { status: 404 });
        }

        if (existing.clerk_user_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
            return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
        }

        // Update spot stats
        await updateSpotStats(supabase, spotId);

        return NextResponse.json(review);
    } catch (error) {
        console.error("Review update error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: spotId, reviewId } = await params;
        const supabase = createSupabaseAdmin();

        // Verify ownership
        const { data: existing } = await supabase
            .from("spot_reviews")
            .select("clerk_user_id")
            .eq("id", reviewId)
            .single();

        if (!existing) {
            return NextResponse.json({ error: "Review not found" }, { status: 404 });
        }

        if (existing.clerk_user_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Delete review
        const { error } = await supabase
            .from("spot_reviews")
            .delete()
            .eq("id", reviewId);

        if (error) {
            console.error("Error deleting review:", error);
            return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
        }

        // Update spot stats
        await updateSpotStats(supabase, spotId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Review delete error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// Helper function to update spot stats
async function updateSpotStats(supabase: ReturnType<typeof createSupabaseAdmin>, spotId: string) {
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
