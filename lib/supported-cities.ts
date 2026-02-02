/**
 * @deprecated Use lib/cities.ts instead
 * This file is kept for backward compatibility only.
 * All new code should import from lib/cities.ts
 */

import { ENABLED_CITIES, validateCityForItinerary, CityConfig } from './cities';

/**
 * @deprecated Use CityConfig from lib/cities instead
 */
export interface SupportedCity {
    name: string;
    country: string;
    emoji: string;
    aliases: string[];
    comingSoon?: boolean;
}

/**
 * @deprecated Use ENABLED_CITIES from lib/cities instead
 * Only kept for backward compatibility
 */
export const SUPPORTED_CITIES: SupportedCity[] = ENABLED_CITIES.map(c => ({
    name: c.name,
    country: c.country,
    emoji: c.emoji,
    aliases: [], // Aliases were only used in the old system
}));

/**
 * @deprecated Use ENABLED_CITIES from lib/cities instead
 */
export const COMING_SOON_CITIES: SupportedCity[] = [];

/**
 * @deprecated Use validateCityForItinerary from lib/cities instead
 * Check if a city is supported.
 * Returns the normalized city name if found, null otherwise.
 */
export function isCitySupported(input: string): string | null {
    const result = validateCityForItinerary(input);
    return result.valid ? result.city!.name : null;
}

/**
 * @deprecated Use getCityByName from lib/cities instead
 */
export function getCityInfo(cityName: string): SupportedCity | null {
    const normalizedName = isCitySupported(cityName);
    if (!normalizedName) return null;

    return SUPPORTED_CITIES.find(c => c.name === normalizedName) || null;
}

/**
 * @deprecated Use ENABLED_CITIES.map(c => c.name) from lib/cities instead
 */
export function getSupportedCityNames(): string[] {
    return ENABLED_CITIES.map(c => c.name);
}

/**
 * @deprecated Use ENABLED_CITIES from lib/cities instead
 */
export function getSupportedCitiesDisplay(): string {
    return ENABLED_CITIES.map(c => `${c.emoji} ${c.name}`).join(", ");
}

/**
 * @deprecated Use validateCityForItinerary from lib/cities instead
 */
export function suggestCity(input: string): SupportedCity | null {
    const result = validateCityForItinerary(input);
    if (!result.valid || !result.city) return null;

    return {
        name: result.city.name,
        country: result.city.country,
        emoji: result.city.emoji,
        aliases: [],
    };
}
