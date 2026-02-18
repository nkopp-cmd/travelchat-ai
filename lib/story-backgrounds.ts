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

/**
 * Curated high-quality travel images for each supported city
 * Using direct Unsplash URLs (the Source API was deprecated)
 * 8 images per city for variety across story slides
 */
const CITY_IMAGES: Record<string, string[]> = {
    'seoul': [
        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1546874177-9e664107314e?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1583400225586-0e417f4eb47f?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1601621915196-2621bfb0cd6e?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1578037571214-25e07a4c539d?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'tokyo': [
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1549693578-d683be217e58?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1480796927426-f609979314bd?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1554797589-7241bb691973?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1513407030348-c983a97b98d8?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'bangkok': [
        'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1528181304800-259b08848526?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1583531352515-8884d2440943?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1569959220744-ff553533f492?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'singapore': [
        'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1508964942454-1a56651d54ac?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1533279443086-d1c19a186416?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1524236122334-53dcfd5e2152?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'kyoto': [
        'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1504109586057-7a2ae83d1338?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1576675466969-38eeae4b41f6?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1548755336-3cef2e4d7a39?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'osaka': [
        'https://images.unsplash.com/photo-1590559899731-a382839e5549?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1574236170880-fba81e6aa76b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1556640530-f7b32680faeb?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1623095564025-3c523a37ad8e?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1583247832076-43c893be3df7?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1589452271712-3ce0e1b1e0a6?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1536722203615-3c5cf0ddc816?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1590417975079-e6fa853e2fd4?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'taipei': [
        'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1530093884857-c0b7e9320c2d?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1517030330234-94c4fb948ebc?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1508108712903-49b7ef9b1df8?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1552912956-bb00b0e1f2d5?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1619535780084-0d18e8ccac64?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1529684584403-e3c3f94b17b8?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1498711333025-ba569e42e67b?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'busan': [
        'https://images.unsplash.com/photo-1573492600965-75c7bcc8dfe0?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1596073419798-c3edbc40e194?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1578037571214-25e07a4c539d?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1585805345498-16fbd43d73ce?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1595855388765-2e3a62e5de28?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1622441732210-e0805b3df84e?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'hong kong': [
        'https://images.unsplash.com/photo-1536599018102-9f803c979b13?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1594974938498-04a68bbd6f34?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1517144447511-aebb25bbc5fa?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1563950708-79b66ead94b6?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'hanoi': [
        'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1555921015-5532091f6026?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1573503555498-c463f94ddef2?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1559564484-e48b3e040ff4?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1600398232242-8cb5d0407cf1?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1535952288335-3a8b0c6d3c84?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'ho chi minh': [
        'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1557750255-c76072572da2?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1579515369459-ce22a804fadc?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1576079546721-38caf184e484?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1616595254674-cf0eb0e04e3b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1562740083-6c5285de47ca?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1571167366136-b57e07761625?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'ho chi minh city': [ // Alias
        'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1557750255-c76072572da2?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1579515369459-ce22a804fadc?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1576079546721-38caf184e484?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1616595254674-cf0eb0e04e3b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1562740083-6c5285de47ca?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1571167366136-b57e07761625?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'chiang mai': [
        'https://images.unsplash.com/photo-1569949381669-ecf31ae8e614?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1512553539922-56d8c63b20a7?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1547283024-c3eef988c6f9?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1590057823881-de3cc2680dc6?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1570789210967-2cac24ba8148?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1539638831901-22c59aa9fd3b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1568704847210-d59eed75d389?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'kuala lumpur': [
        'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1508093893610-52c500ce31c0?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1556012643-cf2f2c578b87?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1609703048519-2ef4a6db64e2?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1554345155-e36e9be8e445?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1572437495782-9b79b4e50e33?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1580734200710-89e3e64f73e8?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'bali': [
        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1573790387438-4da905039392?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1558005137-d9619a5c539f?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1604928141064-207cea6f571f?w=1080&h=1920&fit=crop&fm=jpg',
    ],
    'ubud': [ // Bali/Ubud alias
        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1573790387438-4da905039392?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1558005137-d9619a5c539f?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?w=1080&h=1920&fit=crop&fm=jpg',
        'https://images.unsplash.com/photo-1604928141064-207cea6f571f?w=1080&h=1920&fit=crop&fm=jpg',
    ],
};

// Default images for unknown cities
const DEFAULT_TRAVEL_IMAGES = [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1080&h=1920&fit=crop&fm=jpg',
    'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1080&h=1920&fit=crop&fm=jpg',
];

/**
 * Simple string hash for deterministic image selection
 * Ensures the same theme always picks the same image index
 */
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/**
 * Get an Unsplash image URL for a city
 * Uses curated direct URLs instead of deprecated Source API
 */
export function getUnsplashCityImage(city: string, index?: number): string {
    const normalizedCity = city.toLowerCase().trim();
    const images = CITY_IMAGES[normalizedCity] || DEFAULT_TRAVEL_IMAGES;
    const i = index !== undefined ? (index % images.length) : Math.floor(Math.random() * images.length);
    return images[i];
}

/**
 * Get an Unsplash image for a specific theme.
 *
 * When `slotIndex` is provided (0 for cover, 1 for day 1, 2 for day 2, …,
 * N+1 for summary), each slide is guaranteed a unique image from the pool.
 * This solves the duplicate-image problem caused by parallel requests that
 * share the same `excludeUrls` and by deterministic hashing collisions.
 */
export function getUnsplashThemedImage(
    city: string,
    theme: string,
    excludeUrls: string[] = [],
    slotIndex?: number
): string {
    const normalizedCity = city.toLowerCase().trim();
    const images = CITY_IMAGES[normalizedCity] || DEFAULT_TRAVEL_IMAGES;

    // Slot-based selection: guaranteed unique per slide
    if (slotIndex !== undefined) {
        const available = excludeUrls.length > 0
            ? images.filter(url => !excludeUrls.includes(url))
            : images;
        const pool = available.length > 0 ? available : images;
        return pool[slotIndex % pool.length];
    }

    // Legacy: hash-based fallback (for callers that don't pass slotIndex)
    const themeIndex = simpleHash(theme);
    return images[themeIndex % images.length];
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
