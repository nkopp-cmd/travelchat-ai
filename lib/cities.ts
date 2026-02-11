/**
 * City Registry - Ring of Confidence Expansion Plan
 *
 * Ring 1 (Anchor): Trust builders - must be outstanding
 * Ring 2 (Expansion): High-demand cities for scale perception
 * Ring 3 (Depth): Moat content for repeat users
 */

export type CityRing = 1 | 2 | 3;

export interface CityConfig {
    slug: string;
    name: string;
    country: string;
    countryCode: string;
    emoji: string;
    ring: CityRing;
    isEnabled: boolean;
    targets: {
        spots: { min: number; ideal: number };
        templates: { min: number; ideal: number };
    };
    neighborhoods: string[];
    timezone: string;
    languages: string[];
    currency: string;
    // Geocoding - city center for map fallback & geocoder bias
    center: { lat: number; lng: number };
    // UI metadata
    vibe?: string;
    heroImage?: string;
}

export interface CityStats {
    slug: string;
    spotCount: number;
    templateCount: number;
    categoryDistribution: Record<string, number>;
    localnessDistribution: Record<string, number>;
    neighborhoodCoverage: number;
    missingImageRate: number;
    lastUpdated: string;
}

// Target localness distribution (must match for quality)
export const LOCALNESS_TARGETS = {
    "Tourist Hotspot": { min: 5, max: 15 },      // 10% target
    "Popular Icon": { min: 20, max: 30 },        // 25% target
    "Local Favorite": { min: 30, max: 40 },      // 35% target
    "Hidden Gem": { min: 20, max: 30 },          // 25% target
    "Legendary Alley": { min: 3, max: 8 },       // 5% target
};

// Map localley scores to labels
export const LOCALNESS_LABELS: Record<number, string> = {
    1: "Tourist Trap",
    2: "Tourist Friendly",
    3: "Mixed Crowd",
    4: "Local Favorite",
    5: "Hidden Gem",
    6: "Legendary Alley",
};

// Required categories for each city (quality gate)
export const REQUIRED_CATEGORIES = [
    "Food",
    "Cafe",
    "Nightlife",
    "Shopping",
    "Outdoor",
    "Market",
];

// ============================================
// RING 1 - ANCHOR CITIES (Trust Builders)
// ============================================
const RING_1_CITIES: CityConfig[] = [
    {
        slug: "seoul",
        name: "Seoul",
        country: "South Korea",
        countryCode: "KR",
        emoji: "🇰🇷",
        ring: 1,
        isEnabled: true,
        targets: {
            spots: { min: 400, ideal: 800 },
            templates: { min: 12, ideal: 20 },
        },
        neighborhoods: [
            "Hongdae", "Itaewon", "Gangnam", "Myeongdong", "Insadong",
            "Bukchon", "Ikseon-dong", "Seongsu-dong", "Yeonnam-dong",
            "Mangwon", "Euljiro", "Jongno", "Sinchon", "Samcheong-dong"
        ],
        timezone: "Asia/Seoul",
        languages: ["ko", "en"],
        currency: "KRW",
        center: { lat: 37.5665, lng: 126.9780 },
        vibe: "K-culture & nightlife",
        heroImage: "https://images.unsplash.com/photo-1583833008338-31a6657917ab?w=400",
    },
    {
        slug: "tokyo",
        name: "Tokyo",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 1,
        isEnabled: true,
        targets: {
            spots: { min: 400, ideal: 800 },
            templates: { min: 12, ideal: 20 },
        },
        neighborhoods: [
            "Shibuya", "Shinjuku", "Harajuku", "Shimokitazawa", "Nakameguro",
            "Daikanyama", "Asakusa", "Ginza", "Roppongi", "Koenji",
            "Kichijoji", "Yanaka", "Tsukiji", "Akihabara", "Ebisu"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 35.6762, lng: 139.6503 },
        vibe: "Tradition meets tech",
        heroImage: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400",
    },
    {
        slug: "bangkok",
        name: "Bangkok",
        country: "Thailand",
        countryCode: "TH",
        emoji: "🇹🇭",
        ring: 1,
        isEnabled: true,
        targets: {
            spots: { min: 400, ideal: 800 },
            templates: { min: 12, ideal: 20 },
        },
        neighborhoods: [
            "Sukhumvit", "Thonglor", "Ekkamai", "Ari", "Chatuchak",
            "Silom", "Sathorn", "Chinatown", "Khao San", "Rattanakosin",
            "Phra Khanong", "On Nut", "Ratchada", "Pratunam"
        ],
        timezone: "Asia/Bangkok",
        languages: ["th", "en"],
        currency: "THB",
        center: { lat: 13.7563, lng: 100.5018 },
        vibe: "Street food paradise",
        heroImage: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400",
    },
    {
        slug: "singapore",
        name: "Singapore",
        country: "Singapore",
        countryCode: "SG",
        emoji: "🇸🇬",
        ring: 1,
        isEnabled: true,
        targets: {
            spots: { min: 400, ideal: 800 },
            templates: { min: 12, ideal: 20 },
        },
        neighborhoods: [
            "Tiong Bahru", "Jalan Besar", "Little India", "Chinatown",
            "Kampong Glam", "Holland Village", "Dempsey Hill", "Geylang",
            "East Coast", "Katong", "Bugis", "Clarke Quay", "Marina Bay"
        ],
        timezone: "Asia/Singapore",
        languages: ["en", "zh", "ms", "ta"],
        currency: "SGD",
        center: { lat: 1.3521, lng: 103.8198 },
        vibe: "Modern melting pot",
        heroImage: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400",
    },
];

