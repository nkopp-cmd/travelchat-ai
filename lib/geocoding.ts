/**
 * Multi-Provider Geocoding System
 *
 * Cascade order:
 * 1. Kakao Local REST API (Korean cities only) — no domain restrictions
 * 2. Nominatim (OpenStreetMap) with simplified query
 * 3. Google Geocoding API (last resort, server-side only)
 *
 * Features bilingual query support: translates English place names to local
 * language (Korean, Japanese, Thai, etc.) for much better geocoding hit rates.
 *
 * Stores lat/lng on each activity at generation time so maps load instantly.
 */

import { getCityBySlug, getCityByName, type CityConfig } from '@/lib/cities';
import type { Activity, DailyPlan } from '@/lib/llm/types';
import OpenAI from 'openai';

// ============================================================================
// Types
// ============================================================================

export interface GeocodingResult {
    lat: number;
    lng: number;
    provider: 'kakao' | 'nominatim' | 'google';
}

export interface BatchGeocodingItem {
    address: string;
    city: string;
    name: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a city is in South Korea
 */
export function isKoreanCity(cityNameOrSlug: string): boolean {
    if (!cityNameOrSlug) return false;
    const city = getCityBySlug(cityNameOrSlug.toLowerCase().replace(/\s+/g, '-')) || getCityByName(cityNameOrSlug);
    return city?.countryCode === 'KR';
}

/**
 * Simplify an address for better Nominatim results.
 * Strips street numbers, lane details, floor/unit numbers — keeps place name + district + city.
 */
export function simplifyAddress(address: string, city: string): string {
    let simplified = address;

    // Remove leading "No. X", "Lane X", "Section X", "Alley X" (common in Taipei addresses)
    simplified = simplified.replace(/^No\.\s*\d+,?\s*/i, '');
    simplified = simplified.replace(/Lane\s*\d+,?\s*/gi, '');
    simplified = simplified.replace(/Section\s*\d+,?\s*/gi, '');
    simplified = simplified.replace(/Alley\s*\d+,?\s*/gi, '');

    // Remove floor/unit/suite numbers
    simplified = simplified.replace(/\b\d+[FfBb]?\s*(Floor|Fl|층)\b/gi, '');
    simplified = simplified.replace(/\bUnit\s*\d+\b/gi, '');
    simplified = simplified.replace(/\bSuite\s*\d+\b/gi, '');

    // Remove building numbers at start of address
    simplified = simplified.replace(/^\d+[-–]\d+\s*/, '');
    simplified = simplified.replace(/^\d+\s+/, '');

    // Remove Korean detailed address components (동/리/번지)
    simplified = simplified.replace(/\d+번지/g, '');
    simplified = simplified.replace(/\d+[-–]\d+번?\s*/g, '');

    // Clean up multiple commas and spaces
    simplified = simplified.replace(/,\s*,/g, ',');
    simplified = simplified.replace(/,\s*$/, '');
    simplified = simplified.replace(/^\s*,\s*/, '');
    simplified = simplified.replace(/\s+/g, ' ').trim();

    // If the simplified result is too short, fall back to original
    if (simplified.length < 3) {
        return address;
    }

    return simplified;
}

/**
 * Resolve a CityConfig from a city name or slug
 */
function resolveCityConfig(city: string): CityConfig | undefined {
    return getCityBySlug(city.toLowerCase().replace(/\s+/g, '-')) || getCityByName(city);
}

// ============================================================================
// Bilingual Translation for Geocoding
// ============================================================================

/**
 * Language code to full name mapping for translation prompts
 */
const LANGUAGE_NAMES: Record<string, string> = {
    ko: 'Korean',
    ja: 'Japanese',
    th: 'Thai',
    zh: 'Chinese',
    vi: 'Vietnamese',
    ms: 'Malay',
    id: 'Indonesian',
};

/**
 * In-memory cache for translations (persists across requests in serverless warm starts)
 * Key: "en>ko:Gwangjang Market" → "광장시장"
 */
const translationCache = new Map<string, string | null>();

/**
 * Get OpenAI client for translation (reuses the app's existing key)
 */
function getTranslationClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
}

