import { createSupabaseAdmin } from "@/lib/supabase";
import { getUserTier } from "@/lib/usage-tracking";

export type EngagementType =
    | "itinerary_view"
    | "itinerary_save"
    | "spot_view"
    | "spot_save";

/**
 * Track engagement from a paid subscriber viewing/saving guide content.
 * Only counts engagement from Pro/Premium users (they generate revenue).
 * Automatically deduplicates (max 1 per user per content per type per day).
 *
 * Call this from itinerary view, itinerary save, spot view, and spot save endpoints.
 */
export async function trackEngagement(
    viewerClerkUserId: string,
    contentType: EngagementType,
    contentId: string,
    creatorClerkUserId: string
): Promise<boolean> {
    // Don't track self-engagement
    if (viewerClerkUserId === creatorClerkUserId) return false;

    try {
        // Check viewer's tier — only paid subscribers generate revenue
        const tier = await getUserTier(viewerClerkUserId);
        if (tier !== "pro" && tier !== "premium") return false;

        // Check if creator is an approved guide
        const supabase = createSupabaseAdmin();
        const { data: guide } = await supabase
            .from("guide_profiles")
            .select("status")
            .eq("clerk_user_id", creatorClerkUserId)
            .single();

        if (!guide || guide.status !== "approved") return false;

        // Use the DB function for deduplication
        const { error } = await supabase.rpc("track_content_engagement", {
            p_viewer_clerk_user_id: viewerClerkUserId,
            p_viewer_tier: tier,
            p_content_type: contentType,
            p_content_id: contentId,
            p_creator_clerk_user_id: creatorClerkUserId,
        });

        if (error) {
            // Unique constraint violation = already tracked today, ignore
            if (error.code === "23505") return false;
            console.error("Engagement tracking error:", error);
            return false;
        }

        return true;
    } catch (error) {
        // Non-critical — don't break the user's action if tracking fails
        console.error("Engagement tracking failed:", error);
        return false;
    }
}

/**
 * Get engagement summary for a guide for a specific month.
 */
export async function getGuideEngagement(
    guideClerkUserId: string,
    month?: Date
) {
    const supabase = createSupabaseAdmin();
    const targetMonth = month || new Date();
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
        .toISOString()
        .split("T")[0];

    const { data, error } = await supabase
        .from("content_engagement")
        .select("content_type, engagement_points")
        .eq("creator_clerk_user_id", guideClerkUserId)
        .eq("engagement_month", monthStart);

    if (error || !data) return null;

    const summary = {
        totalPoints: 0,
        itineraryViews: 0,
        itinerarySaves: 0,
        spotViews: 0,
        spotSaves: 0,
    };

    for (const row of data) {
        summary.totalPoints += row.engagement_points;
        switch (row.content_type) {
            case "itinerary_view":
                summary.itineraryViews++;
                break;
            case "itinerary_save":
                summary.itinerarySaves++;
                break;
            case "spot_view":
                summary.spotViews++;
                break;
            case "spot_save":
                summary.spotSaves++;
                break;
        }
    }

    return summary;
}
