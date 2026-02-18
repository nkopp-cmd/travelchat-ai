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
    console.log(`[IMAGE_PROVIDER] Using ${provider} for story background`);

    if (provider === "flux") {
        return flux.generateStoryBackground(city, theme, style);
    }
    if (provider === "seedream") {
        return seedream.generateStoryBackground(city, theme, style);
    }
    return gemini.generateStoryBackground(city, theme, style);
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
    console.log(`[IMAGE_PROVIDER] Using ${provider} for day ${dayNumber} background`);

    if (provider === "flux") {
        return flux.generateDayBackground(city, dayNumber, theme, activities);
    }
    if (provider === "seedream") {
        return seedream.generateDayBackground(city, dayNumber, theme, activities);
    }
    return gemini.generateDayBackground(city, dayNumber, theme, activities);
}
