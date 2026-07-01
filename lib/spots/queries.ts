/**
 * Server-side Spots Queries
 * Handles all database operations for spot filtering with caching
 */

import { unstable_cache } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase";
import { getCityBySlug, ENABLED_CITIES } from "@/lib/cities";
import { transformSpot, RawSpot } from "./transform";
import {
  applyPublicSpotVisibilityFilters,
  PUBLIC_SPOT_VISIBILITY_CACHE_VERSION,
  shouldShowPublicSpot,
} from "./public-quality";
import {
  SpotsFilterParams,
  SpotsFilterState,
  SpotsResponse,
  FilterOptions,
  SPOTS_PAGE_SIZE,
  SCORE_LABELS,
} from "./types";

const SPOTS_QUERY_PAGE_SIZE = 1000;
export const DEFAULT_SPOTS_QUERY_TIMEOUT_MS = 8000;

function getSpotTextFieldValue(
  field: RawSpot["name"] | RawSpot["address"],
): string {
  if (typeof field === "object" && field !== null) {
    return field.en || Object.values(field)[0] || "";
  }

  return field || "";
}

function getSpotsQueryTimeoutMs(): number {
  const configuredTimeout = Number(process.env.SPOTS_QUERY_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_SPOTS_QUERY_TIMEOUT_MS;
}

export async function resolveSpotsQueryWithTimeout<T>(
  query: PromiseLike<T>,
  label: string,
): Promise<T> {
  const timeoutMs = getSpotsQueryTimeoutMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(query),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Parse and validate filter params from URL searchParams
 */
export function parseFilterParams(
  searchParams: SpotsFilterParams,
): SpotsFilterState {
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const scoreParam = searchParams.score
    ? parseInt(searchParams.score, 10)
    : null;
  const validScore =
    scoreParam && scoreParam >= 1 && scoreParam <= 6 ? scoreParam : null;

  // Validate sortBy
  const validSorts = ["score", "trending", "local"] as const;
  const sortBy = validSorts.includes(
    searchParams.sort as (typeof validSorts)[number],
  )
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
  if (filters.sortBy && filters.sortBy !== "score")
    params.set("sort", filters.sortBy);
  if (filters.search) params.set("search", filters.search);
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function applySpotSqlFilters(
  supabase: ReturnType<typeof createSupabaseClient>,
  filters: SpotsFilterState,
) {
  let query = supabase.from("spots").select("*");

  query = applyPublicSpotVisibilityFilters(query);

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

  // Score filter. The UI labels these as "5+", "4+", etc., so keep the
  // backend behavior threshold-based instead of exact-bucket filtering.
  if (filters.score) {
    query = query.gte("localley_score", filters.score);
  }

  // Text search - search across name, description, and address
  if (filters.search) {
    // Escape special characters for safe pattern matching
    const searchTerm = filters.search.replace(/[%_]/g, "\\$&");
    query = query.or(
      `name->>en.ilike.%${searchTerm}%,` +
        `description->>en.ilike.%${searchTerm}%,` +
        `address->>en.ilike.%${searchTerm}%`,
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

  // Secondary sort by ID for stable pagination after public-quality filtering.
  return query.order("id", { ascending: true });
}

async function fetchFilteredSpotRows(
  filters: SpotsFilterState,
): Promise<{ rows: RawSpot[]; error: string | null }> {
  const supabase = createSupabaseClient();
  const rows: RawSpot[] = [];

  for (let from = 0; ; from += SPOTS_QUERY_PAGE_SIZE) {
    const query = applySpotSqlFilters(supabase, filters).range(
      from,
      from + SPOTS_QUERY_PAGE_SIZE - 1,
    );
    let result: Awaited<typeof query>;
    try {
      result = await resolveSpotsQueryWithTimeout(
        query,
        `spots list query range ${from}-${from + SPOTS_QUERY_PAGE_SIZE - 1}`,
      );
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : "Spots query timed out",
      };
    }

    const { data, error } = result;

    if (error) {
      return { rows: [], error: error.message };
    }

    rows.push(...((data || []) as RawSpot[]));

    if (!data || data.length < SPOTS_QUERY_PAGE_SIZE) {
      break;
    }
  }

  return { rows, error: null };
}

async function fetchPublicCandidateRows(): Promise<{
  rows: RawSpot[];
  error: string | null;
}> {
  const supabase = createSupabaseClient();
  const rows: RawSpot[] = [];

  for (let from = 0; ; from += SPOTS_QUERY_PAGE_SIZE) {
    let query = supabase.from("spots").select("*");

    query = applyPublicSpotVisibilityFilters(query).range(
      from,
      from + SPOTS_QUERY_PAGE_SIZE - 1,
    );

    let result: Awaited<typeof query>;
    try {
      result = await resolveSpotsQueryWithTimeout(
        query,
        `spots filter options query range ${from}-${from + SPOTS_QUERY_PAGE_SIZE - 1}`,
      );
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : "Spots query timed out",
      };
    }

    const { data, error } = result;
    if (error) {
      return { rows: [], error: error.message };
    }

    rows.push(...((data || []) as RawSpot[]));

    if (!data || data.length < SPOTS_QUERY_PAGE_SIZE) {
      break;
    }
  }

  return { rows, error: null };
}

export function getPublicVisibleSpotRows(rows: RawSpot[]): RawSpot[] {
  const seen = new Map<string, boolean>();
  return rows.filter((spot) => {
    if (!shouldShowPublicSpot(spot)) return false;

    // Safety net: deduplicate by (name + address) in case DB has dupes.
    const key = `${getSpotTextFieldValue(spot.name).toLowerCase().trim()}|${getSpotTextFieldValue(spot.address).toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

export function getScoreThresholdCount(
  rows: RawSpot[],
  minimumScore: number,
): number {
  return rows.filter((spot) => (spot.localley_score || 3) >= minimumScore).length;
}

function getPublicTransformedSpots(rows: RawSpot[]): SpotsResponse["spots"] {
  return getPublicVisibleSpotRows(rows).map((spot) => transformSpot(spot));
}

/**
 * Internal: Fetch filtered spots from database
 */
async function fetchFilteredSpotsInternal(
  filters: SpotsFilterState,
): Promise<SpotsResponse> {
  const { rows, error } = await fetchFilteredSpotRows(filters);

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

  const publicSpots = getPublicTransformedSpots(rows);
  const total = publicSpots.length;
  const offset = (filters.page - 1) * filters.limit;
  const spots = publicSpots.slice(offset, offset + filters.limit);

  return {
    spots,
    total,
    page: filters.page,
    pageSize: filters.limit,
    hasMore: offset + filters.limit < total,
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
  filters: SpotsFilterState,
): Promise<SpotsResponse> {
  // Create a cache key from filters
  const cacheKey = JSON.stringify({
    visibility: PUBLIC_SPOT_VISIBILITY_CACHE_VERSION,
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
    },
  );

  return cachedFetch();
}

/**
 * Internal: Fetch filter options with counts
 */
async function fetchFilterOptionsInternal(): Promise<FilterOptions> {
  // Get all candidate spots, then apply the same public-quality filter used
  // by the list/detail views so counts do not include hidden weak records.
  const { rows, error } = await fetchPublicCandidateRows();
  if (error) {
    console.error("[spots/queries] Error fetching filter options:", error);
    return {
      cities: [],
      categories: [],
      scores: [6, 5, 4, 3].map((value) => ({
        value,
        label: SCORE_LABELS[value] || "Unknown",
        count: 0,
      })),
    };
  }

  const publicSpots = getPublicVisibleSpotRows(rows);

  const cities = ENABLED_CITIES.map((city) => {
    const count = publicSpots.filter((spot) => {
      const address = getSpotTextFieldValue(spot.address);

      return address.toLowerCase().includes(city.name.toLowerCase());
    }).length;

    return {
      slug: city.slug,
      name: city.name,
      emoji: city.emoji,
      count,
    };
  });

  // Calculate category counts
  const categoryCounts: Record<string, number> = {};
  publicSpots.forEach((spot) => {
    const cat = spot.category || "Uncategorized";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  return {
    cities: cities.filter((c) => c.count > 0),
    categories: Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    scores: [6, 5, 4, 3].map((value) => ({
      value,
      label: SCORE_LABELS[value] || "Unknown",
      count: getScoreThresholdCount(publicSpots, value),
    })),
  };
}

/**
 * Cached version of filter options
 */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  const cachedFetch = unstable_cache(
    fetchFilterOptionsInternal,
    ["spots-filter-options", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION],
    {
      revalidate: 600, // 10 minutes
      tags: ["spots"],
    },
  );

  return cachedFetch();
}

/**
 * Get total spot count (for header display)
 */
export async function getTotalSpotCount(): Promise<number> {
  const { rows, error } = await fetchPublicCandidateRows();
  if (error) {
    console.error("[spots/queries] Error counting spots:", error);
    return 0;
  }

  return getPublicVisibleSpotRows(rows).length;
}
