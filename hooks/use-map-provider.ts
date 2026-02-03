/**
 * Map Provider Hook
 *
 * Automatically detects the best map provider based on location.
 * Uses Kakao Maps for South Korea (where Google Maps has limited data)
 * and OpenStreetMap for everywhere else.
 */

import { useMemo } from 'react';
import { getCityBySlug, getCityByName, ALL_CITIES } from '@/lib/cities';

export type MapProvider = 'openstreetmap' | 'kakao';

// Korean country code
const KOREAN_COUNTRY_CODE = 'KR';

// Coordinate bounds for South Korea (approximate)
const KOREA_BOUNDS = {
    north: 38.6,
    south: 33.0,
    east: 132.0,
    west: 124.0,
};

/**
 * Check if coordinates are within South Korea bounds
 */
export function isKoreanCoordinates(lat: number, lng: number): boolean {
    return (
        lat >= KOREA_BOUNDS.south &&
        lat <= KOREA_BOUNDS.north &&
        lng >= KOREA_BOUNDS.west &&
        lng <= KOREA_BOUNDS.east
    );
}

/**
 * Check if a city is in South Korea
 */
export function isKoreanCity(cityNameOrSlug: string): boolean {
    if (!cityNameOrSlug) return false;

    const city = getCityBySlug(cityNameOrSlug) || getCityByName(cityNameOrSlug);
    return city?.countryCode === KOREAN_COUNTRY_CODE;
}

/**
 * Get all Korean city slugs
 */
export function getKoreanCitySlugs(): string[] {
    return ALL_CITIES
        .filter(city => city.countryCode === KOREAN_COUNTRY_CODE)
        .map(city => city.slug);
}

interface UseMapProviderOptions {
    /** City name or slug */
    city?: string;
    /** Latitude coordinate */
    lat?: number;
    /** Longitude coordinate */
    lng?: number;
    /** Force a specific provider */
    forceProvider?: MapProvider;
}

interface UseMapProviderResult {
    /** The detected map provider */
    provider: MapProvider;
    /** Whether Kakao Maps SDK needs to be loaded */
    needsKakaoSdk: boolean;
    /** Whether the location is in South Korea */
    isKorea: boolean;
}

/**
 * Hook to determine the appropriate map provider based on location
 *
 * @example
 * ```tsx
 * const { provider, isKorea } = useMapProvider({ city: 'seoul' });
 * // provider = 'kakao', isKorea = true
 *
 * const { provider } = useMapProvider({ city: 'tokyo' });
 * // provider = 'openstreetmap'
 *
 * const { provider } = useMapProvider({ lat: 37.5665, lng: 126.9780 });
 * // provider = 'kakao' (Seoul coordinates)
 * ```
 */
export function useMapProvider(options: UseMapProviderOptions = {}): UseMapProviderResult {
    const { city, lat, lng, forceProvider } = options;

    return useMemo(() => {
        // If forced, use that provider
        if (forceProvider) {
            return {
                provider: forceProvider,
                needsKakaoSdk: forceProvider === 'kakao',
                isKorea: forceProvider === 'kakao',
            };
        }

        // Check by city name first (most reliable)
        // Using OpenStreetMap for Korea - Kakao SDK has domain validation issues
        if (city && isKoreanCity(city)) {
            return {
                provider: 'openstreetmap',
                needsKakaoSdk: false,
                isKorea: true,
            };
        }

        // Check by coordinates as fallback
        if (lat !== undefined && lng !== undefined && isKoreanCoordinates(lat, lng)) {
            return {
                provider: 'openstreetmap',
                needsKakaoSdk: false,
                isKorea: true,
            };
        }

        // Default to OpenStreetMap
        return {
            provider: 'openstreetmap',
            needsKakaoSdk: false,
            isKorea: false,
        };
    }, [city, lat, lng, forceProvider]);
}

/**
 * Get the map tile URL for a given provider
 */
export function getMapTileUrl(provider: MapProvider): string {
    switch (provider) {
        case 'kakao':
            // Kakao uses its own SDK, not tile URLs
            // This is a placeholder - actual rendering uses Kakao SDK
            return '';
        case 'openstreetmap':
        default:
            return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
}

/**
 * Get the attribution text for a map provider
 */
export function getMapAttribution(provider: MapProvider): string {
    switch (provider) {
        case 'kakao':
            return '&copy; <a href="https://map.kakao.com">Kakao Maps</a>';
        case 'openstreetmap':
        default:
            return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }
}

export default useMapProvider;