// ============================================
// RING 2 - EXPANSION CITIES (Scale Perception)
// ============================================
const RING_2_CITIES: CityConfig[] = [
    // Japan
    {
        slug: "osaka",
        name: "Osaka",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Dotonbori", "Shinsaibashi", "Umeda", "Namba", "Shinsekai",
            "Tennoji", "Nakazakicho", "Amemura"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 34.6937, lng: 135.5023 },
        vibe: "Food & fun capital",
        heroImage: "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=400",
    },
    {
        slug: "kyoto",
        name: "Kyoto",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Gion", "Higashiyama", "Arashiyama", "Pontocho", "Nishiki",
            "Kiyamachi", "Fushimi"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 35.0116, lng: 135.7681 },
        vibe: "Ancient temples & tea",
        heroImage: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400",
    },
    // Taiwan
    {
        slug: "taipei",
        name: "Taipei",
        country: "Taiwan",
        countryCode: "TW",
        emoji: "🇹🇼",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Ximending", "Da'an", "Xinyi", "Shilin", "Wanhua",
            "Zhongshan", "Songshan", "Yongkang Street"
        ],
        timezone: "Asia/Taipei",
        languages: ["zh", "en"],
        currency: "TWD",
        center: { lat: 25.0330, lng: 121.5654 },
        vibe: "Night markets & bubble tea",
        heroImage: "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=400",
    },
    // Hong Kong
    {
        slug: "hong-kong",
        name: "Hong Kong",
        country: "Hong Kong",
        countryCode: "HK",
        emoji: "🇭🇰",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Central", "Sheung Wan", "Wan Chai", "Causeway Bay", "Mong Kok",
            "Tsim Sha Tsui", "Sham Shui Po", "Kennedy Town"
        ],
        timezone: "Asia/Hong_Kong",
        languages: ["zh", "en"],
        currency: "HKD",
        center: { lat: 22.3193, lng: 114.1694 },
        vibe: "Dim sum & skyline views",
        heroImage: "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=400",
    },
    // Korea
    {
        slug: "busan",
        name: "Busan",
        country: "South Korea",
        countryCode: "KR",
        emoji: "🇰🇷",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Haeundae", "Seomyeon", "Nampo-dong", "Gwangalli", "Gamcheon",
            "Jagalchi", "Centum City"
        ],
        timezone: "Asia/Seoul",
        languages: ["ko", "en"],
        currency: "KRW",
        center: { lat: 35.1796, lng: 129.0756 },
        vibe: "Beaches & seafood",
        heroImage: "https://images.unsplash.com/photo-1538485399081-7c8ed7e694d0?w=400",
    },
    {
        slug: "jeju",
        name: "Jeju",
        country: "South Korea",
        countryCode: "KR",
        emoji: "🇰🇷",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Jeju City", "Seogwipo", "Aewol", "Hallim", "Jungmun",
            "Udo Island"
        ],
        timezone: "Asia/Seoul",
        languages: ["ko", "en"],
        currency: "KRW",
        center: { lat: 33.4996, lng: 126.5312 },
        vibe: "Island paradise",
        heroImage: "https://images.unsplash.com/photo-1616798249081-30877e213b16?w=400",
    },
    // Vietnam
    {
        slug: "hanoi",
        name: "Hanoi",
        country: "Vietnam",
        countryCode: "VN",
        emoji: "🇻🇳",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Old Quarter", "Hoan Kiem", "Ba Dinh", "Tay Ho", "Dong Da"
        ],
        timezone: "Asia/Ho_Chi_Minh",
        languages: ["vi", "en"],
        currency: "VND",
        center: { lat: 21.0278, lng: 105.8342 },
        vibe: "Old Quarter charm",
        heroImage: "https://images.unsplash.com/photo-1506236506587-53051b4197be?w=400",
    },
    {
        slug: "ho-chi-minh",
        name: "Ho Chi Minh City",
        country: "Vietnam",
        countryCode: "VN",
        emoji: "🇻🇳",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "District 1", "District 3", "District 7", "Binh Thanh", "Phu Nhuan",
            "Thu Duc"
        ],
        timezone: "Asia/Ho_Chi_Minh",
        languages: ["vi", "en"],
        currency: "VND",
        center: { lat: 10.8231, lng: 106.6297 },
        vibe: "Saigon hustle & buzz",
        heroImage: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=400",
    },
    // Malaysia
    {
        slug: "kuala-lumpur",
        name: "Kuala Lumpur",
        country: "Malaysia",
        countryCode: "MY",
        emoji: "🇲🇾",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 150, ideal: 300 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Bukit Bintang", "KLCC", "Bangsar", "Mont Kiara", "Petaling Jaya",
            "Chow Kit", "Chinatown"
        ],
        timezone: "Asia/Kuala_Lumpur",
        languages: ["ms", "en", "zh"],
        currency: "MYR",
        center: { lat: 3.1390, lng: 101.6869 },
        vibe: "Towers & hawker stalls",
        heroImage: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=400",
    },
    // Indonesia (Bali split)
    {
        slug: "bali-ubud",
        name: "Ubud, Bali",
        country: "Indonesia",
        countryCode: "ID",
        emoji: "🇮🇩",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 120, ideal: 200 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Central Ubud", "Tegallalang", "Penestanan", "Campuhan",
            "Mas", "Peliatan"
        ],
        timezone: "Asia/Makassar",
        languages: ["id", "en"],
        currency: "IDR",
        center: { lat: -8.5069, lng: 115.2625 },
        vibe: "Rice terraces & yoga",
        heroImage: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=400",
    },
    {
        slug: "bali-canggu",
        name: "Canggu, Bali",
        country: "Indonesia",
        countryCode: "ID",
        emoji: "🇮🇩",
        ring: 2,
        isEnabled: true,
        targets: {
            spots: { min: 120, ideal: 200 },
            templates: { min: 6, ideal: 10 },
        },
        neighborhoods: [
            "Batu Bolong", "Berawa", "Echo Beach", "Pererenan", "Seseh"
        ],
        timezone: "Asia/Makassar",
        languages: ["id", "en"],
        currency: "IDR",
        center: { lat: -8.6478, lng: 115.1385 },
        vibe: "Surf & beach vibes",
        heroImage: "https://images.unsplash.com/photo-1724568834710-d5db3faab7e8?w=400",
    },
];

