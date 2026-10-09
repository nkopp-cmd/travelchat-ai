/**
 * Image generation provider router
 *
 * Routes image generation requests to the appropriate provider.
 * One image service for all new generation. Legacy provider names remain only for stored metadata compatibility.
 */

import type { SubscriptionTier } from "@/lib/subscription";
import * as gemini from "@/lib/imagen";
import type * as flux from "@/lib/flux";

export type ImageProvider = "flux" | "seedream" | "gemini";

/**
 * Determine which image provider to use.
 * Priority: FLUX (cheapest) → Seedream → Gemini (fallback).
 */
export function getImageProvider(tier: SubscriptionTier): ImageProvider {
    void tier;
    return "gemini";
}

/**
 * Check if any AI image provider is available
 */
export function isAnyProviderAvailable(): boolean {
    return gemini.isImagenAvailable();
}

/**
 * Generate a story background using the specified provider
 */
export async function generateStoryBackground(
    provider: ImageProvider,
    city: string,
    theme: string,
    style: "vibrant" | "minimal" | "artistic" = "vibrant",
    options?: flux.FluxSubmissionOptions
): Promise<string> {
    console.log(`[IMAGE_PROVIDER] Using ${provider} for story background, city: ${city}`);
    const start = Date.now();

    try {
        void options;
        if (provider !== "gemini") throw new Error("Image option is no longer available");
        const result = await gemini.generateStoryBackground(city, theme, style);
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
    activities: string[],
    options?: flux.FluxSubmissionOptions
): Promise<string> {
    console.log(`[IMAGE_PROVIDER] Using ${provider} for day ${dayNumber} background, city: ${city}`);
    const start = Date.now();

    try {
        void options;
        if (provider !== "gemini") throw new Error("Image option is no longer available");
        const result = await gemini.generateDayBackground(city, dayNumber, theme, activities);
        console.log(`[IMAGE_PROVIDER] ${provider} day ${dayNumber} background succeeded in ${Date.now() - start}ms`);
        return result;
    } catch (error) {
        console.error(`[IMAGE_PROVIDER] ${provider} day ${dayNumber} background FAILED after ${Date.now() - start}ms:`, error instanceof Error ? error.message : error);
        throw error;
    }
}
