/**
 * Seedream 4.5 image generation via Bytedance ARK API (ModelArk)
 *
 * Uses the OpenAI-compatible REST endpoint at BytePlus ModelArk.
 * Requires ARK_API_KEY environment variable.
 *
 * API docs: https://docs.byteplus.com/en/docs/ModelArk/1541523
 */

const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const SEEDREAM_MODEL = "seedream-4-5-251128";

if (!ARK_API_KEY) {
    console.warn("ARK_API_KEY is not set. Seedream image generation will be disabled.");
}

interface ArkImageResponse {
    created: number;
    data: Array<{
        url?: string;
        b64_json?: string;
    }>;
    usage?: {
        generated_images: number;
        output_tokens: number;
        total_tokens: number;
    };
}

/**
 * Generate an image using Seedream 4.5 via Bytedance ARK API.
 * Returns base64-encoded image data.
 */
async function generateImage(prompt: string, size: string = "1080x1920"): Promise<string> {
    if (!ARK_API_KEY) {
        throw new Error("Seedream is not configured. Please add ARK_API_KEY.");
    }

    console.log("[SEEDREAM] Generating image with model:", SEEDREAM_MODEL, "size:", size);

    const response = await fetch(`${ARK_BASE_URL}/images/generations`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ARK_API_KEY}`,
        },
        body: JSON.stringify({
            model: SEEDREAM_MODEL,
            prompt,
            size,
            response_format: "url",
            watermark: false,
            guidance_scale: 2.5,
            n: 1,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown");
        console.error("[SEEDREAM] ARK API error:", response.status, errorText);
        throw new Error(`Seedream API error: ${response.status} ${errorText}`);
    }

    const result: ArkImageResponse = await response.json();

    if (!result.data || result.data.length === 0) {
        throw new Error("No images returned from Seedream");
    }

    const imageEntry = result.data[0];

    // If we got base64 directly, return it
    if (imageEntry.b64_json) {
        console.log("[SEEDREAM] Got base64 directly, length:", imageEntry.b64_json.length);
        return imageEntry.b64_json;
    }

    // Otherwise fetch the URL (URLs expire after 24h, so download immediately)
    if (!imageEntry.url) {
        throw new Error("No image URL or base64 in Seedream response");
    }

    console.log("[SEEDREAM] Image generated, fetching from URL...");
    const imageResponse = await fetch(imageEntry.url);
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch Seedream image: ${imageResponse.status}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log("[SEEDREAM] Image fetched, base64 length:", base64.length);
    return base64;
}

/**
 * Generate a travel/city themed background image for stories
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

    return generateImage(prompt, "1440x2560");
}

/**
 * Generate a day-specific background for story slides
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

    return generateImage(prompt, "1440x2560");
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

    return generateImage(prompt, "1024x1024");
}

/**
 * Check if Seedream (via Bytedance ARK API) is available
 */
export function isSeedreamAvailable(): boolean {
    return !!ARK_API_KEY;
}
