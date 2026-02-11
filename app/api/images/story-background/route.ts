import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateStoryBackground, generateDayBackground, isImagenAvailable } from "@/lib/imagen";

// AI image generation via Gemini can take 10-20s per image
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
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier } from "@/lib/usage-tracking";
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
        const { type, city, theme, dayNumber, activities, preferAI = true, cacheKey } = body;

        if (!city) {
            return Errors.validationError("city is required");
        }

        // Check if user can use AI images
        // Pro tier has activityImages: "ai-generated", Premium has "hd"
        // Use aiBackgrounds feature flag which is true for both Pro and Premium
        const tier = await getUserTier(userId);
        const canUseAI = preferAI && isImagenAvailable() && hasFeature(tier, 'aiBackgrounds');

        console.log("[STORY_BG] Request:", {
            type,
            city,
            theme,
            dayNumber,
            preferAI,
            canUseAI,
            tier,
            hasGeminiKey: isImagenAvailable(),
            hasTripAdvisorKey: isTripAdvisorAvailable(),
            hasPexelsKey: isPexelsAvailable(),
        });

        // Generate a storage key for this background
        const storageKey = cacheKey
            ? `story-backgrounds/${cacheKey}.png`
            : `story-backgrounds/${userId}/${type}${dayNumber ? `-day${dayNumber}` : ''}-${Date.now()}.png`;

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = await createSupabaseServerClient();
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
        if (canUseAI) {
            try {
                console.log("[STORY_BG] Attempting AI generation...");
                let aiImage: string | null = null;

                if (type === "day" && dayNumber) {
                    aiImage = await generateDayBackground(
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

                    aiImage = await generateStoryBackground(city, bgTheme, "vibrant");
                }

                if (aiImage) {
                    source = "ai";
                    console.log("[STORY_BG] AI generation successful, uploading to storage...");

                    // Always upload AI images to Supabase Storage and return URL
                    // This avoids passing huge base64 strings through the database
                    const supabase = await createSupabaseServerClient();
                    const buffer = Buffer.from(aiImage, "base64");
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
                        console.error("[STORY_BG] Storage upload failed:", uploadError);
                        // Fallback to base64 if upload fails
                        imageUrl = `data:image/png;base64,${aiImage}`;
                    }
                }
            } catch (error) {
                console.error("[STORY_BG] AI generation failed:", error);
            }
        }

        // Fall back to TripAdvisor for real location photos
        if (!imageUrl && isTripAdvisorAvailable()) {
            console.log("[STORY_BG] Trying TripAdvisor...");
            const searchTheme = theme || (type === "cover" ? "landmark" : type === "summary" ? "scenery" : "travel");

            imageUrl = await getTripAdvisorThemedImage(city, searchTheme);
            if (imageUrl) {
                source = "tripadvisor";
                console.log("[STORY_BG] TripAdvisor image found");
            }
        }

        // Fall back to Pexels if TripAdvisor not available or failed
        if (!imageUrl && isPexelsAvailable()) {
            console.log("[STORY_BG] Trying Pexels...");
            const searchTheme = theme || (type === "cover" ? "cityscape" : type === "summary" ? "travel scenery" : "travel");

            imageUrl = await getPexelsThemedImage(city, searchTheme);
            if (imageUrl) {
                source = "pexels";
                console.log("[STORY_BG] Pexels image found");
            }
        }

        // Final fallback to Unsplash (always available)
        if (!imageUrl) {
            console.log("[STORY_BG] Using Unsplash fallback");
            const searchTheme = theme || "travel landmark";
            imageUrl = getUnsplashThemedImage(city, searchTheme);
            source = "unsplash";
        }

        return NextResponse.json({
            success: true,
            image: imageUrl,
            source,
            cached: false,
            aiAvailable: canUseAI,
            pexelsAvailable: isPexelsAvailable(),
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
            ai: isImagenAvailable(),
            tripadvisor: isTripAdvisorAvailable(),
            pexels: isPexelsAvailable(),
            unsplash: true, // Always available
        },
    });
}
