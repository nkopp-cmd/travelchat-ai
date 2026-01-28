/**
 * Spot data transformation utilities
 * Converts raw Supabase data to application types
 */

import { Spot, MultiLanguageField } from "@/types";

// Raw spot type from Supabase
export interface RawSpot {
    id: string;
    name: MultiLanguageField;
    description: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    subcategories: string[] | null;
    location: {
        coordinates: [number, number];
    } | null;
    localley_score: number | null;
    local_percentage: number | null;
    best_time: string | null;
    photos: string[] | null;
    image_url: string | null;
    tips: string[] | null;
    verified: boolean | null;
    trending_score: number;
}

/**
 * Parse multi-language field to string
 * Prioritizes English, then falls back to first available language
 */
export function getLocalizedText(field: MultiLanguageField): string {
    if (typeof field === "object" && field !== null) {
        return field.en || Object.values(field)[0] || "";
    }
    return field || "";
}

/**
 * Transform raw Supabase spot to application Spot type
 */
export function transformSpot(spot: RawSpot): Spot {
    // Handle PostGIS geography format - coordinates are [lng, lat]
    const lat = spot.location?.coordinates?.[1] || 0;
    const lng = spot.location?.coordinates?.[0] || 0;

    // Build photos array, ensuring at least one image
    const photos = spot.photos?.length
        ? spot.photos
        : spot.image_url
            ? [spot.image_url]
            : ["/placeholder-spot.svg"];

    return {
        id: spot.id,
        name: getLocalizedText(spot.name),
        description: getLocalizedText(spot.description),
        category: spot.category || "Uncategorized",
        subcategories: spot.subcategories || [],
        location: {
            lat,
            lng,
            address: getLocalizedText(spot.address),
        },
        localleyScore: spot.localley_score || 3,
        localPercentage: spot.local_percentage || 50,
        bestTime: spot.best_time || "Anytime",
        photos,
        tips: spot.tips || [],
        verified: spot.verified || false,
        trending: spot.trending_score > 0.7,
    };
}

/**
 * Transform an array of raw spots
 */
export function transformSpots(spots: RawSpot[]): Spot[] {
    return spots.map(transformSpot);
}
