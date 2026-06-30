/**
 * City Statistics - Server-side functions for city coverage data
 */

import { createSupabaseAdmin } from "@/lib/supabase";
import {
    ENABLED_CITIES,
    getCityBySlug,
    getCoverageMessage,
} from "./cities";
import { applyPublicSpotVisibilityFilters } from "./spots/public-quality";

export interface CitySpotCount {
    slug: string;
    name: string;
    emoji: string;
    spotCount: number;
    coverageStatus: "full" | "expanding" | "new";
    coverageMessage: string;
}

/**
 * Get spot counts for all enabled cities
 */
export async function getCitySpotCounts(): Promise<CitySpotCount[]> {
    const supabase = createSupabaseAdmin();
    const results: CitySpotCount[] = [];

    for (const city of ENABLED_CITIES) {
        // Query spots that match this city's name in address
        // Using separate ilike calls since .or() with JSONB can be tricky
        let countQuery = supabase
            .from("spots")
            .select("*", { count: "exact", head: true });

        countQuery = applyPublicSpotVisibilityFilters(countQuery);

        const { count } = await countQuery.ilike("address->>en", `%${city.name}%`);

        const spotCount = count || 0;
        const coverage = getCoverageMessage(city, spotCount, 8); // Assume 8 templates for now

        results.push({
            slug: city.slug,
            name: city.name,
            emoji: city.emoji,
            spotCount,
            coverageStatus: coverage.status,
            coverageMessage: coverage.message,
        });
    }

    return results;
}

/**
 * Get spot count for a specific city
 */
export async function getCitySpotCount(citySlug: string): Promise<CitySpotCount | null> {
    const city = getCityBySlug(citySlug);
    if (!city || !city.isEnabled) return null;

    const supabase = createSupabaseAdmin();

    let countQuery = supabase
        .from("spots")
        .select("*", { count: "exact", head: true });

    countQuery = applyPublicSpotVisibilityFilters(countQuery);

    const { count } = await countQuery.ilike("address->>en", `%${city.name}%`);

    const spotCount = count || 0;
    const coverage = getCoverageMessage(city, spotCount, 8);

    return {
        slug: city.slug,
        name: city.name,
        emoji: city.emoji,
        spotCount,
        coverageStatus: coverage.status,
        coverageMessage: coverage.message,
    };
}

/**
 * Get total spot count across all cities
 */
export async function getTotalSpotCount(): Promise<number> {
    const supabase = createSupabaseAdmin();

    let countQuery = supabase
        .from("spots")
        .select("*", { count: "exact", head: true });

    countQuery = applyPublicSpotVisibilityFilters(countQuery);

    const { count } = await countQuery;

    return count || 0;
}

/**
 * Get spots filtered by city
 */
export async function getSpotsByCity(citySlug: string, limit: number = 50) {
    const city = getCityBySlug(citySlug);
    if (!city) return { spots: [], count: 0 };

    const supabase = createSupabaseAdmin();

    let spotsQuery = supabase
        .from("spots")
        .select("*", { count: "exact" })
        .ilike("address->>en", `%${city.name}%`)
        .order("localley_score", { ascending: false });

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery)
        .limit(limit);

    const { data, count, error } = await spotsQuery;

    if (error) {
        console.error(`[city-stats] Error fetching spots for ${city.name}:`, error);
        return { spots: [], count: 0 };
    }

    return { spots: data || [], count: count || 0 };
}
