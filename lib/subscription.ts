/**
 * Subscription tier system for Localley
 *
 * Tiers:
 * - FREE: Basic features, limited usage
 * - PRO: Enhanced features, extended limits ($9/mo)
 * - PREMIUM: Full access, unlimited usage ($19/mo)
 */

export type SubscriptionTier = "free" | "pro" | "premium";

export interface SubscriptionLimits {
    itinerariesPerMonth: number;
    chatMessagesPerDay: number;
    storiesPerWeek: number;
    aiImagesPerMonth: number;
    savedSpotsLimit: number;
}

export interface SubscriptionFeatures {
    // Content access
    activityImages: "placeholder" | "ai-generated" | "hd";
    addressDisplay: "area-only" | "full" | "full-with-map";
    bookingLinks: boolean;
    bookingDeals: boolean;

    // Export features
    pdfExport: "watermarked" | "clean" | "branded";
    emailExport: boolean;

    // AI features
    aiBackgrounds: boolean;
    imageProvider: "none" | "seedream" | "gemini";
    smartScheduling: boolean;
    weatherIntegration: boolean;

    // Social features
    collaborativeTrips: boolean;
    prioritySupport: boolean;

    // Ads
    showAds: boolean;
}

export interface TierConfig {
    tier: SubscriptionTier;
    name: string;
    price: number; // monthly in USD
    yearlyPrice: number;
    limits: SubscriptionLimits;
    features: SubscriptionFeatures;
}

// Tier configurations
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
    free: {
        tier: "free",
        name: "Free",
        price: 0,
        yearlyPrice: 0,
        limits: {
            itinerariesPerMonth: 3,
            chatMessagesPerDay: 10,
            storiesPerWeek: 1,
            aiImagesPerMonth: 0,
            savedSpotsLimit: 10,
        },
        features: {
            activityImages: "placeholder",
            addressDisplay: "area-only",
            bookingLinks: true, // Everyone gets booking links (we earn affiliate!)
            bookingDeals: false,
            pdfExport: "watermarked",
            emailExport: false,
            aiBackgrounds: false,
            imageProvider: "none",
            smartScheduling: false,
            weatherIntegration: false,
            collaborativeTrips: false,
            prioritySupport: false,
            showAds: true,
        },
    },
    pro: {
        tier: "pro",
        name: "Pro",
        price: 9,
        yearlyPrice: 79,
        limits: {
            itinerariesPerMonth: 999, // Essentially unlimited
            chatMessagesPerDay: 100,
            storiesPerWeek: 999,
            aiImagesPerMonth: 50,
            savedSpotsLimit: 100,
        },
        features: {
            activityImages: "ai-generated",
            addressDisplay: "full",
            bookingLinks: true,
            bookingDeals: true,
            pdfExport: "clean",
            emailExport: true,
            aiBackgrounds: true,
            imageProvider: "seedream",
            smartScheduling: false,
            weatherIntegration: true,
            collaborativeTrips: false,
            prioritySupport: false,
            showAds: false,
        },
    },
    premium: {
        tier: "premium",
        name: "Premium",
        price: 19,
        yearlyPrice: 159,
        limits: {
            itinerariesPerMonth: 999,
            chatMessagesPerDay: 999,
            storiesPerWeek: 999,
            aiImagesPerMonth: 200,
            savedSpotsLimit: 999,
        },
        features: {
            activityImages: "hd",
            addressDisplay: "full-with-map",
            bookingLinks: true,
            bookingDeals: true,
            pdfExport: "branded",
            emailExport: true,
            aiBackgrounds: true,
            imageProvider: "gemini",
            smartScheduling: true,
            weatherIntegration: true,
            collaborativeTrips: true,
            prioritySupport: true,
            showAds: false,
        },
    },
};

/**
 * Get tier configuration
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
    return TIER_CONFIGS[tier];
}

/**
 * Check if a feature is available for a tier
 */
export function hasFeature<K extends keyof SubscriptionFeatures>(
    tier: SubscriptionTier,
    feature: K
): SubscriptionFeatures[K] {
    return TIER_CONFIGS[tier].features[feature];
}

/**
 * Check if user is within their usage limit
 */
export function isWithinLimit(
    tier: SubscriptionTier,
    limitType: keyof SubscriptionLimits,
    currentUsage: number
): boolean {
    const limit = TIER_CONFIGS[tier].limits[limitType];
    return currentUsage < limit;
}