/**
 * Translate a place name / address to the local language for better geocoding.
 * Uses GPT-4o-mini for fast, cheap translations.
 *
 * Examples:
 *   translateForGeocoding("Gwangjang Market", "ko") → "광장시장"
 *   translateForGeocoding("Shibuya Crossing", "ja") → "渋谷スクランブル交差点"
 *   translateForGeocoding("Chatuchak Weekend Market", "th") → "ตลาดนัดจตุจักร"
 */
async function translateForGeocoding(
    query: string,
    targetLang: string
): Promise<string | null> {
    // Skip if target is English or query already contains non-ASCII (likely already in local script)
    if (targetLang === 'en') return null;
    if (/[^\x00-\x7F]/.test(query)) return null; // Already has non-Latin characters

    const langName = LANGUAGE_NAMES[targetLang];
    if (!langName) return null;

    const cacheKey = `en>${targetLang}:${query}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey) || null;
    }

    const client = getTranslationClient();
    if (!client) return null;

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a translator for map/geocoding queries. Translate the given place name or address to ${langName}. Return ONLY the translated text, nothing else. If the place name is a proper noun that is commonly known in ${langName}, use the well-known ${langName} name. If you're not sure about the translation, return the original text.`,
                },
                { role: 'user', content: query },
            ],
            temperature: 0,
            max_tokens: 100,
        });

        const translated = response.choices[0]?.message?.content?.trim();
        if (translated && translated !== query) {
            translationCache.set(cacheKey, translated);
            return translated;
        }

        translationCache.set(cacheKey, null);
        return null;
    } catch (error) {
        console.error(`[geocoding] Translation error (${targetLang}):`, error);
        translationCache.set(cacheKey, null);
        return null;
    }
}

/**
 * Get the primary local language for a city (first non-English language)
 */
function getCityLocalLanguage(city: string): string | null {
    const cityConfig = resolveCityConfig(city);
    if (!cityConfig) return null;

    // Return the first non-English language
    const localLang = cityConfig.languages.find(lang => lang !== 'en');
    return localLang || null;
}

// ============================================================================
// Provider: Kakao Local REST API (Korea only)
// ============================================================================

