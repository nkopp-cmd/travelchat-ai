/**
 * Story Background Image Sources
 *
 * Provides multiple image source options for story backgrounds:
 * 1. AI-generated via FLUX/Seedream/Gemini (Pro/Premium) - Best quality, unique images
 * 2. TripAdvisor Content API - Real location photos with reviews
 * 3. Pexels API - High quality curated photos (requires API key)
 *
 * Unsplash has been REMOVED — it was masking AI failures by silently
 * returning the same 8 hardcoded images per city.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const TRIPADVISOR_API_KEY = process.env.TRIPADVISOR_API_KEY;

interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographer_url: string;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        portrait: string;
    };
}

interface PexelsResponse {
    photos: PexelsPhoto[];
    total_results: number;
}

// TripAdvisor API types
interface TripAdvisorLocation {
    location_id: string;
    name: string;
    address_obj?: {
        city?: string;
        country?: string;
    };
}

interface TripAdvisorPhoto {
    id: number;
    is_blessed: boolean;
    caption: string;
    published_date: string;
    images: {
        thumbnail?: { url: string; width: number; height: number };
        small?: { url: string; width: number; height: number };
        medium?: { url: string; width: number; height: number };
        large?: { url: string; width: number; height: number };
        original?: { url: string; width: number; height: number };
    };
    source?: {
        name: string;
        localized_name: string;
    };
}

interface TripAdvisorSearchResponse {
    data: TripAdvisorLocation[];
}

interface TripAdvisorPhotosResponse {
    data: TripAdvisorPhoto[];
}

// =============================================================================
// TripAdvisor API Functions
// =============================================================================

/**
 * Search for a location on TripAdvisor
 * Returns the location_id needed for fetching photos
 */
