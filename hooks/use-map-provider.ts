/**
 * Map Provider Hook
 *
 * Automatically detects the best map provider based on location and subscription tier.
 * - Free: OpenStreetMap (Leaflet) for all cities
 * - Pro/Premium: Google Maps for non-Korean cities, Kakao Maps for Korean cities
 */

import { useMemo } from 'react';
import { getCityBySlug, getCityByName, ALL_CITIES } from '@/lib/cities';
import type { SubscriptionTier } from '@/lib/subscription';

export type MapProvider = 'openstreetmap' | 'kakao' | 'google';

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

/**
 * Check if user has a paid tier (pro or premium)
 */
function isPaidTier(tier?: SubscriptionTier): boolean {
    return tier === 'pro' || tier === 'premium';
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
    /** User subscription tier — determines whether premium maps are available */
    userTier?: SubscriptionTier;
}

interface UseMapProviderResult {
    /** The detected map provider */
    provider: MapProvider;
    /** Whether Kakao Maps SDK needs to be loaded */
    needsKakaoSdk: boolean;
    /** Whether Google Maps SDK needs to be loaded */
    needsGoogleSdk: boolean;
    /** Whether the location is in South Korea */
    isKorea: boolean;
}

/**
 * Hook to determine the appropriate map provider based on location and tier
 *
 * @example
 * ```tsx
 * const { provider, isKorea } = useMapProvider({ city: 'seoul', userTier: 'pro' });
 * // provider = 'kakao', isKorea = true
 *
 * const { provider } = useMapProvider({ city: 'tokyo', userTier: 'pro' });
 * // provider = 'google'
 *
 * const { provider } = useMapProvider({ city: 'tokyo', userTier: 'free' });
 * // provider = 'openstreetmap'
 * ```
 */
export function useMapProvider(options: UseMapProviderOptions = {}): UseMapProviderResult {
    const { city, lat, lng, forceProvider, userTier } = options;

    return useMemo(() => {
        // If forced, use that provider
        if (forceProvider) {
            return {
                provider: forceProvider,
                needsKakaoSdk: forceProvider === 'kakao',
                needsGoogleSdk: forceProvider === 'google',
                isKorea: forceProvider === 'kakao',
            };
        }

        // Detect if location is in Korea
        const kakaoEnabled = process.env.NEXT_PUBLIC_KAKAO_MAPS_APP_KEY &&
            process.env.NEXT_PUBLIC_KAKAO_MAPS_ENABLED !== 'false';

        const isKorea = (city && isKoreanCity(city)) ||
            (lat !== undefined && lng !== undefined && isKoreanCoordinates(lat, lng));

        // Paid tiers get premium map providers
        if (isPaidTier(userTier)) {
            // Korean cities: use Kakao Maps (better data coverage in Korea)
            if (isKorea && kakaoEnabled) {
                return {
                    provider: 'kakao',
                    needsKakaoSdk: true,
                    needsGoogleSdk: false,
                    isKorea: true,
                };
            }

            // Non-Korean cities: use Google Maps
            const googleEnabled = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
            if (googleEnabled) {
                return {
                    provider: 'google',
                    needsKakaoSdk: false,
                    needsGoogleSdk: true,
                    isKorea: false,
                };
            }
        }

        // Free tier (or no Google key): always OpenStreetMap
        return {
            provider: 'openstreetmap',
            needsKakaoSdk: false,
            needsGoogleSdk: false,
            isKorea: !!isKorea,
        };
    }, [city, lat, lng, forceProvider, userTier]);
}

/**
 * Get the map tile URL for a given provider
 */
export function getMapTileUrl(provider: MapProvider): string {
    switch (provider) {
        case 'kakao':
        case 'google':
            // These use their own SDKs, not tile URLs
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
        case 'google':
            return '&copy; Google Maps';
        case 'openstreetmap':
        default:
            return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }
}

export default useMapProvider;
