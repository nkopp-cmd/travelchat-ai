/**
 * Spots Filter Types
 * Central type definitions for the server-side filtering system
 */

import { Spot } from "@/types";

// URL parameter interface - mirrors searchParams from Next.js
export interface SpotsFilterParams {
    city?: string;      // City slug: "seoul", "tokyo", etc.
    category?: string;  // Category: "Food", "Cafe", etc.
    score?: string;     // Localley score: "6", "5", "4", "3"
    sort?: string;      // Sort order: "score", "trending", "local"
    search?: string;    // Search query (debounced)
    page?: string;      // Page number for pagination
}

// Validated filter state used by data layer
export interface SpotsFilterState {
    city: string | null;
    category: string | null;
    score: number | null;
    sortBy: "score" | "trending" | "local";
    search: string | null;
    page: number;
    limit: number;
}

// Response from data fetching
export interface SpotsResponse {
    spots: Spot[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    filters: {
        city: string | null;
        category: string | null;
        score: number | null;
    };
}

// City option for dropdown
export interface CityOption {
    slug: string;
    name: string;
    emoji: string;
    count: number;
}

// Category option for dropdown
export interface CategoryOption {
    name: string;
    count: number;
}

// Score option for dropdown
export interface ScoreOption {
    value: number;
    label: string;
    count: number;
}

// Filter options for all dropdowns
export interface FilterOptions {
    cities: CityOption[];
    categories: CategoryOption[];
    scores: ScoreOption[];
}

// Constants
export const SPOTS_PAGE_SIZE = 24; // 8 rows of 3 on desktop, 12 rows of 2 on tablet

export const SORT_OPTIONS = [
    { value: "score", label: "Highest Score" },
    { value: "trending", label: "Trending" },
    { value: "local", label: "Most Local" },
] as const;

export const SCORE_LABELS: Record<number, string> = {
    6: "Legendary Alley",
    5: "Hidden Gem",
    4: "Local Favorite",
    3: "Mixed Crowd",
    2: "Tourist Friendly",
    1: "Tourist Trap",
};

export const CATEGORY_OPTIONS = [
    "Food",
    "Cafe",
    "Nightlife",
    "Shopping",
    "Outdoor",
    "Market",
] as const;

export type SortOption = typeof SORT_OPTIONS[number]["value"];
export type CategoryType = typeof CATEGORY_OPTIONS[number];
