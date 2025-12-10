import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// POST - Mark review as helpful
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { reviewId } = await params;
        const supabase = createSupabaseAdmin();

        // Check if review exists
        const { data: review } = await supabase
            .from("spot_reviews")
            .select("id, clerk_user_id, helpful_count")
            .eq("id", reviewId)
            .single();

        if (!review) {
            return NextResponse.json({ error: "Review not found" }, { status: 404 });
        }

        // Can't vote on own review
        if (review.clerk_user_id === userId) {
            return NextResponse.json({ error: "Cannot vote on your own review" }, { status: 400 });
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
                return NextResponse.json({ error: "Already voted" }, { status: 409 });
            }
            console.error("Error adding vote:", voteError);
            return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
        }

        // Update helpful count
        const newCount = (review.helpful_count || 0) + 1;
        await supabase
            .from("spot_reviews")
            .update({ helpful_count: newCount })
            .eq("id", reviewId);

        return NextResponse.json({ helpful_count: newCount, voted: true });
    } catch (error) {
        console.error("Helpful vote error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { reviewId } = await params;
        const supabase = createSupabaseAdmin();

        // Check if review exists
        const { data: review } = await supabase
            .from("spot_reviews")
            .select("id, helpful_count")
            .eq("id", reviewId)
            .single();

        if (!review) {
            return NextResponse.json({ error: "Review not found" }, { status: 404 });
        }

        // Remove vote
        const { error: deleteError } = await supabase
            .from("review_helpful_votes")
            .delete()
            .eq("review_id", reviewId)
            .eq("clerk_user_id", userId);

        if (deleteError) {
            console.error("Error removing vote:", deleteError);
            return NextResponse.json({ error: "Failed to remove vote" }, { status: 500 });
        }

        // Update helpful count
        const newCount = Math.max(0, (review.helpful_count || 0) - 1);
        await supabase
            .from("spot_reviews")
            .update({ helpful_count: newCount })
            .eq("id", reviewId);

        return NextResponse.json({ helpful_count: newCount, voted: false });
    } catch (error) {
        console.error("Remove vote error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
