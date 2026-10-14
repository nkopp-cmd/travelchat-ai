import { previewBillingActionRefusal } from "@/lib/app-data/preview-billing-action";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    stripe,
    StripePlanAlreadyExistsError,
    getOrCreateStripeCustomer,
    createCheckoutSession,
    getPriceId,
    isStripeConfigured,
} from "@/lib/stripe";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
    try {
        const previewRefusal = await previewBillingActionRefusal(req);
        if (previewRefusal) return previewRefusal;

        // Check if Stripe is configured
        if (!isStripeConfigured() || !stripe) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Payment system is not configured");
        }

        // Verify authentication
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        // Get user details from the auth session
        const user = await currentUser();
        if (!user) {
            return Errors.notFound("User");
        }

        if (user.id !== userId || user.emailVerified !== true) {
            return Errors.forbidden("Verify your email before checkout");
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
        if (!/^price_[A-Za-z0-9]+$/.test(priceId)) {
            return Errors.validationError("Price not configured for this tier");
        }

        const supabase = createSupabaseAdmin();
        const { data: existing, error: lookupError } = await supabase.from("subscriptions")
            .select("stripe_customer_id,stripe_subscription_id,tier,status")
            .eq("clerk_user_id", userId).maybeSingle();
        if (lookupError) return Errors.databaseError();
        if (existing && (existing.tier === "pro" || existing.tier === "premium")
            && ["active", "trialing", "past_due"].includes(existing.status)) {
            return NextResponse.json({ error: { code: "existing_subscription",
                message: "Use billing settings to manage your current plan." } }, { status: 409 });
        }

        // Get or create Stripe customer
        const email = user.emailAddresses[0]?.emailAddress;
        if (!email) {
            return Errors.validationError("User email not found");
        }

        const customerId = await getOrCreateStripeCustomer(
            userId,
            email,
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined,
            existing?.stripe_customer_id || undefined
        );

        if (!customerId) {
            return Errors.externalServiceError("Stripe");
        }

        // Only the customer association changes here. A checkout is not a paid subscription.
        const customerValues = { stripe_customer_id: customerId, updated_at: new Date().toISOString() };
        const result = existing
            ? await supabase.from("subscriptions").update(customerValues).eq("clerk_user_id", userId)
            : await supabase.from("subscriptions").upsert({ clerk_user_id: userId,
                ...customerValues, tier: "free", status: "active" },
                { onConflict: "clerk_user_id", ignoreDuplicates: true });
        if (result.error) {
            console.error("Error binding subscription customer before checkout:", result.error);
            return Errors.databaseError();
        }

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
        });

        if (!session) {
            return Errors.externalServiceError("Stripe");
        }

        return NextResponse.json({
            url: session.url,
            sessionId: session.id,
        }, { headers: { "Cache-Control": "private, no-store", "X-Localley-Billing-Contract": "2026-10-14" } });
    } catch (error) {
        if (error instanceof StripePlanAlreadyExistsError) return NextResponse.json({ error: {
            code: "existing_subscription", message: error.message,
        } }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
        return handleApiError(error, "subscription-checkout");
    }
}
