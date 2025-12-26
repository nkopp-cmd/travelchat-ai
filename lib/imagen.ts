import { GoogleGenAI } from "@google/genai";

// Support both GEMINI_API_KEY (official) and GOOGLE_AI_API_KEY (legacy)
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
    console.warn("GEMINI_API_KEY or GOOGLE_AI_API_KEY is not set. Image generation will be disabled.");
}

// Gemini model with native image generation
// Options:
// - "gemini-2.5-flash-image" - Current recommended model for image generation
// - "gemini-3-pro-image-preview" - Advanced model (higher quality, higher cost)
// Using the flash image model which is optimized for image generation
const IMAGE_MODEL = "gemini-2.5-flash-image";

// Create Google GenAI client
const getGoogleAI = () => {
    if (!apiKey) {
        throw new Error("Google AI API key is not configured");
    }
    return new GoogleGenAI({ apiKey });
};

export interface ImageGenerationOptions {
    prompt: string;
    aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

export interface GeneratedImage {
    imageBytes: string; // base64 encoded
    mimeType: string;
}

/**
 * Generate images using Gemini's native image generation (Nano Banana)
 * @param options - Image generation options
 * @returns Array of generated images as base64
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
    const { prompt, aspectRatio } = options;

    if (!apiKey) {
        throw new Error("Image generation is not configured. Please add GEMINI_API_KEY or GOOGLE_AI_API_KEY.");
    }

    const ai = getGoogleAI();

    try {
        // Use generateContent with responseModalities for image generation
        // Per docs: responseModalities should be ['TEXT', 'IMAGE'] (uppercase)
        const config: Record<string, unknown> = {
            responseModalities: ['TEXT', 'IMAGE'], // Enable both text and image output
        };

        console.log("[IMAGEN] Generating image with model:", IMAGE_MODEL, "config:", JSON.stringify(config));

        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [prompt],
            config: config,
        });

        const images: GeneratedImage[] = [];

        // Extract images from response
        // The response structure has candidates array with content.parts
        if (response.candidates && response.candidates.length > 0) {
            for (const candidate of response.candidates) {
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                            const imageData = part.inlineData.data || "";
                            console.log("[IMAGEN] Generated image:", {
                                mimeType: part.inlineData.mimeType,
                                dataLength: imageData.length,
                                requestedAspectRatio: aspectRatio
                            });
                            images.push({
                                imageBytes: imageData,
                                mimeType: part.inlineData.mimeType || "image/png",
                            });
                        }
                    }
                }
            }
        }

        if (images.length === 0) {
            // Log the full response for debugging
            console.error("[IMAGEN] No images in response. Full response:", JSON.stringify(response, null, 2));
            throw new Error("No images were generated - check model response format");
        }

        return images;
    } catch (error) {
        // Enhanced error logging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorDetails = error instanceof Error && 'cause' in error ? (error as Error & { cause?: unknown }).cause : null;
        console.error("[IMAGEN] Image generation failed:", {
            error: errorMessage,
            cause: errorDetails,
            model: IMAGE_MODEL,
        });
        throw error;
    }
}

/**
 * Generate a travel/city themed background image for stories
 * Optimized for 9:16 aspect ratio (1080x1920 Instagram/TikTok stories)
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

    // Enhanced prompt optimized for Gemini image generation
    const prompt = `Professional travel photograph of ${city}: ${theme}.

Scene: Breathtaking view of ${city}'s most iconic and recognizable landmark or scenery.
Mood: ${styleDescriptions[style]}, inviting wanderlust feeling.
Technical: Shot on Sony A7R IV, 24mm wide angle lens, f/8 aperture, perfect exposure.
Composition: Vertical portrait orientation 9:16, rule of thirds, strong leading lines.
Lighting: Golden hour natural light, warm tones, soft shadows, atmospheric haze.
Quality: 8K resolution, tack sharp focus, vibrant but realistic colors, HDR dynamic range.

STRICT REQUIREMENTS:
- NO text, words, letters, or watermarks anywhere
- NO people or crowds visible
- NO logos or brand names
- Pure landscape/cityscape photography only
- Must be instantly recognizable as ${city}`;

    const images = await generateImage({
        prompt,
        aspectRatio: "9:16"
    });
    return images[0]?.imageBytes || "";
}

/**
 * Generate a day-specific background for story slides
 * Shows activities and atmosphere for that day's theme
 */
export async function generateDayBackground(
    city: string,
    dayNumber: number,
    theme: string,
    activities: string[]
): Promise<string> {
    const activityContext = activities.slice(0, 3).join(", ");

    const prompt = `Professional travel photograph showcasing Day ${dayNumber} in ${city}: ${theme}.

Scene: Beautiful atmospheric shot representing ${activityContext} in ${city}.
Style: Warm inviting travel photography, Instagram-worthy composition, editorial quality.
Mood: Exciting adventure feeling, discovery and exploration vibes.
Technical: Shot on professional camera, perfect exposure, sharp details.
Composition: Vertical 9:16 portrait, balanced framing, depth and layers.
Lighting: Natural ambient light, warm color temperature, subtle vignette.

STRICT REQUIREMENTS:
- NO text, words, letters, or watermarks
- NO people or crowds visible
- NO logos or brand names
- Pure scenic/architectural photography
- Evokes the feeling of ${theme}`;

    const images = await generateImage({
        prompt,
        aspectRatio: "9:16"
    });
    return images[0]?.imageBytes || "";
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

    // Enhanced prompt with composition guidance for consistent quality
    const prompt = `A beautiful photograph of ${activityName} in ${city}, showing ${categoryContext}.
Composition: square 1:1 format, shot with professional camera, centered subject.
Style: professional travel photography, vibrant but natural colors, inviting atmosphere.
Quality: high resolution, sharp focus, Instagram-worthy.
Important: NO text overlays, NO watermarks, NO logos. Pure photography only.`;

    const images = await generateImage({
        prompt,
        aspectRatio: "1:1" // Square thumbnails for cards
    });
    return images[0]?.imageBytes || "";
}

/**
 * Generate an itinerary cover image
 */
export async function generateItineraryCover(
    city: string,
    highlights: string[],
    days: number
): Promise<string> {
    const highlightText = highlights.slice(0, 3).join(", ");

    const prompt = `A stunning travel cover image for a ${days}-day trip to ${city}. The image should evoke ${highlightText}. Beautiful landscape or cityscape, professional travel photography, Instagram-worthy, vibrant colors, no text or people.`;

    const images = await generateImage({
        prompt,
        aspectRatio: "9:16" // Match story format for consistency
    });
    return images[0]?.imageBytes || "";
}

/**
 * Check if Imagen is available (API key configured)
 */
export function isImagenAvailable(): boolean {
    return !!apiKey;
}
