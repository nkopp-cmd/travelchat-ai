import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ReviewWithUser {
    id: string;
    rating: number;
    comment: string | null;
    visit_date: string | null;
    helpful_count: number;
    created_at: string;
    clerk_user_id: string;
    user: {
        name: string | null;
        avatar_url: string | null;
    } | null;
    user_voted?: boolean;
}

// GET - Fetch reviews for a spot
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: spotId } = await params;
        const { userId } = await auth();
        const supabase = await createSupabaseServerClient();

        const url = new URL(request.url);
        const sortBy = url.searchParams.get("sort") || "recent";
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const offset = parseInt(url.searchParams.get("offset") || "0");

        // Build query
        let query = supabase
            .from("spot_reviews")
            .select(`
                id,
                rating,
                comment,
                visit_date,
                helpful_count,
                created_at,
                clerk_user_id,
                users!spot_reviews_clerk_user_id_fkey (
                    name,
                    avatar_url
                )
            `)
            .eq("spot_id", spotId);

        // Apply sorting
        switch (sortBy) {
            case "helpful":
                query = query.order("helpful_count", { ascending: false });
                break;
            case "highest":
                query = query.order("rating", { ascending: false });
                break;
            case "lowest":
                query = query.order("rating", { ascending: true });
                break;
            case "recent":
            default:
                query = query.order("created_at", { ascending: false });
                break;
        }

        query = query.range(offset, offset + limit - 1);

        const { data: reviews, error } = await query;

        if (error) {
            console.error("Error fetching reviews:", error);
            return Errors.databaseError();
        }

        // Get user's votes if authenticated
        let userVotes: string[] = [];
        if (userId && reviews && reviews.length > 0) {
            const reviewIds = reviews.map((r) => r.id);
            const { data: votes } = await supabase
                .from("review_helpful_votes")
                .select("review_id")
                .eq("clerk_user_id", userId)
                .in("review_id", reviewIds);

            userVotes = (votes || []).map((v) => v.review_id);
        }

        // Get total count for pagination
        const { count } = await supabase
            .from("spot_reviews")
            .select("*", { count: "exact", head: true })
            .eq("spot_id", spotId);

        // Get spot rating stats
        const { data: stats } = await supabase
            .from("spot_reviews")
            .select("rating")
            .eq("spot_id", spotId);

        const ratingDistribution = [0, 0, 0, 0, 0];
        let totalRating = 0;
        (stats || []).forEach((s) => {
            ratingDistribution[s.rating - 1]++;
            totalRating += s.rating;
        });

        const averageRating = stats && stats.length > 0
            ? totalRating / stats.length
            : 0;

        // Format response
        const formattedReviews: ReviewWithUser[] = (reviews || []).map((review) => {
            const usersData = review.users;
            const user = Array.isArray(usersData)
                ? usersData[0]
                : usersData;
            return {
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                visit_date: review.visit_date,
                helpful_count: review.helpful_count,
                created_at: review.created_at,
                clerk_user_id: review.clerk_user_id,
                user: user ? {
                    name: user.name,
                    avatar_url: user.avatar_url,
                } : null,
                user_voted: userVotes.includes(review.id),
            };
        });

        return NextResponse.json({
            reviews: formattedReviews,
            total: count || 0,
            averageRating: Math.round(averageRating * 10) / 10,
            ratingDistribution,
        });
    } catch (error) {
        return handleApiError(error, "reviews-get");
    }
}

// POST - Create a new review
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id: spotId } = await params;
        const body = await request.json();
        const { rating, comment, visitDate } = body;

        // Validate rating
        if (!rating || rating < 1 || rating > 5) {
            return Errors.validationError("Rating must be between 1 and 5");
        }

        // Validate comment length
        if (comment && comment.length > 1000) {
            return Errors.validationError("Comment must be under 1000 characters");
        }

        const supabase = await createSupabaseServerClient();

        // Check if user already reviewed this spot
        const { data: existing } = await supabase
            .from("spot_reviews")
            .select("id")
            .eq("spot_id", spotId)
            .eq("clerk_user_id", userId)
            .single();

        if (existing) {
            return apiError(ErrorCodes.CONFLICT, "You already reviewed this spot");
        }

        // Create review
        const { data: review, error } = await supabase
            .from("spot_reviews")
            .insert({
                spot_id: spotId,
                clerk_user_id: userId,
                rating,
                comment: comment || null,
                visit_date: visitDate || null,
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating review:", error);
            return Errors.databaseError();
        }

        // Update spot stats
        await updateSpotStats(supabase, spotId);

        return NextResponse.json(review, { status: 201 });
    } catch (error) {
        return handleApiError(error, "reviews-create");
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
