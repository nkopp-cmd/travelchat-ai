import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import { isBetaMode, getEarlyAdopterStatus } from "@/lib/early-adopters";
import { Errors, handleApiError } from "@/lib/api-errors";
import { isLifetimePremiumEmail } from "@/lib/lifetime-premium";

export interface SubscriptionStatusResponse {
    tier: SubscriptionTier;
    status: string;
    isActive: boolean;
    hasBillingPortal: boolean;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    limits: {
        itinerariesPerMonth: number;
        chatMessagesPerDay: number;
        storiesPerWeek: number;
        aiImagesPerMonth: number;
        savedSpotsLimit: number;
    };
    usage: {
        itinerariesThisMonth: number;
        chatMessagesToday: number;
        storiesThisWeek: number;
        aiImagesThisMonth: number;
        savedSpots: number;
    };
    // Early adopter / beta info
    isBetaMode?: boolean;
    isEarlyAdopter?: boolean;
    earlyAdopterPosition?: number;
    earlyAdopterSlotsRemaining?: number;
}

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const user = await currentUser();
        const primaryEmail = user?.emailAddresses[0]?.emailAddress;

        const supabase = await createSupabaseServerClient();

        // Get subscription
        const { data: subscription } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("clerk_user_id", userId)
            .single();

        // Get base tier from subscription
        const baseTier: SubscriptionTier = subscription?.tier || "free";
        const status = subscription?.status || "none";

        // Check beta mode and early adopter status
        const betaMode = isBetaMode();
        const earlyAdopterStatus = await getEarlyAdopterStatus(userId);
        const hasLifetimePremium = isLifetimePremiumEmail(primaryEmail);

        // Determine effective tier
        // Priority: Beta mode > lifetime premium > Early adopter > Actual subscription
        let tier: SubscriptionTier = baseTier;
        if (betaMode) {
            tier = "premium";
        } else if (hasLifetimePremium) {
            tier = "premium";
        } else if (earlyAdopterStatus.isEarlyAdopter) {
            tier = "premium";
        }

        const isActive =
            betaMode ||
            hasLifetimePremium ||
            earlyAdopterStatus.isEarlyAdopter ||
            ["active", "trialing"].includes(status);

        // Get usage data
        const today = new Date().toISOString().split("T")[0];
        const weekStart = getWeekStart();
        const monthStart = getMonthStart();

        // Fetch all usage in parallel
        const [
            { data: monthlyUsage },
            { data: dailyUsage },
            { data: weeklyUsage },
            { count: savedSpotsCount },
        ] = await Promise.all([
            supabase
                .from("usage_tracking")
                .select("usage_type, count")
                .eq("clerk_user_id", userId)
                .eq("period_type", "monthly")
                .eq("period_start", monthStart),
            supabase
                .from("usage_tracking")
                .select("usage_type, count")
                .eq("clerk_user_id", userId)
                .eq("period_type", "daily")
                .eq("period_start", today),
            supabase
                .from("usage_tracking")
                .select("usage_type, count")
                .eq("clerk_user_id", userId)
                .eq("period_type", "weekly")
                .eq("period_start", weekStart),
            supabase
                .from("saved_spots")
                .select("*", { count: "exact", head: true })
                .eq("clerk_user_id", userId),
        ]);

        // Parse usage
        const getUsage = (
            data: { usage_type: string; count: number }[] | null,
            type: string
        ): number => {
            if (!data) return 0;
            const record = data.find((r) => r.usage_type === type);
            return record?.count || 0;
        };

        const tierConfig = TIER_CONFIGS[tier];

        const response: SubscriptionStatusResponse = {
            tier,
            status: betaMode
                ? "beta"
                : hasLifetimePremium
                    ? "lifetime_premium"
                    : (earlyAdopterStatus.isEarlyAdopter ? "early_adopter" : status),
            isActive,
            hasBillingPortal: !!subscription?.stripe_customer_id,
            currentPeriodEnd: subscription?.current_period_end || null,
            cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
            trialEnd: subscription?.trial_end || null,
            limits: tierConfig.limits,
            usage: {
                itinerariesThisMonth: getUsage(monthlyUsage, "itineraries_created"),
                chatMessagesToday: getUsage(dailyUsage, "chat_messages"),
                storiesThisWeek: getUsage(weeklyUsage, "stories_created"),
                aiImagesThisMonth: getUsage(monthlyUsage, "ai_images_generated"),
                savedSpots: savedSpotsCount || 0,
            },
            // Early adopter / beta info
            isBetaMode: betaMode,
            isEarlyAdopter: earlyAdopterStatus.isEarlyAdopter,
            earlyAdopterPosition: earlyAdopterStatus.position,
            earlyAdopterSlotsRemaining: earlyAdopterStatus.slotsRemaining,
        };

        return NextResponse.json(response);
    } catch (error) {
        return handleApiError(error, "subscription-status");
    }
}

function getWeekStart(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const weekStart = new Date(now.setDate(diff));
    return weekStart.toISOString().split("T")[0];
}

function getMonthStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
}