async function geocodeWithKakao(query: string): Promise<GeocodingResult | null> {
    const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`;
        const response = await fetch(url, {
            headers: { Authorization: `KakaoAK ${apiKey}` },
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.documents && data.documents.length > 0) {
            const doc = data.documents[0];
            return {
                lat: parseFloat(doc.y),
                lng: parseFloat(doc.x),
                provider: 'kakao',
            };
        }
        return null;
    } catch (error) {
        console.error('[geocoding] Kakao error:', error);
        return null;
    }
}

// ============================================================================
// Provider: Nominatim (OpenStreetMap)
// ============================================================================

async function geocodeWithNominatim(query: string): Promise<GeocodingResult | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Localley Travel App (https://localley.ai)',
            },
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                provider: 'nominatim',
            };
        }
        return null;
    } catch (error) {
        console.error('[geocoding] Nominatim error:', error);
        return null;
    }
}

// ============================================================================
// Provider: Google Geocoding API
// ============================================================================

async function geocodeWithGoogle(query: string): Promise<GeocodingResult | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.status === 'OK' && data.results?.length > 0) {
            const loc = data.results[0].geometry.location;
            return {
                lat: loc.lat,
                lng: loc.lng,
                provider: 'google',
            };
        }
        return null;
    } catch (error) {
        console.error('[geocoding] Google error:', error);
        return null;
    }
}

// ============================================================================
// Cascade Geocoder
// ============================================================================

/**
 * Geocode an address using a multi-provider cascade with bilingual support.
 * Translates English queries to the local language for each city for better hit rates.
 * Tries providers in order: Kakao (Korea) → Nominatim → Google
 */
export async function geocodeWithCascade(
    address: string,
    city: string,
    placeName?: string
): Promise<GeocodingResult | null> {
    const isKorea = isKoreanCity(city);
    const cityConfig = resolveCityConfig(city);
    const localLang = getCityLocalLanguage(city);

    // Build query variants (English)
    const simplifiedAddress = simplifyAddress(address, city);
    const nameAndCity = placeName ? `${placeName}, ${city}` : null;

    // Pre-translate to local language for better geocoding
    // This runs once and caches — Kakao especially works much better with Korean text
    let translatedName: string | null = null;
    let translatedAddress: string | null = null;
    if (localLang) {
        // Translate place name and address in parallel
        const [tName, tAddr] = await Promise.all([
            placeName ? translateForGeocoding(placeName, localLang) : Promise.resolve(null),
            translateForGeocoding(simplifiedAddress, localLang),
        ]);
        translatedName = tName;
        translatedAddress = tAddr;
    }

    // 1. Kakao (Korea only)
    if (isKorea) {
        // Try translated name first (best for Kakao keyword search)
        if (translatedName) {
            let result = await geocodeWithKakao(translatedName);
            if (result) return result;
        }

        // Try translated address
        if (translatedAddress) {
            let result = await geocodeWithKakao(translatedAddress);
            if (result) return result;
        }

        // Try English address fallbacks
        let result = await geocodeWithKakao(address);
        if (result) return result;

        if (simplifiedAddress !== address) {
            result = await geocodeWithKakao(simplifiedAddress);
            if (result) return result;
        }

        if (nameAndCity) {
            result = await geocodeWithKakao(nameAndCity);
            if (result) return result;
        }

        if (placeName) {
            result = await geocodeWithKakao(placeName);
            if (result) return result;
        }
    }

    // 2. Nominatim with translated query first, then English
    // Nominatim works better with local-language queries for Asian cities
    if (translatedName) {
        const result = await geocodeWithNominatim(`${translatedName} ${city}`);
        if (result) return result;
    }

    const nominatimQuery = nameAndCity || `${simplifiedAddress}, ${city}`;
    let result = await geocodeWithNominatim(nominatimQuery);
    if (result) return result;

    if (nameAndCity && nominatimQuery !== nameAndCity) {
        result = await geocodeWithNominatim(nameAndCity);
        if (result) return result;
    }

    // 3. Google as last resort (handles both languages well natively)
    const googleQuery = nameAndCity || `${address}, ${city}`;
    result = await geocodeWithGoogle(googleQuery);
    if (result) return result;

    // Try translated query with Google
    if (translatedName) {
        result = await geocodeWithGoogle(`${translatedName} ${city}`);
        if (result) return result;
    }

    if (nameAndCity) {
        result = await geocodeWithGoogle(`${placeName} ${city}`);
        if (result) return result;
    }

    return null;
}

// ============================================================================
// Batch Geocoding
// ============================================================================

/**
 * Geocode multiple items with per-provider rate limiting.
 */
export async function batchGeocode(
    items: BatchGeocodingItem[]
): Promise<(GeocodingResult | null)[]> {
    const results: (GeocodingResult | null)[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Rate limit: small delay between requests to be respectful
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const result = await geocodeWithCascade(item.address, item.city, item.name);
        results.push(result);
    }

    return results;
}

// ============================================================================
// Itinerary Geocoding
// ============================================================================

/**
 * Geocode all activities in an itinerary's daily plans.
 * Populates lat/lng on each activity in-place and returns the updated plans.
 */
export async function geocodeItineraryActivities(
    dailyPlans: DailyPlan[],
    city: string
): Promise<DailyPlan[]> {
    const startTime = Date.now();
    let geocoded = 0;
    let failed = 0;

    for (const dayPlan of dailyPlans) {
        for (const activity of dayPlan.activities) {
            // Skip if already geocoded
            if (activity.lat && activity.lng) {
                geocoded++;
                continue;
            }

            try {
                const result = await geocodeWithCascade(
                    activity.address,
                    city,
                    activity.name
                );

                if (result) {
                    activity.lat = result.lat;
                    activity.lng = result.lng;
                    geocoded++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`[geocoding] Failed for "${activity.name}":`, error);
                failed++;
            }

            // Small delay between geocoding calls
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    const duration = Date.now() - startTime;
    console.log(
        `[geocoding] Itinerary geocoding complete: ${geocoded} success, ${failed} failed, ${duration}ms`
    );

    return dailyPlans;
}
