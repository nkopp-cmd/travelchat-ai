/**
 * Server-side Spots Queries
 * Handles all database operations for spot filtering with caching
 */

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getCityBySlug, ENABLED_CITIES } from "@/lib/cities";
import { transformSpot, RawSpot } from "./transform";
import {
    SpotsFilterParams,
    SpotsFilterState,
    SpotsResponse,
    FilterOptions,
    SPOTS_PAGE_SIZE,
    SCORE_LABELS,
} from "./types";

/**
 * Parse and validate filter params from URL searchParams
 */
export function parseFilterParams(
    searchParams: SpotsFilterParams
): SpotsFilterState {
    const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
    const scoreParam = searchParams.score ? parseInt(searchParams.score, 10) : null;
    const validScore = scoreParam && scoreParam >= 1 && scoreParam <= 6 ? scoreParam : null;

    // Validate sortBy
    const validSorts = ["score", "trending", "local"] as const;
    const sortBy = validSorts.includes(searchParams.sort as typeof validSorts[number])
        ? (searchParams.sort as "score" | "trending" | "local")
        : "score";

    return {
        city: searchParams.city || null,
        category: searchParams.category || null,
        score: validScore,
        sortBy,
        search: searchParams.search?.trim() || null,
        page,
        limit: SPOTS_PAGE_SIZE,
    };
}

/**
 * Build URL search params string from filter state
 */
export function buildFilterUrl(filters: Partial<SpotsFilterState>): string {
    const params = new URLSearchParams();

    if (filters.city) params.set("city", filters.city);
    if (filters.category) params.set("category", filters.category);
    if (filters.score) params.set("score", String(filters.score));
    if (filters.sortBy && filters.sortBy !== "score") params.set("sort", filters.sortBy);
    if (filters.search) params.set("search", filters.search);
    if (filters.page && filters.page > 1) params.set("page", String(filters.page));

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
}

/**
 * Internal: Fetch filtered spots from database
 */
async function fetchFilteredSpotsInternal(
    filters: SpotsFilterState
): Promise<SpotsResponse> {
    const supabase = createSupabaseAdmin();

    // Start building query
    let query = supabase
        .from("spots")
        .select("*", { count: "exact" });

    // City filter - query by address JSONB field
    if (filters.city) {
        const city = getCityBySlug(filters.city);
        if (city) {
            query = query.ilike("address->>en", `%${city.name}%`);
        }
    }

    // Category filter
    if (filters.category) {
        query = query.eq("category", filters.category);
    }

    // Score filter
    if (filters.score) {
        query = query.eq("localley_score", filters.score);
    }

    // Text search - search across name, description, and address
    if (filters.search) {
        // Escape special characters for safe pattern matching
        const searchTerm = filters.search.replace(/[%_]/g, "\\$&");
        query = query.or(
            `name->>en.ilike.%${searchTerm}%,` +
            `description->>en.ilike.%${searchTerm}%,` +
            `address->>en.ilike.%${searchTerm}%`
        );
    }

    // Sorting
    switch (filters.sortBy) {
        case "trending":
            query = query.order("trending_score", { ascending: false });
            break;
        case "local":
            query = query.order("local_percentage", { ascending: false });
            break;
        case "score":
        default:
            query = query.order("localley_score", { ascending: false });
            break;
    }

    // Secondary sort by ID for consistent pagination
    query = query.order("id", { ascending: true });

    // Pagination using range
    const offset = (filters.page - 1) * filters.limit;
    query = query.range(offset, offset + filters.limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error("[spots/queries] Error fetching spots:", error);
        // Return empty result instead of throwing for graceful degradation
        return {
            spots: [],
            total: 0,
            page: filters.page,
            pageSize: filters.limit,
            hasMore: false,
            filters: {
                city: filters.city,
                category: filters.category,
                score: filters.score,
            },
        };
    }

    const spots = (data || []).map((spot: RawSpot) => transformSpot(spot));
    const total = count || 0;

    return {
        spots,
        total,
        page: filters.page,
        pageSize: filters.limit,
        hasMore: offset + spots.length < total,
        filters: {
            city: filters.city,
            category: filters.category,
            score: filters.score,
        },
    };
}

/**
 * Cached version of spot query
 * Uses filter state as cache key for proper invalidation
 */
export async function fetchFilteredSpots(
    filters: SpotsFilterState
): Promise<SpotsResponse> {
    // Create a cache key from filters
    const cacheKey = JSON.stringify({
        city: filters.city,
        category: filters.category,
        score: filters.score,
        sortBy: filters.sortBy,
        search: filters.search,
        page: filters.page,
    });

    const cachedFetch = unstable_cache(
        async () => fetchFilteredSpotsInternal(filters),
        [`spots-filtered-${cacheKey}`],
        {
            revalidate: 300, // 5 minutes
            tags: ["spots"],
        }
    );

    return cachedFetch();
}

/**
 * Internal: Fetch filter options with counts
 */
async function fetchFilterOptionsInternal(): Promise<FilterOptions> {
    const supabase = createSupabaseAdmin();

    // Get city counts in parallel
    const cityCountPromises = ENABLED_CITIES.map(async (city) => {
        const { count } = await supabase
            .from("spots")
            .select("*", { count: "exact", head: true })
            .ilike("address->>en", `%${city.name}%`);

        return {
            slug: city.slug,
            name: city.name,
            emoji: city.emoji,
            count: count || 0,
        };
    });

    // Get all spots for category and score distribution
    const { data: allSpots } = await supabase
        .from("spots")
        .select("category, localley_score");

    // Calculate category counts
    const categoryCounts: Record<string, number> = {};
    (allSpots || []).forEach((spot) => {
        const cat = spot.category || "Uncategorized";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Calculate score distribution
    const scoreCounts: Record<number, number> = {};
    (allSpots || []).forEach((spot) => {
        const score = spot.localley_score || 3;
        scoreCounts[score] = (scoreCounts[score] || 0) + 1;
    });

    const cities = await Promise.all(cityCountPromises);

    return {
        cities: cities.filter((c) => c.count > 0),
        categories: Object.entries(categoryCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
        scores: [6, 5, 4, 3].map((value) => ({
            value,
            label: SCORE_LABELS[value] || "Unknown",
            count: scoreCounts[value] || 0,
        })),
    };
}

/**
 * Cached version of filter options
 */
export async function fetchFilterOptions(): Promise<FilterOptions> {
    const cachedFetch = unstable_cache(
        fetchFilterOptionsInternal,
        ["spots-filter-options"],
        {
            revalidate: 600, // 10 minutes
            tags: ["spots"],
        }
    );

    return cachedFetch();
}

/**
 * Get total spot count (for header display)
 */
export async function getTotalSpotCount(): Promise<number> {
    const supabase = createSupabaseAdmin();
    const { count } = await supabase
        .from("spots")
        .select("*", { count: "exact", head: true });
    return count || 0;
}
