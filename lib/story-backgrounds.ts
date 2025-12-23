/**
 * Story Background Image Sources
 *
 * Provides multiple image source options for story backgrounds:
 * 1. AI-generated via Gemini (Pro/Premium) - Best quality, unique images
 * 2. Pexels API - High quality curated photos (requires API key)
 * 3. Unsplash Source - Free fallback (no API key needed)
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

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
 * Get an Unsplash image URL for a city (no API key needed)
 * Uses the Unsplash Source API which provides random photos by keyword
 */
export function getUnsplashCityImage(city: string, width: number = 1080, height: number = 1920): string {
    const cityKeyword = city.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '-');
    return `https://source.unsplash.com/${width}x${height}/?${cityKeyword},travel,landmark`;
}

/**
 * Get an Unsplash image for a specific theme
 */
export function getUnsplashThemedImage(
    city: string,
    theme: string,
    width: number = 1080,
    height: number = 1920
): string {
    const cityKeyword = city.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '-');
    const themeKeyword = theme.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '-');
    return `https://source.unsplash.com/${width}x${height}/?${cityKeyword},${themeKeyword}`;
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
 * Tries sources in order: AI (if available), Pexels, Unsplash
 */
export async function getStoryBackground(
    city: string,
    theme: string,
    aiGenerator?: () => Promise<string | null>
): Promise<{ url: string; source: 'ai' | 'pexels' | 'unsplash' }> {
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
 * Check if Pexels API is available
 */
export function isPexelsAvailable(): boolean {
    return !!PEXELS_API_KEY;
}
