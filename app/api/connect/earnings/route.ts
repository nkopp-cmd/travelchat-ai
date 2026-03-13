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
            .select("status")
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

        const { data: summaryRows } = await supabase
            .from("guide_earnings")
            .select("gross_amount, status")
            .eq("guide_clerk_user_id", userId);

        const summary = (summaryRows || []).reduce(
            (acc, earning) => {
                const grossAmount = Number(earning.gross_amount || 0);

                if (earning.status !== "failed") {
                    acc.totalEarned += grossAmount;
                }

                if (earning.status === "paid") {
                    acc.totalPaidOut += grossAmount;
                }

                if (["calculated", "approved", "processing", "below_minimum"].includes(earning.status)) {
                    acc.pendingBalance += grossAmount;
                }

                return acc;
            },
            {
                totalEarned: 0,
                totalPaidOut: 0,
                pendingBalance: 0,
            }
        );

        // Get current month engagement
        const currentEngagement = await getGuideEngagement(userId);

        return NextResponse.json({
            summary,
            currentMonth: currentEngagement,
            earnings: earnings || [],
        });
    } catch (error) {
        console.error("Connect earnings error:", error);
        return apiError(ErrorCodes.INTERNAL_ERROR, "Failed to fetch earnings");
    }
}
