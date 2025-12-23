import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateStoryBackground, generateDayBackground, isImagenAvailable } from "@/lib/imagen";
import {
    getStoryBackground,
    getPexelsCityImage,
    getPexelsThemedImage,
    getUnsplashCityImage,
    getUnsplashThemedImage,
    isPexelsAvailable,
} from "@/lib/story-backgrounds";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier } from "@/lib/usage-tracking";
import { hasFeature } from "@/lib/subscription";

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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body: StoryBackgroundRequest = await req.json();
        const { type, city, theme, dayNumber, activities, preferAI = true, cacheKey } = body;

        if (!city) {
            return NextResponse.json({ error: "city is required" }, { status: 400 });
        }

        // Check if user can use AI images
        const tier = await getUserTier(userId);
        const canUseAI = preferAI && isImagenAvailable() && hasFeature(tier, 'activityImages') === 'ai-generated';

        console.log("[STORY_BG] Request:", {
            type,
            city,
            theme,
            dayNumber,
            preferAI,
            canUseAI,
            tier,
            hasGeminiKey: isImagenAvailable(),
            hasPexelsKey: isPexelsAvailable(),
        });

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = createSupabaseAdmin();
            const { data: cached } = await supabase.storage
                .from("generated-images")
                .download(`story-backgrounds/${cacheKey}.png`);

            if (cached) {
                const buffer = await cached.arrayBuffer();
                const base64 = Buffer.from(buffer).toString("base64");
                console.log("[STORY_BG] Returning cached image");
                return NextResponse.json({
                    success: true,
                    image: `data:image/png;base64,${base64}`,
                    source: "cache",
                    cached: true,
                });
            }
        }

        let imageUrl: string | null = null;
        let source: "ai" | "pexels" | "unsplash" = "unsplash";

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
                    imageUrl = `data:image/png;base64,${aiImage}`;
                    source = "ai";
                    console.log("[STORY_BG] AI generation successful");

                    // Cache the AI-generated image if cacheKey provided
                    if (cacheKey) {
                        const supabase = createSupabaseAdmin();
                        const buffer = Buffer.from(aiImage, "base64");
                        await supabase.storage
                            .from("generated-images")
                            .upload(`story-backgrounds/${cacheKey}.png`, buffer, {
                                contentType: "image/png",
                                upsert: true,
                            });
                    }
                }
            } catch (error) {
                console.error("[STORY_BG] AI generation failed:", error);
            }
        }

        // Fall back to Pexels if AI not available or failed
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
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to get story background" },
            { status: 500 }
        );
    }
}

// GET endpoint to check available sources
export async function GET() {
    return NextResponse.json({
        sources: {
            ai: isImagenAvailable(),
            pexels: isPexelsAvailable(),
            unsplash: true, // Always available
        },
    });
}
