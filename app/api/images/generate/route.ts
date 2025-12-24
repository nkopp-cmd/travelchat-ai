import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    generateImage,
    generateStoryBackground,
    generateDayBackground,
    generateActivityThumbnail,
    generateItineraryCover,
    isImagenAvailable,
} from "@/lib/imagen";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAndTrackUsage, trackSuccessfulUsage, getUserTier } from "@/lib/usage-tracking";
import { TIER_CONFIGS } from "@/lib/subscription";

// Rate limit: 10 image generations per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
});

type ImageType = "custom" | "story_background" | "day_background" | "activity_thumbnail" | "itinerary_cover";

interface GenerateRequest {
    type: ImageType;
    // For custom prompts
    prompt?: string;
    // For story/day backgrounds
    city?: string;
    theme?: string;
    style?: "vibrant" | "minimal" | "artistic";
    // For day backgrounds
    dayNumber?: number;
    activities?: string[];
    // For activity thumbnails
    activityName?: string;
    category?: string;
    // For itinerary covers
    highlights?: string[];
    days?: number;
    // Caching options
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

        // Check if Imagen is available
        if (!isImagenAvailable()) {
            console.error("[IMAGE_GEN] Imagen not available - API key not configured");
            return NextResponse.json(
                { error: "Image generation is not configured" },
                { status: 503 }
            );
        }

        const body: GenerateRequest = await req.json();
        const { type, cacheKey } = body;

        // Check if user's tier allows AI image generation
        const tier = await getUserTier(userId);
        const tierConfig = TIER_CONFIGS[tier];

        // Allow bypass in development/testing with env variable
        const bypassTierCheck = process.env.BYPASS_IMAGE_TIER_CHECK === "true";

        console.log("[IMAGE_GEN] Request details:", {
            userId,
            tier,
            type,
            bypassTierCheck,
            hasApiKey: !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_AI_API_KEY,
            activityImagesFeature: tierConfig.features.activityImages
        });

        // Check if user can use AI images
        // Pro tier has activityImages: "ai-generated", Premium has "hd"
        // Use aiBackgrounds feature flag which is true for both Pro and Premium
        if (!bypassTierCheck && !tierConfig.features.aiBackgrounds) {
            return NextResponse.json(
                {
                    error: "feature_restricted",
                    message: "AI image generation is a Pro feature.",
                    upgrade: {
                        suggestion: "Upgrade to Pro to generate AI images",
                        tier: "pro",
                        price: TIER_CONFIGS.pro.price,
                    },
                },
                { status: 403 }
            );
        }

        // Check usage limits (skip if bypassing tier checks for testing)
        if (!bypassTierCheck) {
            const { allowed, usage } = await checkAndTrackUsage(userId, "ai_images_generated");

            if (!allowed) {
                return NextResponse.json(
                    {
                        error: "limit_exceeded",
                        message: `You've reached your limit of ${usage.limit} AI images this month.`,
                        usage: {
                            current: usage.currentUsage,
                            limit: usage.limit,
                            resetAt: usage.periodResetAt,
                        },
                        upgrade: tier === "pro" ? {
                            suggestion: "Upgrade to Premium for more AI images",
                            tier: "premium",
                            price: TIER_CONFIGS.premium.price,
                        } : null,
                    },
                    { status: 429 }
                );
            }
        }

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = createSupabaseAdmin();
            const { data: cached } = await supabase.storage
                .from("generated-images")
                .download(`${userId}/${cacheKey}.png`);

            if (cached) {
                const buffer = await cached.arrayBuffer();
                const base64 = Buffer.from(buffer).toString("base64");
                return NextResponse.json({
                    success: true,
                    image: base64,
                    cached: true,
                });
            }
        }

        let imageBase64: string;

        console.log("[IMAGE_GEN] Starting image generation for type:", type);

        switch (type) {
            case "story_background": {
                if (!body.city || !body.theme) {
                    return NextResponse.json(
                        { error: "city and theme are required for story_background" },
                        { status: 400 }
                    );
                }
                console.log("[IMAGE_GEN] Generating story background:", body.city, body.theme);
                imageBase64 = await generateStoryBackground(
                    body.city,
                    body.theme,
                    body.style || "vibrant"
                );
                console.log("[IMAGE_GEN] Story background generated, length:", imageBase64.length);
                break;
            }

            case "day_background": {
                if (!body.city || !body.dayNumber || !body.theme) {
                    return NextResponse.json(
                        { error: "city, dayNumber, and theme are required for day_background" },
                        { status: 400 }
                    );
                }
                console.log("[IMAGE_GEN] Generating day background:", body.city, body.dayNumber, body.theme);
                imageBase64 = await generateDayBackground(
                    body.city,
                    body.dayNumber,
                    body.theme,
                    body.activities || []
                );
                console.log("[IMAGE_GEN] Day background generated, length:", imageBase64.length);
                break;
            }

            case "activity_thumbnail": {
                if (!body.activityName || !body.category || !body.city) {
                    return NextResponse.json(
                        { error: "activityName, category, and city are required for activity_thumbnail" },
                        { status: 400 }
                    );
                }
                imageBase64 = await generateActivityThumbnail(
                    body.activityName,
                    body.category,
                    body.city
                );
                break;
            }

            case "itinerary_cover": {
                if (!body.city || !body.highlights || !body.days) {
                    return NextResponse.json(
                        { error: "city, highlights, and days are required for itinerary_cover" },
                        { status: 400 }
                    );
                }
                imageBase64 = await generateItineraryCover(
                    body.city,
                    body.highlights,
                    body.days
                );
                break;
            }

            case "custom": {
                if (!body.prompt) {
                    return NextResponse.json(
                        { error: "prompt is required for custom image generation" },
                        { status: 400 }
                    );
                }
                const images = await generateImage({ prompt: body.prompt });
                imageBase64 = images[0]?.imageBytes || "";
                break;
            }

            default:
                return NextResponse.json(
                    { error: "Invalid image type" },
                    { status: 400 }
                );
        }

        if (!imageBase64) {
            return NextResponse.json(
                { error: "Failed to generate image" },
                { status: 500 }
            );
        }

        // Cache the image if cacheKey provided
        if (cacheKey) {
            const supabase = createSupabaseAdmin();
            const buffer = Buffer.from(imageBase64, "base64");

            await supabase.storage
                .from("generated-images")
                .upload(`${userId}/${cacheKey}.png`, buffer, {
                    contentType: "image/png",
                    upsert: true,
                });
        }

        // Track successful usage
        await trackSuccessfulUsage(userId, "ai_images_generated");

        return NextResponse.json({
            success: true,
            image: imageBase64,
            cached: false,
        });
    } catch (error) {
        console.error("[IMAGE_GEN] Error details:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined
        });
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to generate image",
                details: error instanceof Error ? error.stack : String(error)
            },
            { status: 500 }
        );
    }
}

// GET endpoint to check if image generation is available
export async function GET() {
    return NextResponse.json({
        available: isImagenAvailable(),
        model: "gemini-2.0-flash-exp",
    });
}
