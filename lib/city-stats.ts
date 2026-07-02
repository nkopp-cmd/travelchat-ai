/**
 * City Statistics - Server-side functions for city coverage data
 */

import { createSupabaseAdmin } from "@/lib/supabase";
import {
    ENABLED_CITIES,
    getCityBySlug,
    getCoverageMessage,
} from "./cities";
import {
    applyPublicSpotVisibilityFilters,
    shouldShowPublicSpot,
} from "./spots/public-quality";

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
        let spotsQuery = supabase
            .from("spots")
            .select("name, address, location, photos, google_place_id");

        spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery);

        const { data } = await spotsQuery.ilike("address->>en", `%${city.name}%`);

        const spotCount = (data || []).filter((spot) => shouldShowPublicSpot(spot)).length;
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

    let spotsQuery = supabase
        .from("spots")
        .select("name, address, location, photos, google_place_id");

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery);

    const { data } = await spotsQuery.ilike("address->>en", `%${city.name}%`);

    const spotCount = (data || []).filter((spot) => shouldShowPublicSpot(spot)).length;
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

    let spotsQuery = supabase
        .from("spots")
        .select("name, address, location, photos, google_place_id");

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery);

    const { data } = await spotsQuery;

    return (data || []).filter((spot) => shouldShowPublicSpot(spot)).length;
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
        .select("*")
        .ilike("address->>en", `%${city.name}%`)
        .order("localley_score", { ascending: false });

    spotsQuery = applyPublicSpotVisibilityFilters(spotsQuery)
        .limit(limit);

    const { data, error } = await spotsQuery;

    if (error) {
        console.error(`[city-stats] Error fetching spots for ${city.name}:`, error);
        return { spots: [], count: 0 };
    }

    const publicSpots = (data || []).filter((spot) => shouldShowPublicSpot(spot));

    return { spots: publicSpots, count: publicSpots.length };
}
