import { createSupabaseAdmin } from "@/lib/supabase";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";

export type UsageType =
    | "itineraries_created"
    | "chat_messages"
    | "stories_created"
    | "ai_images_generated"
    | "spots_saved";

export type PeriodType = "daily" | "weekly" | "monthly";

interface UsageCheckResult {
    allowed: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
    periodType: PeriodType;
    periodResetAt: string;
}

// Map usage type to limit key and period
const usageTypeConfig: Record<UsageType, { limitKey: keyof typeof TIER_CONFIGS.free.limits; periodType: PeriodType }> = {
    itineraries_created: { limitKey: "itinerariesPerMonth", periodType: "monthly" },
    chat_messages: { limitKey: "chatMessagesPerDay", periodType: "daily" },
    stories_created: { limitKey: "storiesPerWeek", periodType: "weekly" },
    ai_images_generated: { limitKey: "aiImagesPerMonth", periodType: "monthly" },
    spots_saved: { limitKey: "savedSpotsLimit", periodType: "monthly" },
};

// Get period start date based on period type
function getPeriodStart(periodType: PeriodType): string {
    const now = new Date();

    switch (periodType) {
        case "daily":
            return now.toISOString().split("T")[0];
        case "weekly": {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            const weekStart = new Date(now.setDate(diff));
            return weekStart.toISOString().split("T")[0];
        }
        case "monthly":
            return new Date(now.getFullYear(), now.getMonth(), 1)
                .toISOString()
                .split("T")[0];
    }
}

// Get period end date (for reset display)
function getPeriodEnd(periodType: PeriodType): string {
    const now = new Date();

    switch (periodType) {
        case "daily":
            return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        case "weekly": {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? 1 : 8); // Next Monday
            const weekEnd = new Date(now.setDate(diff));
            return weekEnd.toISOString().split("T")[0];
        }
        case "monthly":
            return new Date(now.getFullYear(), now.getMonth() + 1, 1)
                .toISOString()
                .split("T")[0];
    }
}

// Check if usage is allowed for a given tier
export async function checkUsageLimit(
    clerkUserId: string,
    usageType: UsageType,
    tier: SubscriptionTier = "free"
): Promise<UsageCheckResult> {
    const config = usageTypeConfig[usageType];
    const limit = TIER_CONFIGS[tier].limits[config.limitKey];
    const periodStart = getPeriodStart(config.periodType);
    const periodResetAt = getPeriodEnd(config.periodType);

    const supabase = createSupabaseAdmin();

    // Get current usage
    const { data } = await supabase
        .from("usage_tracking")
        .select("count")
        .eq("clerk_user_id", clerkUserId)
        .eq("usage_type", usageType)
        .eq("period_type", config.periodType)
        .eq("period_start", periodStart)
        .single();

    const currentUsage = data?.count || 0;
    const remaining = Math.max(0, limit - currentUsage);

    return {
        allowed: currentUsage < limit,
        currentUsage,
        limit,
        remaining,
        periodType: config.periodType,
        periodResetAt,
    };
}

// Increment usage counter
export async function incrementUsage(
    clerkUserId: string,
    usageType: UsageType,
    amount: number = 1
): Promise<{ success: boolean; newCount: number }> {
    const config = usageTypeConfig[usageType];
    const periodStart = getPeriodStart(config.periodType);

    const supabase = createSupabaseAdmin();

    // Try to update existing record
    const { data: existing } = await supabase
        .from("usage_tracking")
        .select("id, count")
        .eq("clerk_user_id", clerkUserId)
        .eq("usage_type", usageType)
        .eq("period_type", config.periodType)
        .eq("period_start", periodStart)
        .single();

    if (existing) {
        const newCount = existing.count + amount;
        const { error } = await supabase
            .from("usage_tracking")
            .update({ count: newCount, updated_at: new Date().toISOString() })
            .eq("id", existing.id);

        if (error) {
            console.error("Error updating usage:", error);
            return { success: false, newCount: existing.count };
        }

        return { success: true, newCount };
    }

    // Insert new record
    const { error } = await supabase
        .from("usage_tracking")
        .insert({
            clerk_user_id: clerkUserId,
            usage_type: usageType,
            period_type: config.periodType,
            period_start: periodStart,
            count: amount,
        });

    if (error) {
        console.error("Error inserting usage:", error);
        return { success: false, newCount: 0 };
    }

    return { success: true, newCount: amount };
}

// Get user's subscription tier from database
export async function getUserTier(clerkUserId: string): Promise<SubscriptionTier> {
    const supabase = createSupabaseAdmin();

    const { data } = await supabase
        .from("subscriptions")
        .select("tier, status")
        .eq("clerk_user_id", clerkUserId)
        .single();

    // Only return paid tier if subscription is active
    if (data && ["active", "trialing"].includes(data.status)) {
        return data.tier as SubscriptionTier;
    }

    return "free";
}

// Combined check and increment for API endpoints
export async function checkAndTrackUsage(
    clerkUserId: string,
    usageType: UsageType
): Promise<{
    allowed: boolean;
    usage: UsageCheckResult;
    tier: SubscriptionTier;
}> {
    const tier = await getUserTier(clerkUserId);
    const usage = await checkUsageLimit(clerkUserId, usageType, tier);

    return {
        allowed: usage.allowed,
        usage,
        tier,
    };
}

// Track usage after successful operation
export async function trackSuccessfulUsage(
    clerkUserId: string,
    usageType: UsageType
): Promise<void> {
    await incrementUsage(clerkUserId, usageType);
}
