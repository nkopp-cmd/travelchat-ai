import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createDashboardLink } from "@/lib/stripe-connect";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";

/**
 * GET /api/connect/dashboard
 *
 * Get a Stripe Express dashboard login link for the guide.
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();

        const supabase = createSupabaseAdmin();

        const { data: guide } = await supabase
            .from("guide_profiles")
            .select("stripe_account_id, stripe_onboarding_complete, status")
            .eq("clerk_user_id", userId)
            .single();

        if (!guide) {
            return apiError(ErrorCodes.NOT_FOUND, "Guide profile not found");
        }

        if (guide.status !== "approved") {
            return apiError(ErrorCodes.FORBIDDEN, "Guide account is not active");
        }

        if (!guide.stripe_account_id || !guide.stripe_onboarding_complete) {
            return apiError(ErrorCodes.VALIDATION_ERROR, "Stripe onboarding not complete");
        }

        const url = await createDashboardLink(guide.stripe_account_id);
        if (!url) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Failed to create dashboard link");
        }

        return NextResponse.json({ url });
    } catch (error) {
        console.error("Connect dashboard error:", error);
        return apiError(ErrorCodes.INTERNAL_ERROR, "Failed to get dashboard link");
    }
}
