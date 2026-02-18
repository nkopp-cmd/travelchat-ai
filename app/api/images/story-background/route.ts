import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isImagenAvailable } from "@/lib/imagen";
import { isSeedreamAvailable } from "@/lib/seedream";
import {
    getImageProvider,
    isAnyProviderAvailable,
    generateStoryBackground,
    generateDayBackground,
} from "@/lib/image-provider";

// AI image generation can take 10-20s per image
export const maxDuration = 60;
import {
    getStoryBackground,
    getPexelsCityImage,
    getPexelsThemedImage,
    getTripAdvisorThemedImage,
    getUnsplashCityImage,
    getUnsplashThemedImage,
    isPexelsAvailable,
    isTripAdvisorAvailable,
} from "@/lib/story-backgrounds";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier, checkAndIncrementUsage } from "@/lib/usage-tracking";
import { hasFeature } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";

// Rate limit: 20 story backgrounds per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
});

type BackgroundType = "cover" | "day" | "summary";

interface StoryBackgroundRequest {
    type: BackgroundType;
    city: string;
    theme?: string;
    dayNumber?: number;
    activities?: string[];
    // Whether to prefer AI generation (requires Pro/Premium)
    preferAI?: boolean;
    // Cache key for storing/retrieving from storage
    cacheKey?: string;
    // URLs to exclude (for duplicate prevention across slides)
    excludeUrls?: string[];
}

