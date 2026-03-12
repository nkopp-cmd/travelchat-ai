import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    createConnectAccount,
    createOnboardingLink,
    isConnectConfigured,
} from "@/lib/stripe-connect";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";

/**
 * POST /api/connect/onboard
 *
 * Start the guide onboarding process:
 * 1. Apply to become a guide (creates guide_profiles record)
 * 2. If already approved, create Stripe Express account and return onboarding URL
 */
export async function POST(req: NextRequest) {
    try {
        if (!isConnectConfigured()) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Connect is not configured");
        }

        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();

        const user = await currentUser();
        if (!user) return Errors.notFound("User");

        const supabase = createSupabaseAdmin();
        const email = user.emailAddresses[0]?.emailAddress;
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

        // Check if guide profile already exists
        const { data: existing } = await supabase
            .from("guide_profiles")
            .select("*")
            .eq("clerk_user_id", userId)
            .single();

        if (existing) {
            // Already has a profile
            if (existing.status === "rejected") {
                return apiError(ErrorCodes.FORBIDDEN, "Your guide application was not approved");
            }

            if (existing.status === "suspended") {
                return apiError(ErrorCodes.FORBIDDEN, "Your guide account has been suspended");
            }

            // If approved but no Stripe account yet, create one
            if (existing.status === "approved" && !existing.stripe_account_id) {
                const accountId = await createConnectAccount(userId, email || "", name);
                if (!accountId) {
                    return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Failed to create Stripe account");
                }

                await supabase
                    .from("guide_profiles")
                    .update({ stripe_account_id: accountId })
                    .eq("clerk_user_id", userId);

                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.io";
                const onboardingUrl = await createOnboardingLink(
                    accountId,
                    `${baseUrl}/guide/dashboard?onboarding=complete`,
                    `${baseUrl}/guide/dashboard?onboarding=refresh`
                );

                return NextResponse.json({ url: onboardingUrl, status: "onboarding" });
            }

            // If has Stripe account but onboarding incomplete, regenerate link
            if (existing.stripe_account_id && !existing.stripe_onboarding_complete) {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.io";
                const onboardingUrl = await createOnboardingLink(
                    existing.stripe_account_id,
                    `${baseUrl}/guide/dashboard?onboarding=complete`,
                    `${baseUrl}/guide/dashboard?onboarding=refresh`
                );

                return NextResponse.json({ url: onboardingUrl, status: "onboarding" });
            }

            // Already fully onboarded
            return NextResponse.json({ status: existing.status, onboarded: existing.stripe_onboarding_complete });
        }

        // Parse application data
        const body = await req.json().catch(() => ({}));

        // Create new guide application
        const { error } = await supabase.from("guide_profiles").insert({
            clerk_user_id: userId,
            status: "pending",
            bio: body.bio || null,
            specialties: body.specialties || [],
            cities: body.cities || [],
        });

        if (error) {
            console.error("Guide application error:", error);
            return apiError(ErrorCodes.DATABASE_ERROR, "Failed to submit application");
        }

        return NextResponse.json({ status: "pending", message: "Application submitted for review" });
    } catch (error) {
        console.error("Connect onboard error:", error);
        return apiError(ErrorCodes.INTERNAL_ERROR, "Failed to process onboarding");
    }
}
