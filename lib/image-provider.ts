/**
 * Image generation provider router
 *
 * Routes image generation requests to the appropriate provider.
 * Priority: FLUX (FAL AI) → Seedream (ARK API) → Gemini
 */

import type { SubscriptionTier } from "@/lib/subscription";
import * as gemini from "@/lib/imagen";
import * as seedream from "@/lib/seedream";
import * as flux from "@/lib/flux";

export type ImageProvider = "flux" | "seedream" | "gemini";

/**
 * Determine which image provider to use.
 * Priority: FLUX (cheapest) → Seedream → Gemini (fallback).
 */
export function getImageProvider(tier: SubscriptionTier): ImageProvider {
    if (flux.isFluxAvailable()) return "flux";
    if (seedream.isSeedreamAvailable()) return "seedream";
    if (gemini.isImagenAvailable()) return "gemini";
    return "gemini"; // Will fail with appropriate error if none available
}

/**
 * Check if any AI image provider is available
 */
export function isAnyProviderAvailable(): boolean {
    return flux.isFluxAvailable() || seedream.isSeedreamAvailable() || gemini.isImagenAvailable();
}

/**
 * Generate a story background using the specified provider
 */
export async function generateStoryBackground(
    provider: ImageProvider,
    city: string,
    theme: string,
    style: "vibrant" | "minimal" | "artistic" = "vibrant"
): Promise<string> {
    console.log(`[IMAGE_PROVIDER] Using ${provider} for story background, city: ${city}`);
    const start = Date.now();

    try {
        let result: string;
        if (provider === "flux") {
            result = await flux.generateStoryBackground(city, theme, style);
        } else if (provider === "seedream") {
            result = await seedream.generateStoryBackground(city, theme, style);
        } else {
            result = await gemini.generateStoryBackground(city, theme, style);
        }
        console.log(`[IMAGE_PROVIDER] ${provider} story background succeeded in ${Date.now() - start}ms`);
        return result;
    } catch (error) {
        console.error(`[IMAGE_PROVIDER] ${provider} story background FAILED after ${Date.now() - start}ms:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

/**
 * Generate a day-specific background using the specified provider
 */
export async function generateDayBackground(
    provider: ImageProvider,
    city: string,
    dayNumber: number,
    theme: string,
    activities: string[]
): Promise<string> {
    console.log(`[IMAGE_PROVIDER] Using ${provider} for day ${dayNumber} background, city: ${city}`);
    const start = Date.now();

    try {
        let result: string;
        if (provider === "flux") {
            result = await flux.generateDayBackground(city, dayNumber, theme, activities);
        } else if (provider === "seedream") {
            result = await seedream.generateDayBackground(city, dayNumber, theme, activities);
        } else {
            result = await gemini.generateDayBackground(city, dayNumber, theme, activities);
        }
        console.log(`[IMAGE_PROVIDER] ${provider} day ${dayNumber} background succeeded in ${Date.now() - start}ms`);
        return result;
    } catch (error) {
        console.error(`[IMAGE_PROVIDER] ${provider} day ${dayNumber} background FAILED after ${Date.now() - start}ms:`, error instanceof Error ? error.message : error);
        throw error;
    }
}
