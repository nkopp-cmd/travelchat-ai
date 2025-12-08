import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    generateImage,
    generateStoryBackground,
    generateActivityThumbnail,
    generateItineraryCover,
    isImagenAvailable,
} from "@/lib/imagen";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

// Rate limit: 10 image generations per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
});

type ImageType = "custom" | "story_background" | "activity_thumbnail" | "itinerary_cover";

interface GenerateRequest {
    type: ImageType;
    // For custom prompts
    prompt?: string;
    // For story backgrounds
    city?: string;
    theme?: string;
    style?: "vibrant" | "minimal" | "artistic";
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
            return NextResponse.json(
                { error: "Image generation is not configured" },
                { status: 503 }
            );
        }

        const body: GenerateRequest = await req.json();
        const { type, cacheKey } = body;

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

        switch (type) {
            case "story_background": {
                if (!body.city || !body.theme) {
                    return NextResponse.json(
                        { error: "city and theme are required for story_background" },
                        { status: 400 }
                    );
                }
                imageBase64 = await generateStoryBackground(
                    body.city,
                    body.theme,
                    body.style || "vibrant"
                );
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

        return NextResponse.json({
            success: true,
            image: imageBase64,
            cached: false,
        });
    } catch (error) {
        console.error("Image generation error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to generate image",
            },
            { status: 500 }
        );
    }
}

// GET endpoint to check if image generation is available
export async function GET() {
    return NextResponse.json({
        available: isImagenAvailable(),
        model: "imagen-3.0-generate-002",
    });
}