// ============================================
// RING 3 - DEPTH CITIES (Moat + Repeat Users)
// ============================================
const RING_3_CITIES: CityConfig[] = [
    {
        slug: "chiang-mai",
        name: "Chiang Mai",
        country: "Thailand",
        countryCode: "TH",
        emoji: "🇹🇭",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Old City", "Nimmanhaemin", "Santitham", "Night Bazaar",
            "Riverside"
        ],
        timezone: "Asia/Bangkok",
        languages: ["th", "en"],
        currency: "THB",
        center: { lat: 18.7883, lng: 98.9853 },
        vibe: "Temples & digital nomads",
        heroImage: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=400",
    },
    {
        slug: "da-nang",
        name: "Da Nang",
        country: "Vietnam",
        countryCode: "VN",
        emoji: "🇻🇳",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "My Khe Beach", "Han River", "Son Tra", "Hoi An (nearby)"
        ],
        timezone: "Asia/Ho_Chi_Minh",
        languages: ["vi", "en"],
        currency: "VND",
        center: { lat: 16.0544, lng: 108.2022 },
        vibe: "Dragon Bridge & beaches",
        heroImage: "https://images.unsplash.com/photo-1701396173275-835886dd72ce?w=400",
    },
    {
        slug: "penang",
        name: "Penang",
        country: "Malaysia",
        countryCode: "MY",
        emoji: "🇲🇾",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "George Town", "Gurney Drive", "Batu Ferringhi", "Air Itam"
        ],
        timezone: "Asia/Kuala_Lumpur",
        languages: ["ms", "en", "zh"],
        currency: "MYR",
        center: { lat: 5.4164, lng: 100.3327 },
        vibe: "Street art & hawker food",
        heroImage: "https://images.unsplash.com/photo-1650163410135-e5355b4ff33e?w=400",
    },
    {
        slug: "nara",
        name: "Nara",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Nara Park", "Naramachi", "Todai-ji Area", "Kasuga Area"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 34.6851, lng: 135.8048 },
        vibe: "Deer park & ancient temples",
        heroImage: "https://images.unsplash.com/photo-1720573166278-4ac6ba745a2a?w=400",
    },
    {
        slug: "kanazawa",
        name: "Kanazawa",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Kenrokuen", "Higashi Chaya", "Kazuemachi", "Nagamachi"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 36.5613, lng: 136.6562 },
        vibe: "Samurai gardens",
        heroImage: "https://images.unsplash.com/photo-1627304827615-3a05fafaed7a?w=400",
    },
    {
        slug: "gyeongju",
        name: "Gyeongju",
        country: "South Korea",
        countryCode: "KR",
        emoji: "🇰🇷",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Downtown", "Bomun Lake", "Bulguksa Area", "Yangdong Village"
        ],
        timezone: "Asia/Seoul",
        languages: ["ko", "en"],
        currency: "KRW",
        center: { lat: 35.8562, lng: 129.2247 },
        vibe: "Ancient kingdom ruins",
        heroImage: "https://images.unsplash.com/photo-1684134549350-be5fd0d8feaa?w=400",
    },
    {
        slug: "sapporo",
        name: "Sapporo",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Susukino", "Odori", "Tanukikoji", "Maruyama"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 43.0618, lng: 141.3545 },
        vibe: "Snow & ramen paradise",
        heroImage: "https://images.unsplash.com/photo-1736156725121-027231636f9d?w=400",
    },
    {
        slug: "okinawa",
        name: "Okinawa",
        country: "Japan",
        countryCode: "JP",
        emoji: "🇯🇵",
        ring: 3,
        isEnabled: true,
        targets: {
            spots: { min: 80, ideal: 150 },
            templates: { min: 4, ideal: 8 },
        },
        neighborhoods: [
            "Naha", "Kokusai Street", "Shuri", "Chatan", "Nago"
        ],
        timezone: "Asia/Tokyo",
        languages: ["ja", "en"],
        currency: "JPY",
        center: { lat: 26.3344, lng: 127.8056 },
        vibe: "Tropical island escape",
        heroImage: "https://images.unsplash.com/photo-1664888882993-5bc4b906db5e?w=400",
    },
];

