import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
    try {
        // Check if Stripe is configured
        if (!isStripeConfigured()) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Payment system is not configured");
        }

        // Verify authentication
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        // Get the user's subscription from Supabase
        const supabase = await createSupabaseServerClient();
        const { data: subscription, error } = await supabase
            .from("subscriptions")
            .select("stripe_customer_id")
            .eq("clerk_user_id", userId)
            .single();

        if (error || !subscription?.stripe_customer_id) {
            return Errors.notFound("Subscription");
        }

        // Build return URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const returnUrl = `${baseUrl}/settings`;

        // Create billing portal session
        const session = await createBillingPortalSession(
            subscription.stripe_customer_id,
            returnUrl
        );

        if (!session) {
            return Errors.externalServiceError("Stripe");
        }

        return NextResponse.json({
            url: session.url,
        });
    } catch (error) {
        return handleApiError(error, "subscription-portal");
    }
}
