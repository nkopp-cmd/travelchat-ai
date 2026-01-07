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
import { createSupabaseServerClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAndIncrementUsage, getUserTier } from "@/lib/usage-tracking";
import { TIER_CONFIGS } from "@/lib/subscription";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";

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
            return Errors.unauthorized();
        }

        // Check if Imagen is available
        if (!isImagenAvailable()) {
            console.error("[IMAGE_GEN] Imagen not available - API key not configured");
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Image generation is not configured");
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
        if (!bypassTierCheck && !tierConfig.features.aiBackgrounds) {
            return Errors.featureRestricted("AI image generation", "pro");
        }

        // Atomic check and increment (skip if bypassing tier checks for testing)
        if (!bypassTierCheck) {
            const { allowed, usage } = await checkAndIncrementUsage(userId, "ai_images_generated");

            if (!allowed) {
                return Errors.limitExceeded(
                    "AI images",
                    usage.currentUsage,
                    usage.limit,
                    usage.periodResetAt
                );
            }
        }

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = await createSupabaseServerClient();
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
                    return Errors.validationError("city and theme are required for story_background");
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
                    return Errors.validationError("city, dayNumber, and theme are required for day_background");
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
                    return Errors.validationError("activityName, category, and city are required for activity_thumbnail");
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
                    return Errors.validationError("city, highlights, and days are required for itinerary_cover");
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
                    return Errors.validationError("prompt is required for custom image generation");
                }
                const images = await generateImage({ prompt: body.prompt });
                imageBase64 = images[0]?.imageBytes || "";
                break;
            }

            default:
                return Errors.validationError("Invalid image type");
        }

        if (!imageBase64) {
            return Errors.externalServiceError("image generation");
        }

        // Cache the image if cacheKey provided
        if (cacheKey) {
            const supabase = await createSupabaseServerClient();
            const buffer = Buffer.from(imageBase64, "base64");

            await supabase.storage
                .from("generated-images")
                .upload(`${userId}/${cacheKey}.png`, buffer, {
                    contentType: "image/png",
                    upsert: true,
                });
        }

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
        return handleApiError(error, "image-generate");
    }
}

// GET endpoint to check if image generation is available
export async function GET() {
    return NextResponse.json({
        available: isImagenAvailable(),
        model: "gemini-2.0-flash-exp",
    });
}