export async function POST(req: NextRequest) {
    try {
        // Check rate limit
        const rateLimitResponse = await limiter(req);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const body: StoryBackgroundRequest = await req.json();
        const { type, city, theme, dayNumber, activities, preferAI = true, cacheKey, excludeUrls = [] } = body;

        if (!city) {
            return Errors.validationError("city is required");
        }

        // Check if user can use AI images
        // Priority: Seedream (FAL AI) → Gemini → TripAdvisor → Pexels → Unsplash
        const tier = await getUserTier(userId);
        let canUseAI = preferAI && isAnyProviderAvailable() && hasFeature(tier, 'aiBackgrounds');

        // Check AI usage quota before attempting generation (graceful degradation)
        if (canUseAI) {
            const { allowed, usage } = await checkAndIncrementUsage(userId, "ai_images_generated");
            if (!allowed) {
                console.log("[STORY_BG] AI quota exceeded, falling through to non-AI sources", {
                    current: usage.currentUsage,
                    limit: usage.limit,
                });
                canUseAI = false;
            }
        }

        const imageProvider = canUseAI ? getImageProvider(tier) : null;

        console.log("[STORY_BG] Request:", {
            type,
            city,
            theme,
            dayNumber,
            preferAI,
            canUseAI,
            imageProvider,
            tier,
            hasGeminiKey: isImagenAvailable(),
            hasSeedreamKey: isSeedreamAvailable(),
            hasTripAdvisorKey: isTripAdvisorAvailable(),
            hasPexelsKey: isPexelsAvailable(),
        });

        // Generate a storage key for this background
        const storageKey = cacheKey
            ? `story-backgrounds/${cacheKey}.png`
            : `story-backgrounds/${userId}/${type}${dayNumber ? `-day${dayNumber}` : ''}-${Date.now()}.png`;

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = createSupabaseAdmin();
            const { data: cached } = await supabase.storage
                .from("generated-images")
                .list("story-backgrounds", { search: `${cacheKey}.png` });

            if (cached && cached.length > 0) {
                const { data: urlData } = supabase.storage
                    .from("generated-images")
                    .getPublicUrl(`story-backgrounds/${cacheKey}.png`);

                if (urlData?.publicUrl) {
                    console.log("[STORY_BG] Returning cached image URL");
                    return NextResponse.json({
                        success: true,
                        image: urlData.publicUrl,
                        source: "cache",
                        cached: true,
                    });
                }
            }
        }

        let imageUrl: string | null = null;
        let source: "ai" | "tripadvisor" | "pexels" | "unsplash" = "unsplash";

        // Try AI generation if allowed
        if (canUseAI && imageProvider) {
            try {
                console.log(`[STORY_BG] Attempting AI generation with ${imageProvider}...`);
                let aiImage: string | null = null;

                if (type === "day" && dayNumber) {
                    aiImage = await generateDayBackground(
                        imageProvider,
                        city,
                        dayNumber,
                        theme || `Day ${dayNumber} adventures`,
                        activities || []
                    );
                } else {
                    const bgTheme = type === "cover"
                        ? "iconic landmarks and cityscape"
                        : type === "summary"
                            ? "beautiful travel scenery"
                            : theme || "travel destination";

                    aiImage = await generateStoryBackground(imageProvider, city, bgTheme, "vibrant");
                }

                if (aiImage) {
                    source = "ai";
                    console.log("[STORY_BG] AI generation successful, uploading to storage...");

                    // Upload AI images to Supabase Storage and return URL
                    // Uses admin client to bypass RLS (route already authenticates via auth())
                    const supabase = createSupabaseAdmin();
                    // Strip data URL prefix if present (safety net for API format changes)
                    const cleanBase64 = aiImage.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(cleanBase64, "base64");
                    const { error: uploadError } = await supabase.storage
                        .from("generated-images")
                        .upload(storageKey, buffer, {
                            contentType: "image/png",
                            upsert: true,
                        });

                    if (!uploadError) {
                        const { data: urlData } = supabase.storage
                            .from("generated-images")
                            .getPublicUrl(storageKey);

                        if (urlData?.publicUrl) {
                            imageUrl = urlData.publicUrl;
                            console.log("[STORY_BG] AI image stored, URL:", imageUrl);
                        }
                    } else {
                        console.error("[STORY_BG] Storage upload failed:", {
                            message: uploadError.message,
                            name: uploadError.name,
                            storageKey,
                            bufferSize: buffer.length,
                            bucket: "generated-images",
                        });
                        // Fall through to stock photo providers
                    }
                }
            } catch (error) {
                console.error("[STORY_BG] AI generation failed:", error);
            }
        }

        // Fall back to TripAdvisor for real location photos (paid tiers only)
        if (!imageUrl && tier !== "free" && isTripAdvisorAvailable()) {
            console.log("[STORY_BG] Trying TripAdvisor...");
            const searchTheme = theme || (type === "cover" ? "landmark" : type === "summary" ? "scenery" : "travel");

            imageUrl = await getTripAdvisorThemedImage(city, searchTheme, excludeUrls);
            if (imageUrl) {
                source = "tripadvisor";
                console.log("[STORY_BG] TripAdvisor image found:", imageUrl.substring(0, 80));
            } else {
                console.log("[STORY_BG] TripAdvisor returned no image for:", { city, searchTheme });
            }
        } else if (!imageUrl) {
            console.log("[STORY_BG] Skipping TripAdvisor:", tier === "free" ? "(free tier)" : "(key not available)");
        }

        // Fall back to Pexels if TripAdvisor not available or failed
        if (!imageUrl && isPexelsAvailable()) {
            console.log("[STORY_BG] Trying Pexels...");
            const searchTheme = theme || (type === "cover" ? "cityscape" : type === "summary" ? "travel scenery" : "travel");

            imageUrl = await getPexelsThemedImage(city, searchTheme, excludeUrls);
            if (imageUrl) {
                source = "pexels";
                console.log("[STORY_BG] Pexels image found:", imageUrl.substring(0, 80));
            } else {
                console.log("[STORY_BG] Pexels returned no image for:", { city, searchTheme });
            }
        } else if (!imageUrl) {
            console.log("[STORY_BG] Skipping Pexels (key not available)");
        }

        // DEBUG: When DEBUG_NO_UNSPLASH is set, skip Unsplash to surface real failures
        const debugNoUnsplash = process.env.DEBUG_NO_UNSPLASH === "true";

        if (!imageUrl && debugNoUnsplash) {
            console.error("[STORY_BG] DEBUG: All providers failed, Unsplash disabled for testing", {
                canUseAI,
                imageProvider,
                tier,
                hasGeminiKey: isImagenAvailable(),
                hasSeedreamKey: isSeedreamAvailable(),
                hasTripAdvisorKey: isTripAdvisorAvailable(),
                hasPexelsKey: isPexelsAvailable(),
            });
            return NextResponse.json({
                success: false,
                error: "All image sources failed (Unsplash disabled for debugging)",
                debug: {
                    canUseAI,
                    imageProvider,
                    tier,
                    hasGeminiKey: isImagenAvailable(),
                    hasSeedreamKey: isSeedreamAvailable(),
                    hasTripAdvisorKey: isTripAdvisorAvailable(),
                    hasPexelsKey: isPexelsAvailable(),
                    preferAI,
                    isAnyProviderAvailable: isAnyProviderAvailable(),
                },
            }, { status: 503 });
        }

        // Final fallback to Unsplash (always available)
        if (!imageUrl) {
            console.log("[STORY_BG] Using Unsplash fallback for:", { city, type });
            const searchTheme = theme || "travel landmark";
            imageUrl = getUnsplashThemedImage(city, searchTheme);
            source = "unsplash";
        }

        // Absolute last resort: static placeholder
        if (!imageUrl) {
            console.log("[STORY_BG] All sources failed, using static placeholder");
            imageUrl = "/images/placeholders/story-placeholder.svg";
        }

        console.log("[STORY_BG] Final result:", { source, type, city, imageUrl: imageUrl?.substring(0, 80) });

        return NextResponse.json({
            success: true,
            image: imageUrl,
            source,
            provider: imageProvider,
            cached: false,
            aiAvailable: canUseAI,
            pexelsAvailable: isPexelsAvailable(),
            tripAdvisorAvailable: isTripAdvisorAvailable(),
            // Include debug info so the client can display it
            debug: {
                tier,
                canUseAI,
                imageProvider,
                hasGeminiKey: isImagenAvailable(),
                hasSeedreamKey: isSeedreamAvailable(),
                hasTripAdvisorKey: isTripAdvisorAvailable(),
                hasPexelsKey: isPexelsAvailable(),
                preferAI,
            },
        });
    } catch (error) {
        console.error("[STORY_BG] Error:", error);
        return handleApiError(error, "story-background");
    }
}

// GET endpoint to check available sources
export async function GET() {
    return NextResponse.json({
        sources: {
            ai: isAnyProviderAvailable(),
            gemini: isImagenAvailable(),
            seedream: isSeedreamAvailable(),
            tripadvisor: isTripAdvisorAvailable(),
            pexels: isPexelsAvailable(),
            unsplash: true, // Always available
        },
    });
}
