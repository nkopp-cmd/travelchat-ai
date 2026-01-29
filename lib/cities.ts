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
