import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getAccountStatus } from "@/lib/stripe-connect";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";

/**
 * GET /api/connect/status
 *
 * Get guide's Connect account status.
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();

        const supabase = createSupabaseAdmin();

        const { data: guide } = await supabase
            .from("guide_profiles")
            .select("*")
            .eq("clerk_user_id", userId)
            .single();

        if (!guide) {
            return NextResponse.json({ isGuide: false });
        }

        let stripeStatus = null;
        if (guide.stripe_account_id) {
            stripeStatus = await getAccountStatus(guide.stripe_account_id);
        }

        return NextResponse.json({
            isGuide: true,
            status: guide.status,
            onboardingComplete: guide.stripe_onboarding_complete,
            chargesEnabled: guide.stripe_charges_enabled,
            payoutsEnabled: guide.stripe_payouts_enabled,
            specialties: guide.specialties,
            cities: guide.cities,
            totalEarned: guide.total_earned,
            pendingBalance: guide.pending_balance,
            stripeStatus,
            appliedAt: guide.applied_at,
            approvedAt: guide.approved_at,
        });
    } catch (error) {
        console.error("Connect status error:", error);
        return apiError(ErrorCodes.INTERNAL_ERROR, "Failed to fetch status");
    }
}
