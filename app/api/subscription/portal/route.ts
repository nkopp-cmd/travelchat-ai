import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        // Check if Stripe is configured
        if (!isStripeConfigured()) {
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

        // Get the user's subscription from Supabase
        const supabase = createSupabaseAdmin();
        const { data: subscription, error } = await supabase
            .from("subscriptions")
            .select("stripe_customer_id")
            .eq("clerk_user_id", userId)
            .single();

        if (error || !subscription?.stripe_customer_id) {
            return NextResponse.json(
                { error: "No subscription found" },
                { status: 404 }
            );
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
            return NextResponse.json(
                { error: "Failed to create portal session" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            url: session.url,
        });
    } catch (error) {
        console.error("Portal error:", error);
        return NextResponse.json(
            { error: "Failed to create portal session" },
            { status: 500 }
        );
    }
}
