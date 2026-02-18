/**
 * AI image model credit costs and tier access configuration
 *
 * Each model costs a different number of credits per image.
 * Higher-tier models produce better quality but cost more credits.
 */

import type { ImageProvider } from "@/lib/image-provider";
import type { SubscriptionTier } from "@/lib/subscription";
import { isFluxAvailable } from "@/lib/flux";
import { isSeedreamAvailable } from "@/lib/seedream";
import { isImagenAvailable } from "@/lib/imagen";

export interface ModelInfo {
    credits: number;
    label: string;
    description: string;
}

export const MODEL_CREDITS: Record<ImageProvider, ModelInfo> = {
    flux: { credits: 1, label: "FLUX", description: "Fast, high-quality" },
    seedream: { credits: 2, label: "Seedream", description: "Rich detail, vivid colors" },
    gemini: { credits: 3, label: "Gemini", description: "Best quality, most realistic" },
};

/** Which models each tier can access */
export const TIER_MODELS: Record<SubscriptionTier, ImageProvider[]> = {
    free: [],
    pro: ["flux"],
    premium: ["flux", "seedream", "gemini"],
};

/** Get models available to a tier (filtered by API key availability) */
export function getAvailableModels(tier: SubscriptionTier): Array<{
    provider: ImageProvider;
    label: string;
    description: string;
    credits: number;
    available: boolean;
    tierLocked: boolean;
}> {
    const tierModels = TIER_MODELS[tier];
    const allProviders: ImageProvider[] = ["flux", "seedream", "gemini"];

    const apiAvailability: Record<ImageProvider, boolean> = {
        flux: isFluxAvailable(),
        seedream: isSeedreamAvailable(),
        gemini: isImagenAvailable(),
    };

    return allProviders.map((provider) => {
        const info = MODEL_CREDITS[provider];
        const hasApiKey = apiAvailability[provider];
        const hasTierAccess = tierModels.includes(provider);

        return {
            provider,
            label: info.label,
            description: info.description,
            credits: info.credits,
            available: hasApiKey && hasTierAccess,
            tierLocked: !hasTierAccess,
        };
    });
}

/** Get credit cost for a provider */
export function getModelCredits(provider: ImageProvider): number {
    return MODEL_CREDITS[provider].credits;
}

/** Check if a tier can use a specific model */
export function canUseTierModel(tier: SubscriptionTier, provider: ImageProvider): boolean {
    return TIER_MODELS[tier].includes(provider);
}
