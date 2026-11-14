/**
 * Story background options per tier.
 *
 * The only option is the pre-generated painted library (lib/image-library.ts). It costs no credit, because no paid
 * image API is ever called (Nils 2026-11-14, APPROVALS.md). Free tier keeps the branded gradient.
 */

import type { SubscriptionTier } from "@/lib/subscription";

export type ImageProvider = "library";

export interface ModelInfo {
    credits: number;
    label: string;
    description: string;
}

export const MODEL_CREDITS: Record<ImageProvider, ModelInfo> = {
    library: { credits: 0, label: "Painted backgrounds", description: "Illustrated city backgrounds" },
};

/** Which options each tier can use */
export const TIER_MODELS: Record<SubscriptionTier, ImageProvider[]> = {
    free: [],
    pro: ["library"],
    premium: ["library"],
};

/** Options for a tier. The library needs no API key, so availability is the tier gate alone. */
export function getAvailableModels(tier: SubscriptionTier): Array<{
    provider: ImageProvider;
    label: string;
    description: string;
    credits: number;
    available: boolean;
    tierLocked: boolean;
}> {
    const bypassTierCheck = process.env.BYPASS_IMAGE_TIER_CHECK === "true";
    const tierModels = bypassTierCheck ? (["library"] as ImageProvider[]) : TIER_MODELS[tier];
    return (["library"] as ImageProvider[]).map((provider) => {
        const info = MODEL_CREDITS[provider];
        const hasTierAccess = tierModels.includes(provider);
        return {
            provider,
            label: info.label,
            description: info.description,
            credits: info.credits,
            available: hasTierAccess,
            tierLocked: !hasTierAccess && !bypassTierCheck,
        };
    });
}

/** Credit cost for an option (always 0: library images are free) */
export function getModelCredits(provider: ImageProvider): number {
    return MODEL_CREDITS[provider]?.credits ?? 0;
}

/** Check if a tier can use an option */
export function canUseTierModel(tier: SubscriptionTier, provider: string): boolean {
    if (provider !== "library") return false;
    if (process.env.BYPASS_IMAGE_TIER_CHECK === "true") return true;
    return TIER_MODELS[tier].includes(provider);
}
