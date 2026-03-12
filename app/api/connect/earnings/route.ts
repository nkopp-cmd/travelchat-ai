import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getGuideEngagement } from "@/lib/engagement-tracking";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";

/**
 * GET /api/connect/earnings
 *
 * Get guide's earnings history and current month engagement.
 * Query params: ?months=6 (default 6 months of history)
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();

        const supabase = createSupabaseAdmin();

        // Verify guide status
        const { data: guide } = await supabase
            .from("guide_profiles")
            .select("status, total_earned, total_paid_out, pending_balance")
            .eq("clerk_user_id", userId)
            .single();

        if (!guide || guide.status !== "approved") {
            return apiError(ErrorCodes.FORBIDDEN, "Guide account is not active");
        }

        // Get earnings history
        const months = parseInt(req.nextUrl.searchParams.get("months") || "6");
        const { data: earnings } = await supabase
            .from("guide_earnings")
            .select("*")
            .eq("guide_clerk_user_id", userId)
            .order("earning_month", { ascending: false })
            .limit(months);

        // Get current month engagement
        const currentEngagement = await getGuideEngagement(userId);

        return NextResponse.json({
            summary: {
                totalEarned: guide.total_earned,
                totalPaidOut: guide.total_paid_out,
                pendingBalance: guide.pending_balance,
            },
            currentMonth: currentEngagement,
            earnings: earnings || [],
        });
    } catch (error) {
        console.error("Connect earnings error:", error);
        return apiError(ErrorCodes.INTERNAL_ERROR, "Failed to fetch earnings");
    }
}