// ============================================
// EXPORTS
// ============================================

export const ALL_CITIES: CityConfig[] = [
    ...RING_1_CITIES,
    ...RING_2_CITIES,
    ...RING_3_CITIES,
];

export const ENABLED_CITIES = ALL_CITIES.filter(c => c.isEnabled);

export const CITIES_BY_RING = {
    1: RING_1_CITIES,
    2: RING_2_CITIES,
    3: RING_3_CITIES,
};

// Helper functions
export function getCityBySlug(slug: string): CityConfig | undefined {
    return ALL_CITIES.find(c => c.slug === slug);
}

export function getCityByName(name: string): CityConfig | undefined {
    return ALL_CITIES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export function getEnabledCities(): CityConfig[] {
    return ENABLED_CITIES;
}

export function getCitiesByRing(ring: CityRing): CityConfig[] {
    return CITIES_BY_RING[ring];
}

export function getCityTargets(slug: string): CityConfig['targets'] | undefined {
    return getCityBySlug(slug)?.targets;
}

/**
 * Infer city from address string
 * Used when spots don't have explicit city field
 */
export function inferCityFromAddress(address: string): CityConfig | undefined {
    const lowerAddress = address.toLowerCase();

    // Check for exact city name matches
    for (const city of ALL_CITIES) {
        if (lowerAddress.includes(city.name.toLowerCase())) {
            return city;
        }
    }

    // Check for country code matches (fallback)
    const countryMatches: Record<string, string[]> = {
        "seoul": ["korea", "한국", "서울"],
        "tokyo": ["japan", "日本", "東京", "tokyo"],
        "bangkok": ["thailand", "ไทย", "กรุงเทพ"],
        "singapore": ["singapore", "新加坡"],
    };

    for (const [citySlug, patterns] of Object.entries(countryMatches)) {
        if (patterns.some(p => lowerAddress.includes(p))) {
            return getCityBySlug(citySlug);
        }
    }

    return undefined;
}

/**
 * Get coverage status message for a city
 */
export function getCoverageMessage(
    city: CityConfig,
    spotCount: number,
    templateCount: number
): { status: "full" | "expanding" | "new"; message: string } {
    const spotProgress = spotCount / city.targets.spots.min;
    const templateProgress = templateCount / city.targets.templates.min;

    if (spotProgress >= 1 && templateProgress >= 1) {
        return {
            status: "full",
            message: `${spotCount} curated spots in ${city.name}`,
        };
    } else if (spotProgress >= 0.5) {
        return {
            status: "expanding",
            message: `${spotCount} spots and growing in ${city.name}`,
        };
    } else {
        return {
            status: "new",
            message: `Exploring ${city.name} - new city, expanding weekly`,
        };
    }
}

/**
 * Validate city for itinerary generation
 * Supports exact match, slug match, and partial match
 */
export function validateCityForItinerary(input: string): {
    valid: boolean;
    city?: CityConfig;
    error?: string;
} {
    const normalized = input.toLowerCase().trim();

    // Try exact name match
    let city = ENABLED_CITIES.find(c => c.name.toLowerCase() === normalized);

    // Try slug match
    if (!city) {
        city = ENABLED_CITIES.find(c => c.slug === normalized);
    }

    // Try partial match (input contains city name or city name contains input)
    if (!city) {
        city = ENABLED_CITIES.find(c =>
            normalized.includes(c.name.toLowerCase()) ||
            c.name.toLowerCase().includes(normalized)
        );
    }

    if (!city) {
        const suggestions = ENABLED_CITIES.slice(0, 5).map(c => c.name).join(", ");
        return { valid: false, error: `City "${input}" not supported. Try: ${suggestions}...` };
    }

    if (!city.isEnabled) {
        return { valid: false, error: `${city.name} is coming soon!` };
    }

    return { valid: true, city };
}
