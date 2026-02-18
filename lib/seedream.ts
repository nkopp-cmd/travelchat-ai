import { fal } from "@fal-ai/client";

const apiKey = process.env.FAL_KEY;

if (!apiKey) {
    console.warn("FAL_KEY is not set. FLUX image generation will be disabled.");
}

// Configure fal.ai client
if (apiKey) {
    fal.config({ credentials: apiKey });
}

// FLUX 2 Flex — text-to-image with enhanced typography and rendering
const FLUX_MODEL = "fal-ai/flux-2-flex";

interface FluxResult {
    images: Array<{
        url: string;
        content_type: string;
        width: number;
        height: number;
    }>;
    seed: number;
}

/**
 * Generate an image using FLUX 2 Flex via fal.ai
 * Returns base64-encoded image data
 */
async function generateImage(prompt: string, aspectRatio: "9:16" | "1:1" | "16:9" = "9:16"): Promise<string> {
    if (!apiKey) {
        throw new Error("FLUX is not configured. Please add FAL_KEY.");
    }

    // Map aspect ratios to fal.ai image_size values
    const imageSizeMap = {
        "9:16": { width: 1080, height: 1920 } as const,
        "1:1": "square_hd" as const,
        "16:9": "landscape_16_9" as const,
    };

    const imageSize = imageSizeMap[aspectRatio] || ({ width: 1080, height: 1920 } as const);

    console.log("[FLUX] Generating image with model:", FLUX_MODEL, "size:", imageSize);

    const result = await fal.subscribe(FLUX_MODEL, {
        input: {
            prompt,
            image_size: imageSize as { width: number; height: number },
            output_format: "jpeg",
            guidance_scale: 3.5,
            num_inference_steps: 28,
            enable_safety_checker: true,
            enable_prompt_expansion: true,
        },
        logs: true,
        onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS" && update.logs) {
                update.logs.map((log) => log.message).forEach((msg) =>
                    console.log("[FLUX] Progress:", msg)
                );
            }
        },
    }) as unknown as FluxResult;

    if (!result.images || result.images.length === 0) {
        throw new Error("No images returned from FLUX");
    }

    const imageUrl = result.images[0].url;
    console.log("[FLUX] Image generated, fetching from URL...");

    // Fetch the image and convert to base64
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch FLUX image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log("[FLUX] Image fetched, base64 length:", base64.length);
    return base64;
}

/**
 * Generate a travel/city themed background image for stories
 * Matches the same signature as imagen.ts generateStoryBackground
 */
export async function generateStoryBackground(
    city: string,
    theme: string,
    style: "vibrant" | "minimal" | "artistic" = "vibrant"
): Promise<string> {
    const styleDescriptions = {
        vibrant: "rich saturated colors, golden hour warm lighting, professional DSLR quality",
        minimal: "clean elegant composition, soft natural lighting, modern aesthetic",
        artistic: "cinematic color grading, dramatic atmosphere, editorial photography style",
    };

    const prompt = `Professional travel photograph of ${city}: ${theme}.
Breathtaking view of ${city}'s most iconic landmark or scenery.
${styleDescriptions[style]}, inviting wanderlust feeling.
Shot on professional camera, 24mm wide angle, perfect exposure.
Vertical portrait orientation, rule of thirds, strong leading lines.
Golden hour natural light, warm tones, atmospheric haze.
8K resolution, tack sharp focus, vibrant realistic colors, HDR.
NO text, words, letters, watermarks. NO people or crowds. NO logos. Pure landscape/cityscape photography.`;

    return generateImage(prompt, "9:16");
}

/**
 * Generate a day-specific background for story slides
 * Matches the same signature as imagen.ts generateDayBackground
 */
export async function generateDayBackground(
    city: string,
    dayNumber: number,
    theme: string,
    activities: string[]
): Promise<string> {
    const activityContext = activities.slice(0, 3).join(", ");

    const prompt = `Professional travel photograph showcasing Day ${dayNumber} in ${city}: ${theme}.
Beautiful atmospheric shot representing ${activityContext} in ${city}.
Warm inviting travel photography, Instagram-worthy composition, editorial quality.
Exciting adventure feeling, discovery and exploration vibes.
Professional camera, perfect exposure, sharp details.
Vertical portrait, balanced framing, depth and layers.
Natural ambient light, warm color temperature.
NO text, words, letters, watermarks. NO people or crowds. NO logos. Pure scenic/architectural photography.`;

    return generateImage(prompt, "9:16");
}

/**
 * Generate a thumbnail image for a travel activity/spot
 */
export async function generateActivityThumbnail(
    activityName: string,
    category: string,
    city: string
): Promise<string> {
    const categoryPrompts: Record<string, string> = {
        restaurant: "delicious food, cozy interior, warm lighting",
        cafe: "coffee shop atmosphere, aesthetic interior, latte art",
        bar: "nightlife ambiance, cocktails, modern bar interior",
        market: "bustling market stalls, local products, vibrant colors",
        temple: "serene temple architecture, traditional design, peaceful",
        park: "lush greenery, natural beauty, outdoor scenery",
        museum: "artistic interior, cultural exhibits, elegant architecture",
        shopping: "trendy shops, fashion displays, modern retail",
        attraction: "iconic landmark, tourist destination, memorable view",
        neighborhood: "charming streets, local architecture, authentic atmosphere",
    };

    const categoryContext = categoryPrompts[category] || "interesting location, travel destination";

    const prompt = `Beautiful photograph of ${activityName} in ${city}, showing ${categoryContext}.
Square format, professional travel photography, vibrant natural colors, inviting atmosphere.
High resolution, sharp focus, Instagram-worthy. NO text overlays, NO watermarks, NO logos.`;

    return generateImage(prompt, "1:1");
}

/**
 * Check if FLUX (via FAL AI) is available (FAL_KEY configured)
 */
export function isSeedreamAvailable(): boolean {
    return !!apiKey;
}
