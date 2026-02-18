/**
 * Image generation provider router
 *
 * Routes image generation requests to the appropriate provider.
 * Priority: Seedream (FAL AI) first (cheaper), then Gemini as fallback.
 */

import type { SubscriptionTier } from "@/lib/subscription";
import * as gemini from "@/lib/imagen";
import * as seedream from "@/lib/seedream";

export type ImageProvider = "gemini" | "seedream";

/**
 * Determine which image provider to use.
 * Always prefers Seedream (FAL AI) — cheaper and good quality.
 * Falls back to Gemini if Seedream is not available.
 */
export function getImageProvider(tier: SubscriptionTier): ImageProvider {
    // Prefer Seedream (FAL AI) for all tiers — cheaper and good quality
    if (seedream.isSeedreamAvailable()) return "seedream";
    if (gemini.isImagenAvailable()) return "gemini";
    return "gemini"; // Will fail with appropriate error if neither available
}

/**
 * Check if any AI image provider is available
 */
export function isAnyProviderAvailable(): boolean {
    return gemini.isImagenAvailable() || seedream.isSeedreamAvailable();
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

    if (provider === "seedream") {
        return seedream.generateDayBackground(city, dayNumber, theme, activities);
    }
    return gemini.generateDayBackground(city, dayNumber, theme, activities);
}
