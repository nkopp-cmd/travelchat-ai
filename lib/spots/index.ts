/**
 * Spots module - Server-side filtering system
 *
 * Usage:
 *   import { fetchFilteredSpots, parseFilterParams } from "@/lib/spots";
 */

// Types
export type {
    SpotsFilterParams,
    SpotsFilterState,
    SpotsResponse,
    FilterOptions,
    CityOption,
    CategoryOption,
    ScoreOption,
    SortOption,
    CategoryType,
} from "./types";

export {
    SPOTS_PAGE_SIZE,
    SORT_OPTIONS,
    SCORE_LABELS,
    CATEGORY_OPTIONS,
} from "./types";

// Queries
export {
    parseFilterParams,
    buildFilterUrl,
    fetchFilteredSpots,
    fetchFilterOptions,
    getTotalSpotCount,
} from "./queries";

// Transform utilities
export {
    transformSpot,
    transformSpots,
    getLocalizedText,
} from "./transform";

export type { RawSpot } from "./transform";
