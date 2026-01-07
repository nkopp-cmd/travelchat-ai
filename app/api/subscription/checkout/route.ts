import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
    stripe,
    getOrCreateStripeCustomer,
    createCheckoutSession,
    getPriceId,
    isStripeConfigured,
} from "@/lib/stripe";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
    try {
        // Check if Stripe is configured
        if (!isStripeConfigured() || !stripe) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Payment system is not configured");
        }

        // Verify authentication
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        // Get user details from Clerk
        const user = await currentUser();
        if (!user) {
            return Errors.notFound("User");
        }

        // Parse request body
        const body = await req.json();
        const { tier, billingCycle = "monthly" } = body;

        // Validate tier
        if (!tier || !["pro", "premium"].includes(tier)) {
            return Errors.validationError("Invalid subscription tier");
        }

        // Validate billing cycle
        if (!["monthly", "yearly"].includes(billingCycle)) {
            return Errors.validationError("Invalid billing cycle");
        }

        // Get price ID
        const priceId = getPriceId(tier as "pro" | "premium", billingCycle as "monthly" | "yearly");
        if (!priceId) {
            return Errors.validationError("Price not configured for this tier");
        }

        // Get or create Stripe customer
        const email = user.emailAddresses[0]?.emailAddress;
        if (!email) {
            return Errors.validationError("User email not found");
        }

        const customerId = await getOrCreateStripeCustomer(
            userId,
            email,
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined
        );

        if (!customerId) {
            return Errors.externalServiceError("Stripe");
        }

        // Update or create subscription record in Supabase
        const supabase = await createSupabaseServerClient();
        await supabase.from("subscriptions").upsert(
            {
                clerk_user_id: userId,
                stripe_customer_id: customerId,
                tier: "free",
                status: "pending",
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "clerk_user_id",
            }
        );

        // Build success and cancel URLs
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const successUrl = `${baseUrl}/settings?subscription=success`;
        const cancelUrl = `${baseUrl}/pricing?canceled=true`;

        // Create checkout session
        const session = await createCheckoutSession({
            customerId,
            priceId,
            clerkUserId: userId,
            successUrl,
            cancelUrl,
            trialDays: tier === "pro" ? 7 : 0,
        });

        if (!session) {
            return Errors.externalServiceError("Stripe");
        }

        return NextResponse.json({
            url: session.url,
            sessionId: session.id,
        });
    } catch (error) {
        return handleApiError(error, "subscription-checkout");
    }
}
