import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getAccountStatus } from "@/lib/stripe-connect";
import { hasPreviewGuideIntent } from "@/lib/app-data/preview-guide-intent";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";
import { isPreviewGuideStatusCandidate, previewGuideStatus } from "@/lib/app-data/preview-guide-status";

/**
 * GET /api/connect/status
 *
 * Get guide's Connect account status.
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();

        if (isPreviewGuideStatusCandidate(req)) {
            try {
                return NextResponse.json(await previewGuideStatus(userId), {
                    headers: { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            } catch (error) {
                console.error("[GUIDE_STATUS_PREVIEW] Archive unavailable", error);
                return NextResponse.json({ error: "Guide archive unavailable" }, {
                    status: 503,
                    headers: { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            }
        }

        if (hasPreviewGuideIntent(req)) {
            return NextResponse.json({ error: "Guide archive unavailable" }, {
                status: 503,
                headers: { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" },
            });
        }
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