/**
 * Get remaining usage for a limit
 */
export function getRemainingUsage(
    tier: SubscriptionTier,
    limitType: keyof SubscriptionLimits,
    currentUsage: number
): number {
    const limit = TIER_CONFIGS[tier].limits[limitType];
    return Math.max(0, limit - currentUsage);
}

/**
 * Check if tier can access a specific image quality
 */
export function canAccessImageQuality(
    tier: SubscriptionTier,
    quality: "placeholder" | "ai-generated" | "hd"
): boolean {
    const tierQuality = TIER_CONFIGS[tier].features.activityImages;
    const qualityLevels = ["placeholder", "ai-generated", "hd"];
    return qualityLevels.indexOf(tierQuality) >= qualityLevels.indexOf(quality);
}

/**
 * Check if tier can see full address
 */
export function canSeeFullAddress(tier: SubscriptionTier): boolean {
    const addressDisplay = TIER_CONFIGS[tier].features.addressDisplay;
    return addressDisplay === "full" || addressDisplay === "full-with-map";
}

/**
 * Check if tier can see map pins
 */
export function canSeeMapPins(tier: SubscriptionTier): boolean {
    return TIER_CONFIGS[tier].features.addressDisplay === "full-with-map";
}

/**
 * Get upgrade prompt message based on what feature user tried to access
 */
export function getUpgradePrompt(feature: keyof SubscriptionFeatures): {
    title: string;
    description: string;
    suggestedTier: SubscriptionTier;
} {
    const prompts: Record<keyof SubscriptionFeatures, { title: string; description: string; suggestedTier: SubscriptionTier }> = {
        activityImages: {
            title: "Unlock AI-Generated Images",
            description: "See beautiful AI-generated photos of every activity and spot",
            suggestedTier: "pro",
        },
        addressDisplay: {
            title: "Get Full Addresses",
            description: "See exact addresses and directions to every location",
            suggestedTier: "pro",
        },
        bookingLinks: {
            title: "Book Activities",
            description: "Book tours and activities directly from your itinerary",
            suggestedTier: "free", // Everyone has this
        },
        bookingDeals: {
            title: "Exclusive Deals",
            description: "Access special discounts on tours and hotels",
            suggestedTier: "pro",
        },
        pdfExport: {
            title: "Clean PDF Export",
            description: "Download professional PDFs without watermarks",
            suggestedTier: "pro",
        },
        emailExport: {
            title: "Email Itineraries",
            description: "Send your itinerary directly to your inbox",
            suggestedTier: "pro",
        },
        aiBackgrounds: {
            title: "AI Story Backgrounds",
            description: "Generate stunning AI backgrounds for your travel stories",
            suggestedTier: "pro",
        },
        smartScheduling: {
            title: "Smart Scheduling",
            description: "AI-optimized activity order based on location and time",
            suggestedTier: "premium",
        },
        weatherIntegration: {
            title: "Weather Forecast",
            description: "See weather predictions for your trip dates",
            suggestedTier: "pro",
        },
        collaborativeTrips: {
            title: "Plan Together",
            description: "Invite friends to collaborate on your itinerary",
            suggestedTier: "premium",
        },
        prioritySupport: {
            title: "Priority Support",
            description: "Get faster responses from our support team",
            suggestedTier: "premium",
        },
        showAds: {
            title: "Ad-Free Experience",
            description: "Enjoy Localley without any advertisements",
            suggestedTier: "pro",
        },
        imageProvider: {
            title: "AI Image Generation",
            description: "Generate beautiful AI images for your travel stories",
            suggestedTier: "pro",
        },
    };

    return prompts[feature];
}

/**
 * Compare two tiers
 * Returns positive if tier1 > tier2, negative if tier1 < tier2, 0 if equal
 */
export function compareTiers(tier1: SubscriptionTier, tier2: SubscriptionTier): number {
    const tierOrder: SubscriptionTier[] = ["free", "pro", "premium"];
    return tierOrder.indexOf(tier1) - tierOrder.indexOf(tier2);
}

/**
 * Check if user needs to upgrade for a feature
 */
export function needsUpgrade(
    currentTier: SubscriptionTier,
    requiredTier: SubscriptionTier
): boolean {
    return compareTiers(currentTier, requiredTier) < 0;
}
