/**
 * Spot data transformation utilities
 * Converts raw Supabase data to application types
 */

import { Spot, MultiLanguageField } from "@/types";

/**
 * Category-based placeholder images for better UX when real images unavailable
 * These provide contextual visual hints rather than a generic placeholder
 */
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
    "Food": "/images/placeholders/food.svg",
    "Cafe": "/images/placeholders/cafe.svg",
    "Nightlife": "/images/placeholders/nightlife.svg",
    "Shopping": "/images/placeholders/shopping.svg",
    "Outdoor": "/images/placeholders/outdoor.svg",
    "Market": "/images/placeholders/market.svg",
    "Culture": "/images/placeholders/culture.svg",
    "Entertainment": "/images/placeholders/entertainment.svg",
};
const DEFAULT_PLACEHOLDER = "/images/placeholders/default.svg";

/**
 * Get appropriate placeholder image for a category
 */
function getCategoryPlaceholder(category: string | null): string {
    if (!category) return DEFAULT_PLACEHOLDER;
    return CATEGORY_PLACEHOLDERS[category] || DEFAULT_PLACEHOLDER;
}

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
    // Priority: real photos > category placeholder
    const photos = spot.photos?.length
        ? spot.photos
        : [getCategoryPlaceholder(spot.category)];

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