export async function searchTripAdvisorLocation(
    query: string,
    category: 'geos' | 'attractions' | 'restaurants' | 'hotels' = 'geos'
): Promise<string | null> {
    if (!TRIPADVISOR_API_KEY) {
        console.log('[story-backgrounds] TripAdvisor API key not configured');
        return null;
    }

    try {
        const response = await fetch(
            `https://api.content.tripadvisor.com/api/v1/location/search?key=${TRIPADVISOR_API_KEY}&searchQuery=${encodeURIComponent(query)}&category=${category}&language=en`,
            {
                headers: {
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            console.error('[story-backgrounds] TripAdvisor search error:', response.status);
            return null;
        }

        const data: TripAdvisorSearchResponse = await response.json();

        if (data.data && data.data.length > 0) {
            return data.data[0].location_id;
        }

        return null;
    } catch (error) {
        console.error('[story-backgrounds] TripAdvisor search failed:', error);
        return null;
    }
}

/**
 * Get photos for a TripAdvisor location
 * Returns up to 5 high-quality photos per the API limits
 */
export async function getTripAdvisorPhotos(locationId: string): Promise<string[]> {
    if (!TRIPADVISOR_API_KEY) {
        return [];
    }

    try {
        const response = await fetch(
            `https://api.content.tripadvisor.com/api/v1/location/${locationId}/photos?key=${TRIPADVISOR_API_KEY}&language=en`,
            {
                headers: {
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            console.error('[story-backgrounds] TripAdvisor photos error:', response.status);
            return [];
        }

        const data: TripAdvisorPhotosResponse = await response.json();

        if (data.data && data.data.length > 0) {
            // Get the largest available image for each photo
            return data.data
                .map(photo => {
                    // Prefer original or large size for best quality
                    return photo.images.original?.url ||
                           photo.images.large?.url ||
                           photo.images.medium?.url ||
                           null;
                })
                .filter((url): url is string => url !== null);
        }

        return [];
    } catch (error) {
        console.error('[story-backgrounds] TripAdvisor photos failed:', error);
        return [];
    }
}

/**
 * Get a city photo from TripAdvisor
 * Searches for the city and returns a random photo from results
 */
export async function getTripAdvisorCityImage(city: string): Promise<string | null> {
    const locationId = await searchTripAdvisorLocation(city, 'geos');
    if (!locationId) {
        return null;
    }

    const photos = await getTripAdvisorPhotos(locationId);
    if (photos.length > 0) {
        // Pick a random photo for variety
        const randomIndex = Math.floor(Math.random() * Math.min(photos.length, 5));
        return photos[randomIndex];
    }

    return null;
}

/**
 * Get a themed photo from TripAdvisor
 * Searches for attractions matching the theme
 */
export async function getTripAdvisorThemedImage(
    city: string,
    theme: string,
    excludeUrls: string[] = []
): Promise<string | null> {
    // First try searching for the theme as an attraction in the city
    const query = `${theme} ${city}`;
    const locationId = await searchTripAdvisorLocation(query, 'attractions');

    if (locationId) {
        const photos = await getTripAdvisorPhotos(locationId);
        // Filter out already-used URLs to prevent duplicates across slides
        const available = excludeUrls.length > 0
            ? photos.filter(url => !excludeUrls.includes(url))
            : photos;
        if (available.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(available.length, 5));
            return available[randomIndex];
        }
    }

    // Fall back to city photos
    return getTripAdvisorCityImage(city);
}

// =============================================================================
// Pexels API Functions
// =============================================================================

/**
 * Search for travel photos on Pexels
 * Returns a vertical (portrait) oriented image URL suitable for stories
 */
export async function searchPexelsImage(
    query: string,
    orientation: 'portrait' | 'landscape' | 'square' = 'portrait',
    excludeUrls: string[] = []
): Promise<string | null> {
    if (!PEXELS_API_KEY) {
        console.log('[story-backgrounds] Pexels API key not configured');
        return null;
    }

    try {
        const response = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=10`,
            {
                headers: {
                    Authorization: PEXELS_API_KEY,
                },
            }
        );

        if (!response.ok) {
            console.error('[story-backgrounds] Pexels API error:', response.status);
            return null;
        }

        const data: PexelsResponse = await response.json();

        if (data.photos && data.photos.length > 0) {
            // Filter out already-used URLs to prevent duplicates across slides
            const candidates = excludeUrls.length > 0
                ? data.photos.filter(p => {
                    const url = orientation === 'portrait' ? p.src.portrait : p.src.large2x;
                    return !excludeUrls.includes(url);
                })
                : data.photos;

            if (candidates.length === 0) return null;

            // Pick a random photo from the candidates for variety
            const randomIndex = Math.floor(Math.random() * Math.min(candidates.length, 5));
            const photo = candidates[randomIndex];

            // Use portrait size for stories (1080x1920 compatible)
            // or large2x for best quality
            return orientation === 'portrait' ? photo.src.portrait : photo.src.large2x;
        }

        return null;
    } catch (error) {
        console.error('[story-backgrounds] Pexels search failed:', error);
        return null;
    }
}

/**
 * Get a city-specific travel photo from Pexels
 */
export async function getPexelsCityImage(city: string): Promise<string | null> {
    // Try specific city first, then broader travel terms
    const queries = [
        `${city} landmark`,
        `${city} travel`,
        `${city} cityscape`,
        `${city} architecture`,
    ];

    for (const query of queries) {
        const imageUrl = await searchPexelsImage(query, 'portrait');
        if (imageUrl) {
            return imageUrl;
        }
    }

    return null;
}

/**
 * Get a themed travel photo from Pexels
 */
export async function getPexelsThemedImage(
    city: string,
    theme: string,
    excludeUrls: string[] = []
): Promise<string | null> {
    // Combine city and theme for more relevant results
    const queries = [
        `${city} ${theme}`,
        `${theme} travel`,
        theme,
    ];

    for (const query of queries) {
        const imageUrl = await searchPexelsImage(query, 'portrait', excludeUrls);
        if (imageUrl) {
            return imageUrl;
        }
    }

    return null;
}

// =============================================================================
// Keyword Helpers
// =============================================================================

/**
 * City-specific image keywords for better search results
 */
const CITY_KEYWORDS: Record<string, string[]> = {
    'tokyo': ['shibuya', 'tokyo tower', 'senso-ji', 'shinjuku'],
    'paris': ['eiffel tower', 'louvre', 'montmartre', 'champs elysees'],
    'new york': ['times square', 'manhattan', 'central park', 'brooklyn bridge'],
    'london': ['big ben', 'tower bridge', 'buckingham palace', 'westminster'],
    'rome': ['colosseum', 'vatican', 'trevi fountain', 'roman forum'],
    'barcelona': ['sagrada familia', 'park guell', 'la rambla', 'gothic quarter'],
    'amsterdam': ['canals', 'anne frank', 'rijksmuseum', 'dutch'],
    'bangkok': ['grand palace', 'wat arun', 'chatuchak', 'thai temple'],
    'sydney': ['opera house', 'harbour bridge', 'bondi beach', 'darling harbour'],
    'dubai': ['burj khalifa', 'palm jumeirah', 'dubai marina', 'desert'],
};

/**
 * Get city-specific keywords for better image search
 */
export function getCityKeywords(city: string): string[] {
    const normalizedCity = city.toLowerCase();
    return CITY_KEYWORDS[normalizedCity] || [normalizedCity, 'travel', 'landmark', 'cityscape'];
}

/**
 * Theme-specific keywords for day backgrounds
 */
const THEME_KEYWORDS: Record<string, string[]> = {
    'food': ['restaurant', 'cuisine', 'street food', 'dining'],
    'culture': ['museum', 'art', 'history', 'heritage'],
    'nature': ['park', 'garden', 'landscape', 'outdoor'],
    'shopping': ['market', 'bazaar', 'boutique', 'shopping street'],
    'nightlife': ['night', 'lights', 'entertainment', 'evening'],
    'adventure': ['explore', 'discovery', 'outdoor', 'activities'],
    'relaxation': ['spa', 'beach', 'peaceful', 'scenic'],
    'history': ['ancient', 'historical', 'monument', 'heritage'],
};

/**
 * Get theme-specific keywords for better image search
 */
export function getThemeKeywords(theme: string): string[] {
    const normalizedTheme = theme.toLowerCase();

    // Check if any known theme keywords match
    for (const [key, keywords] of Object.entries(THEME_KEYWORDS)) {
        if (normalizedTheme.includes(key)) {
            return keywords;
        }
    }

    // Extract key words from the theme string
    return normalizedTheme.split(/\s+/).slice(0, 3);
}

// =============================================================================
// Provider Availability
// =============================================================================

/**
 * Check if TripAdvisor API is available
 */
export function isTripAdvisorAvailable(): boolean {
    return !!TRIPADVISOR_API_KEY;
}

/**
 * Check if Pexels API is available
 */
export function isPexelsAvailable(): boolean {
    return !!PEXELS_API_KEY;
}
