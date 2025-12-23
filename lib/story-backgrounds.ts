/**
 * Story Background Image Sources
 *
 * Provides multiple image source options for story backgrounds:
 * 1. AI-generated via Gemini (Pro/Premium) - Best quality, unique images
 * 2. TripAdvisor Content API - Real location photos with reviews
 * 3. Pexels API - High quality curated photos (requires API key)
 * 4. Unsplash Source - Free fallback (no API key needed)
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
    theme: string
): Promise<string | null> {
    // First try searching for the theme as an attraction in the city
    const query = `${theme} ${city}`;
    const locationId = await searchTripAdvisorLocation(query, 'attractions');

    if (locationId) {
        const photos = await getTripAdvisorPhotos(locationId);
        if (photos.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(photos.length, 5));
            return photos[randomIndex];
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
    orientation: 'portrait' | 'landscape' | 'square' = 'portrait'
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
            // Pick a random photo from the results for variety
            const randomIndex = Math.floor(Math.random() * Math.min(data.photos.length, 5));
            const photo = data.photos[randomIndex];

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
export async function getPexelsThemedImage(city: string, theme: string): Promise<string | null> {
    // Combine city and theme for more relevant results
    const queries = [
        `${city} ${theme}`,
        `${theme} travel`,
        theme,
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
 * Curated high-quality travel images for each supported city
 * Using direct Unsplash URLs (the Source API was deprecated)
 */
const CITY_IMAGES: Record<string, string[]> = {
    'seoul': [
        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1546874177-9e664107314e?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=1080&h=1920&fit=crop',
    ],
    'tokyo': [
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1549693578-d683be217e58?w=1080&h=1920&fit=crop',
    ],
    'bangkok': [
        'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1528181304800-259b08848526?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=1080&h=1920&fit=crop',
    ],
    'singapore': [
        'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1508964942454-1a56651d54ac?w=1080&h=1920&fit=crop',
    ],
};

// Default images for unknown cities
const DEFAULT_TRAVEL_IMAGES = [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1080&h=1920&fit=crop',
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=1080&h=1920&fit=crop',
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1080&h=1920&fit=crop',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1080&h=1920&fit=crop',
];

/**
 * Get an Unsplash image URL for a city
 * Uses curated direct URLs instead of deprecated Source API
 */
export function getUnsplashCityImage(city: string): string {
    const normalizedCity = city.toLowerCase().trim();
    const images = CITY_IMAGES[normalizedCity] || DEFAULT_TRAVEL_IMAGES;
    const randomIndex = Math.floor(Math.random() * images.length);
    return images[randomIndex];
}

/**
 * Get an Unsplash image for a specific theme
 * Falls back to city image if no theme-specific image available
 */
export function getUnsplashThemedImage(city: string, _theme: string): string {
    // For now, just return a random city image
    // Theme-based selection could be added later with more curated images
    return getUnsplashCityImage(city);
}

/**
 * City-specific image keywords for better Unsplash/Pexels results
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

/**
 * Get the best available story background image
 * Tries sources in order: AI (if available), TripAdvisor, Pexels, Unsplash
 */
export async function getStoryBackground(
    city: string,
    theme: string,
    aiGenerator?: () => Promise<string | null>
): Promise<{ url: string; source: 'ai' | 'tripadvisor' | 'pexels' | 'unsplash' }> {
    // Try AI generation first if available
    if (aiGenerator) {
        try {
            const aiImage = await aiGenerator();
            if (aiImage) {
                return { url: aiImage, source: 'ai' };
            }
        } catch (error) {
            console.error('[story-backgrounds] AI generation failed:', error);
        }
    }

    // Try TripAdvisor for real location photos
    if (isTripAdvisorAvailable()) {
        const tripAdvisorUrl = await getTripAdvisorThemedImage(city, theme);
        if (tripAdvisorUrl) {
            return { url: tripAdvisorUrl, source: 'tripadvisor' };
        }
    }

    // Try Pexels next
    const pexelsUrl = await getPexelsThemedImage(city, theme);
    if (pexelsUrl) {
        return { url: pexelsUrl, source: 'pexels' };
    }

    // Fall back to Unsplash
    const unsplashUrl = getUnsplashThemedImage(city, theme);
    return { url: unsplashUrl, source: 'unsplash' };
}

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

/**
 * Get available image sources for diagnostics
 */
export function getAvailableSources(): {
    ai: boolean;
    tripadvisor: boolean;
    pexels: boolean;
    unsplash: boolean;
} {
    return {
        ai: false, // Set by caller based on Gemini availability
        tripadvisor: isTripAdvisorAvailable(),
        pexels: isPexelsAvailable(),
        unsplash: true, // Always available
    };
}
