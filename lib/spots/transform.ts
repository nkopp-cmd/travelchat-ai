/**
 * Spot data transformation utilities
 * Converts raw Supabase data to application types
 */

import { Spot, MultiLanguageField } from "@/types";
import {
    normalizeStoredSpotPhotoUrls,
    summarizeSpotPhotos,
} from "@/lib/place-images";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";

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

function isPlaceholderPhoto(photo: string): boolean {
    return photo.includes("/images/placeholders/") || photo.includes("placeholder");
}

function isUsablePhotoUrl(photo: string): boolean {
    if (!photo) return false;
    if (photo.startsWith("/")) return !isPlaceholderPhoto(photo);

    try {
        const url = new URL(photo);
        return !(
            url.hostname === "places.googleapis.com" &&
            url.pathname.includes("/photos/")
        );
    } catch {
        return true;
    }
}

export function normalizeSpotPhotos(
    photos: string[] | null | undefined,
    category: string | null,
    width = 1200
): string[] {
    const normalized = normalizeStoredSpotPhotoUrls(photos, width)
        .filter(isUsablePhotoUrl);

    const uniquePhotos = Array.from(new Set(normalized));
    return uniquePhotos.length ? uniquePhotos : [getCategoryPlaceholder(category)];
}

// Raw spot type from Supabase
export interface RawSpot {
    id: string;
    name: MultiLanguageField;
    description: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    subcategories: string[] | null;
    location: unknown;
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
    const { lat, lng } = getSpotCoordinateValues(spot.location);

    // Build photos array, ensuring at least one image
    // Priority: real photos > category placeholder
    const photoSummary = summarizeSpotPhotos(spot.photos);
    const photos = normalizeSpotPhotos(spot.photos, spot.category);

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
        hasRealPhoto: photoSummary.hasRealPhoto,
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
