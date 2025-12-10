import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    stripe,
    getOrCreateStripeCustomer,
    createCheckoutSession,
    getPriceId,
    isStripeConfigured,
} from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        // Check if Stripe is configured
        if (!isStripeConfigured() || !stripe) {
            return NextResponse.json(
                { error: "Payment system is not configured" },
                { status: 503 }
            );
        }

        // Verify authentication
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get user details from Clerk
        const user = await currentUser();
        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        // Parse request body
        const body = await req.json();
        const { tier, billingCycle = "monthly" } = body;

        // Validate tier
        if (!tier || !["pro", "premium"].includes(tier)) {
            return NextResponse.json(
                { error: "Invalid subscription tier" },
                { status: 400 }
            );
        }

        // Validate billing cycle
        if (!["monthly", "yearly"].includes(billingCycle)) {
            return NextResponse.json(
                { error: "Invalid billing cycle" },
                { status: 400 }
            );
        }

        // Get price ID
        const priceId = getPriceId(tier as "pro" | "premium", billingCycle as "monthly" | "yearly");
        if (!priceId) {
            return NextResponse.json(
                { error: "Price not configured for this tier" },
                { status: 400 }
            );
        }

        // Get or create Stripe customer
        const email = user.emailAddresses[0]?.emailAddress;
        if (!email) {
            return NextResponse.json(
                { error: "User email not found" },
                { status: 400 }
            );
        }

        const customerId = await getOrCreateStripeCustomer(
            userId,
            email,
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined
        );

        if (!customerId) {
            return NextResponse.json(
                { error: "Failed to create customer" },
                { status: 500 }
            );
        }

        // Update or create subscription record in Supabase
        const supabase = createSupabaseAdmin();
        await supabase.from("subscriptions").upsert(
            {
                clerk_user_id: userId,
                stripe_customer_id: customerId,
                tier: "free", // Will be updated by webhook when payment succeeds
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
            trialDays: tier === "pro" ? 7 : 0, // 7-day trial for Pro
        });

        if (!session) {
            return NextResponse.json(
                { error: "Failed to create checkout session" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            url: session.url,
            sessionId: session.id,
        });
    } catch (error) {
        console.error("Checkout error:", error);
        return NextResponse.json(
            { error: "Failed to create checkout session" },
            { status: 500 }
        );
    }
}
