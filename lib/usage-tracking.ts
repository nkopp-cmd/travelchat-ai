import { createSupabaseAdmin } from "@/lib/supabase";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import { isBetaMode, isEarlyAdopter } from "@/lib/early-adopters";
import { unstable_cache } from "next/cache";
import { cacheConfig, cacheKeys } from "@/lib/cache";

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

/**
 * Result from atomic check-and-increment operation
 */
interface AtomicUsageResult {
    allowed: boolean;
    newCount: number;
    wasAtLimit: boolean;
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

/**
 * Atomically check limit and increment usage in a single database transaction.
 * Uses advisory lock in the DB to prevent race conditions.
 *
 * This is the SAFE way to enforce usage limits - concurrent requests
 * cannot bypass limits because the check and increment happen atomically.
 *
 * Falls back to legacy check-then-increment if the RPC function is missing.
 */
export async function atomicCheckAndIncrement(
    clerkUserId: string,
    usageType: UsageType,
    limit: number
): Promise<AtomicUsageResult> {
    const config = usageTypeConfig[usageType];
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase.rpc("check_and_increment_usage", {
        p_clerk_user_id: clerkUserId,
        p_usage_type: usageType,
        p_period_type: config.periodType,
        p_limit: limit,
    });

    if (error) {
        // PGRST202 = function not found - fall back to legacy behavior
        if (error.code === "PGRST202") {
            console.warn("[usage-tracking] RPC function missing, using fallback");
            return legacyCheckAndIncrement(clerkUserId, usageType, limit, config.periodType);
        }
        console.error("[usage-tracking] Atomic increment failed:", error);
        // On error, deny the request (fail safe)
        return { allowed: false, newCount: 0, wasAtLimit: true };
    }

    // RPC returns array with single row
    const result = Array.isArray(data) ? data[0] : data;

    return {
        allowed: result?.allowed ?? false,
        newCount: result?.new_count ?? 0,
        wasAtLimit: result?.was_at_limit ?? true,
    };
}

/**
 * Fallback for when the atomic RPC function doesn't exist.
 * Uses separate check and increment - less safe but functional.
 */
async function legacyCheckAndIncrement(
    clerkUserId: string,
    usageType: UsageType,
    limit: number,
    periodType: PeriodType
): Promise<AtomicUsageResult> {
    const supabase = createSupabaseAdmin();
    const periodStart = getPeriodStart(periodType);

    // Get current usage
    const { data: current } = await supabase
        .from("usage_tracking")
        .select("count")
        .eq("clerk_user_id", clerkUserId)
        .eq("usage_type", usageType)
        .eq("period_type", periodType)
        .eq("period_start", periodStart)
        .single();

    const currentCount = current?.count || 0;

    // Check limit
    if (currentCount >= limit) {
        return { allowed: false, newCount: currentCount, wasAtLimit: true };
    }

    // Increment using legacy RPC or direct upsert
    const { data: newData, error: incError } = await supabase.rpc("increment_usage", {
        p_clerk_user_id: clerkUserId,
        p_usage_type: usageType,
        p_period_type: periodType,
    });

    if (incError) {
        // If increment_usage RPC also missing, do direct upsert
        if (incError.code === "PGRST202") {
            const { data: upsertData } = await supabase
                .from("usage_tracking")
                .upsert(
                    {
                        clerk_user_id: clerkUserId,
                        usage_type: usageType,
                        period_start: periodStart,
                        period_type: periodType,
                        count: currentCount + 1,
                    },
                    { onConflict: "clerk_user_id,usage_type,period_start,period_type" }
                )
                .select("count")
                .single();
            return { allowed: true, newCount: upsertData?.count || currentCount + 1, wasAtLimit: false };
        }
        console.error("[usage-tracking] Legacy increment failed:", incError);
        return { allowed: false, newCount: currentCount, wasAtLimit: false };
    }

    return { allowed: true, newCount: newData || currentCount + 1, wasAtLimit: false };
}

/**
 * Increment usage counter (legacy - prefer atomicCheckAndIncrement)
 * Uses the atomic DB function to prevent race conditions.
 */
export async function incrementUsage(
    clerkUserId: string,
    usageType: UsageType,
    _amount: number = 1  // Ignored - DB function always increments by 1
): Promise<{ success: boolean; newCount: number }> {
    const config = usageTypeConfig[usageType];
    const supabase = createSupabaseAdmin();

    // Use the atomic DB function
    const { data, error } = await supabase.rpc("increment_usage", {
        p_clerk_user_id: clerkUserId,
        p_usage_type: usageType,
        p_period_type: config.periodType,
    });

    if (error) {
        console.error("Error incrementing usage:", error);
        return { success: false, newCount: 0 };
    }

    return { success: true, newCount: data || 0 };
}

/**
 * Lifetime premium email addresses (admin/dev team).
 * These users always get premium tier regardless of subscription status.
 */
const LIFETIME_PREMIUM_EMAILS = [
    "nkopp@my-goodlife.com",
    "hello@localley.io",
    // Add more emails here as needed
];

/**
 * Get user's subscription tier from database (uncached - for internal use)
 * Respects beta mode, lifetime premium, and early adopter status
 */
async function fetchUserTier(clerkUserId: string): Promise<SubscriptionTier> {
    // Beta mode - everyone gets premium
    if (isBetaMode()) {
        return "premium";
    }

    // Check lifetime premium emails (admin/dev team)
    if (LIFETIME_PREMIUM_EMAILS.length > 0) {
        const supabase = createSupabaseAdmin();
        const { data: userData } = await supabase
            .from("users")
            .select("email")
            .eq("clerk_id", clerkUserId)
            .single();

        if (userData?.email && LIFETIME_PREMIUM_EMAILS.includes(userData.email.toLowerCase())) {
            return "premium";
        }
    }

    // Check if user is an early adopter (first 100 users get premium)
    // Note: isEarlyAdopter is already cached separately
    const earlyAdopter = await isEarlyAdopter(clerkUserId);
    if (earlyAdopter) {
        return "premium";
    }

    // Fall back to checking subscription in database
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

/**
 * Get user's subscription tier (cached)
 * Uses Next.js unstable_cache with 1 minute TTL
 *
 * Cache is invalidated when:
 * - Subscription changes (via webhook calling invalidateUserCache)
 * - Early adopter status changes
 * - TTL expires
 */
export async function getUserTier(clerkUserId: string): Promise<SubscriptionTier> {
    const cachedFetch = unstable_cache(
        () => fetchUserTier(clerkUserId),
        cacheKeys.userTier(clerkUserId),
        {
            revalidate: cacheConfig.userTier.revalidate,
            tags: [...cacheConfig.userTier.tags, `user-tier:${clerkUserId}`],
        }
    );
    return cachedFetch();
}

/**
 * Combined check and track for API endpoints.
 * NOTE: This only CHECKS usage, it does NOT increment.
 * Use checkAndIncrementUsage() for the atomic check+increment pattern.
 */
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

/**
 * ATOMIC check AND increment for API endpoints.
 * This is the preferred method - it prevents race conditions by doing
 * the limit check and increment in a single database transaction.
 *
 * Use this instead of checkAndTrackUsage() + trackSuccessfulUsage().
 */
export async function checkAndIncrementUsage(
    clerkUserId: string,
    usageType: UsageType
): Promise<{
    allowed: boolean;
    usage: UsageCheckResult;
    tier: SubscriptionTier;
}> {
    const tier = await getUserTier(clerkUserId);
    const config = usageTypeConfig[usageType];
    const limit = TIER_CONFIGS[tier].limits[config.limitKey];

    // Atomic check and increment in one DB transaction
    const result = await atomicCheckAndIncrement(clerkUserId, usageType, limit);

    const usage: UsageCheckResult = {
        allowed: result.allowed,
        currentUsage: result.newCount,
        limit,
        remaining: Math.max(0, limit - result.newCount),
        periodType: config.periodType,
        periodResetAt: getPeriodEnd(config.periodType),
    };

    return {
        allowed: result.allowed,
        usage,
        tier,
    };
}

/**
 * ATOMIC check AND weighted increment for API endpoints.
 * Increments by `amount` credits instead of always 1.
 * Used for AI image generation where different models cost different credits.
 *
 * Falls back to the non-weighted RPC if the weighted version isn't deployed yet.
 */
export async function checkAndIncrementUsageWeighted(
    clerkUserId: string,
    usageType: UsageType,
    amount: number = 1
): Promise<{
    allowed: boolean;
    usage: UsageCheckResult;
    tier: SubscriptionTier;
}> {
    const tier = await getUserTier(clerkUserId);
    const config = usageTypeConfig[usageType];
    const limit = TIER_CONFIGS[tier].limits[config.limitKey];

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase.rpc("check_and_increment_usage_weighted", {
        p_clerk_user_id: clerkUserId,
        p_usage_type: usageType,
        p_period_type: config.periodType,
        p_limit: limit,
        p_amount: amount,
    });

    let result: AtomicUsageResult;

    if (error) {
        // PGRST202 = function not found — fall back to non-weighted version
        if (error.code === "PGRST202") {
            console.warn("[usage-tracking] Weighted RPC missing, falling back to standard");
            result = await atomicCheckAndIncrement(clerkUserId, usageType, limit);
        } else {
            console.error("[usage-tracking] Weighted increment failed:", error);
            result = { allowed: false, newCount: 0, wasAtLimit: true };
        }
    } else {
        const row = Array.isArray(data) ? data[0] : data;
        result = {
            allowed: row?.allowed ?? false,
            newCount: row?.new_count ?? 0,
            wasAtLimit: row?.was_at_limit ?? true,
        };
    }

    const usage: UsageCheckResult = {
        allowed: result.allowed,
        currentUsage: result.newCount,
        limit,
        remaining: Math.max(0, limit - result.newCount),
        periodType: config.periodType,
        periodResetAt: getPeriodEnd(config.periodType),
    };

    return { allowed: result.allowed, usage, tier };
}

/**
 * Track usage after successful operation (legacy pattern).
 * Prefer using checkAndIncrementUsage() which does this atomically.
 */
export async function trackSuccessfulUsage(
    clerkUserId: string,
    usageType: UsageType
): Promise<void> {
    await incrementUsage(clerkUserId, usageType);
}
