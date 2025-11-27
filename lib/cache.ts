import { unstable_cache } from "next/cache";

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
