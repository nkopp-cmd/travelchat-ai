/**
 * Supported cities configuration for Localley
 * These are cities where we have curated local spots and verified data
 */

export interface SupportedCity {
    name: string;
    country: string;
    emoji: string;
    aliases: string[]; // Alternative names/spellings
    comingSoon?: boolean;
}

export const SUPPORTED_CITIES: SupportedCity[] = [
    {
        name: "Seoul",
        country: "South Korea",
        emoji: "🇰🇷",
        aliases: ["서울", "seul", "korea", "south korea"],
    },
    {
        name: "Tokyo",
        country: "Japan",
        emoji: "🇯🇵",
        aliases: ["東京", "とうきょう", "japan"],
    },
    {
        name: "Bangkok",
        country: "Thailand",
        emoji: "🇹🇭",
        aliases: ["กรุงเทพ", "krungthep", "thailand"],
    },
    {
        name: "Singapore",
        country: "Singapore",
        emoji: "🇸🇬",
        aliases: ["新加坡", "singapura"],
    },
];

// Cities coming soon (for display purposes)
export const COMING_SOON_CITIES: SupportedCity[] = [
    {
        name: "Taipei",
        country: "Taiwan",
        emoji: "🇹🇼",
        aliases: ["taipei", "台北"],
        comingSoon: true,
    },
    {
        name: "Osaka",
        country: "Japan",
        emoji: "🇯🇵",
        aliases: ["大阪", "おおさか"],
        comingSoon: true,
    },
    {
        name: "Hong Kong",
        country: "Hong Kong",
        emoji: "🇭🇰",
        aliases: ["香港", "hk"],
        comingSoon: true,
    },
];

/**
 * Check if a city is supported
 * Returns the normalized city name if found, null otherwise
 */
export function isCitySupported(input: string): string | null {
    const normalizedInput = input.toLowerCase().trim();

    for (const city of SUPPORTED_CITIES) {
        // Check exact name match
        if (city.name.toLowerCase() === normalizedInput) {
            return city.name;
        }

        // Check aliases
        for (const alias of city.aliases) {
            if (alias.toLowerCase() === normalizedInput) {
                return city.name;
            }
        }

        // Check if input contains the city name
        if (normalizedInput.includes(city.name.toLowerCase())) {
            return city.name;
        }
    }

    return null;
}

/**
 * Get city info by name
 */
export function getCityInfo(cityName: string): SupportedCity | null {
    const normalizedName = isCitySupported(cityName);
    if (!normalizedName) return null;

    return SUPPORTED_CITIES.find(c => c.name === normalizedName) || null;
}

/**
 * Get list of supported city names
 */
export function getSupportedCityNames(): string[] {
    return SUPPORTED_CITIES.map(c => c.name);
}

/**
 * Get formatted string of supported cities for display
 */
export function getSupportedCitiesDisplay(): string {
    return SUPPORTED_CITIES.map(c => `${c.emoji} ${c.name}`).join(", ");
}

/**
 * Suggest a city based on partial input
 */
export function suggestCity(input: string): SupportedCity | null {
    const normalizedInput = input.toLowerCase().trim();

    // Find best match
    for (const city of SUPPORTED_CITIES) {
        if (city.name.toLowerCase().startsWith(normalizedInput)) {
            return city;
        }
        for (const alias of city.aliases) {
            if (alias.toLowerCase().startsWith(normalizedInput)) {
                return city;
            }
        }
    }

    return null;
}
