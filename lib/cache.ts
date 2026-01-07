import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

/**
 * Cache wrapper for Supabase queries
 * Provides automatic caching with configurable TTL
 */

export const cacheConfig = {
    spots: {
        revalidate: 300, // 5 minutes
        tags: ["spots"],
    },
    spotDetails: {
        revalidate: 600, // 10 minutes
        tags: ["spot-details"],
    },
    itineraries: {
        revalidate: 60, // 1 minute
        tags: ["itineraries"],
    },
    userProgress: {
        revalidate: 30, // 30 seconds
        tags: ["user-progress"],
    },
    challenges: {
        revalidate: 3600, // 1 hour
        tags: ["challenges"],
    },
    /**
     * Subscription data caching
     * Short TTL since this affects billing features
     */
    subscription: {
        revalidate: 30, // 30 seconds
        tags: ["subscription"],
    },
    /**
     * Early adopter status caching
     * Longer TTL as this changes infrequently
     */
    earlyAdopter: {
        revalidate: 300, // 5 minutes
        tags: ["early-adopter"],
    },
    /**
     * User tier caching (combines subscription + early adopter status)
     * Short TTL since this affects feature access
     */
    userTier: {
        revalidate: 60, // 1 minute
        tags: ["user-tier"],
    },
};

/**
 * Create a cached version of a function
 * @param fn - Function to cache
 * @param keyParts - Parts to create cache key
 * @param config - Cache configuration
 */
export function createCachedQuery<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    keyParts: string[],
    config: { revalidate: number; tags: string[] }
): (...args: TArgs) => Promise<TReturn> {
    return unstable_cache(fn, keyParts, {
        revalidate: config.revalidate,
        tags: config.tags,
    }) as (...args: TArgs) => Promise<TReturn>;
}

/**
 * Invalidate cache by tag
 * Use after mutations to ensure fresh data
 *
 * In Next.js 16+, revalidateTag requires a profile argument.
 * Using "default" as the profile for standard revalidation.
 *
 * @example
 * ```ts
 * // After updating subscription
 * invalidateCache("subscription");
 * ```
 */
export function invalidateCache(tag: string): void {
    revalidateTag(tag, "default");
}

/**
 * Invalidate user-specific cache
 * Creates a user-scoped tag for invalidation
 *
 * @example
 * ```ts
 * // After user's subscription changes
 * invalidateUserCache("user123", "subscription");
 * ```
 */
export function invalidateUserCache(userId: string, type: string): void {
    revalidateTag(`${type}:${userId}`, "default");
}

/**
 * Cache key builders for user-specific data
 */
export const cacheKeys = {
    subscription: (userId: string) => [`subscription`, userId],
    earlyAdopter: (userId: string) => [`early-adopter`, userId],
    userProgress: (userId: string) => [`user-progress`, userId],
    itineraries: (userId: string) => [`itineraries`, userId],
    userTier: (userId: string) => [`user-tier`, userId],
};
